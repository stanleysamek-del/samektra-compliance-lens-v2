import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage, type Tier } from "@/lib/ai/client";
import { burnAnnotationsOnImage } from "@/lib/ai/burn-annotations";
import type { ContextAnswer } from "@/lib/prompts/compliance";
import type { ComplianceAnalysis } from "@/lib/prompts/types";
import {
  snapshotRatings,
  reapplyRatings,
} from "@/lib/findings/preserve-ratings";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/photos/[id]/reanalyze
 *
 * Re-runs vision analysis on an existing photo with the requested tier
 * (defaults to "deep" = Sonnet 4.5). Replaces findings, what_to_look_for,
 * and not_visible rows for that photo, and logs a new ai_calls entry.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: photoId } = await ctx.params;
  if (!photoId) {
    return NextResponse.json({ ok: false, error: "Missing photo id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    tier?: Tier;
    answers?: ContextAnswer[];
  };
  const tier: Tier = body.tier === "default" ? "default" : "deep";
  const answers: ContextAnswer[] = Array.isArray(body.answers)
    ? body.answers
        .map((a) => ({
          question: String((a as ContextAnswer)?.question ?? "").trim(),
          answer: String((a as ContextAnswer)?.answer ?? "").trim(),
        }))
        .filter((a) => a.question && a.answer)
    : [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  // Fetch the photo + parent inspection. Pull annotations + current findings
  // so we can burn the inspector's markup onto the image before sending it
  // to the AI — that way the AI sees the red circles / arrows / text the
  // inspector drew, and treats them as visual hints.
  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("id, inspection_id, storage_path, photo_location, annotations")
    .eq("id", photoId)
    .maybeSingle();
  if (photoErr || !photo) {
    return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });
  }

  // Existing bboxes (Medium / High) to render alongside annotations.
  const { data: existingFindings } = await supabase
    .from("findings")
    .select(
      "severity, bbox_x1, bbox_y1, bbox_x2, bbox_y2, bbox_stroke_width, bbox_color, bbox_fill, created_at",
    )
    .eq("photo_id", photoId)
    .order("created_at", { ascending: true });
  const burnableBboxes = (existingFindings ?? [])
    .filter(
      (f) =>
        (f.severity === "Medium" || f.severity === "High") &&
        f.bbox_x1 != null &&
        f.bbox_y1 != null &&
        f.bbox_x2 != null &&
        f.bbox_y2 != null,
    )
    .map((f, idx) => ({
      x1: Number(f.bbox_x1),
      y1: Number(f.bbox_y1),
      x2: Number(f.bbox_x2),
      y2: Number(f.bbox_y2),
      color: (f.bbox_color as string | null) ?? null,
      strokeWidth: (f.bbox_stroke_width as number | null) ?? null,
      fill: (f.bbox_fill as string | null) ?? null,
      severity: f.severity as "Low" | "Medium" | "High",
      index: idx,
    }));

  const { data: inspection } = await supabase
    .from("inspections")
    .select("id, status")
    .eq("id", photo.inspection_id)
    .maybeSingle();
  if (!inspection) {
    return NextResponse.json({ ok: false, error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.status === "completed") {
    return NextResponse.json(
      { ok: false, error: "Inspection is finalized" },
      { status: 409 },
    );
  }

  // Pull the bytes back from storage so we can hand them to the AI again.
  const { data: blob, error: dlErr } = await supabase.storage
    .from("photos")
    .download(photo.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json(
      { ok: false, error: `Could not download photo: ${dlErr?.message ?? "unknown"}` },
      { status: 502 },
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  // Buffer return-type widened so sharp's Buffer<ArrayBufferLike> can be
  // reassigned here (Buffer.from(arrayBuffer) infers the narrower
  // Buffer<ArrayBuffer> otherwise).
  let imgBuffer: Buffer = Buffer.from(arrayBuffer);
  let mimeType = blob.type || "image/jpeg";

  // Burn inspector annotations + AI bboxes onto the photo so the AI can SEE
  // what the inspector marked up. No-op when both arrays are empty (returns
  // the original buffer). Always re-encoded as JPEG with EXIF rotation
  // baked in, which also normalizes phone-photo orientation for the AI.
  const photoAnnotations =
    (photo.annotations as import("@/app/inspections/[id]/photos/[photoId]/actions").Annotation[] | null) ??
    [];
  if (photoAnnotations.length > 0 || burnableBboxes.length > 0) {
    try {
      imgBuffer = await burnAnnotationsOnImage(
        imgBuffer,
        photoAnnotations,
        burnableBboxes,
      );
      mimeType = "image/jpeg";
    } catch (err) {
      console.warn("[reanalyze] burn-annotations failed, falling back to raw image:", err);
    }
  }

  const base64 = imgBuffer.toString("base64");

  // ---- Run AI ----
  let analysis: ComplianceAnalysis;
  let aiProvider: "anthropic" | "openai" | "google" = "anthropic";
  let aiModel = "";
  let aiInputTokens = 0;
  let aiOutputTokens = 0;
  let aiCostUsd = 0;
  let aiDurationMs = 0;

  try {
    const result = await analyzeImage(base64, mimeType, tier, answers);
    analysis = result.analysis;
    aiProvider = result.provider;
    aiModel = result.model;
    aiInputTokens = result.usage.inputTokens;
    aiOutputTokens = result.usage.outputTokens;
    aiCostUsd = result.usage.costUsd;
    aiDurationMs = result.durationMs;
  } catch (err) {
    console.error("[reanalyze]", err);
    const message = err instanceof Error ? err.message : "AI re-analysis failed";

    await supabase.from("ai_calls").insert({
      inspection_id: photo.inspection_id,
      photo_id: photo.id,
      provider: aiProvider,
      model: aiModel || "unknown",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: 0,
      status: "error",
      error_message: message,
    });

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // ---- Replace AI-generated findings only; preserve user-authored / edited rows ----
  // A finding is "user-touched" when edited = true. That covers BOTH:
  //   - custom findings inserted via addCustomFinding (edited: true, ai_confidence: null)
  //   - AI findings the inspector subsequently edited via the FindingCard
  // We delete only findings where edited IS NOT true (i.e. raw AI output that the
  // user hasn't touched). Re-analysis then inserts the fresh AI batch alongside.
  // First count what we're keeping so we can surface it in the response.
  const { count: preservedCount } = await supabase
    .from("findings")
    .select("id", { count: "exact", head: true })
    .eq("photo_id", photo.id)
    .eq("edited", true);

  // Snapshot thumbs ratings before delete so we can re-apply them to the
  // new rows by matching title — otherwise re-analyze would silently wipe
  // every thumbs-up / thumbs-down the inspector had set.
  const ratingSnapshot = await snapshotRatings(supabase, photo.id);

  await supabase
    .from("findings")
    .delete()
    .eq("photo_id", photo.id)
    .or("edited.is.null,edited.eq.false");
  await supabase.from("what_to_look_for").delete().eq("photo_id", photo.id);
  await supabase.from("not_visible").delete().eq("photo_id", photo.id);

  if (analysis.violations.length > 0) {
    await supabase.from("findings").insert(
      analysis.violations.map((v) => ({
        inspection_id: photo.inspection_id,
        photo_id: photo.id,
        title: v.title,
        category: v.category,
        code: v.code,
        severity: v.severity,
        description: v.description,
        location: v.location,
        remediation: v.remediation,
        references: v.references,
        bbox_x1: v.coordinates.x1,
        bbox_y1: v.coordinates.y1,
        bbox_x2: v.coordinates.x2,
        bbox_y2: v.coordinates.y2,
        ai_confidence: v.confidence,
      })),
    );
  }
  if (analysis.whatToLookFor.length > 0) {
    await supabase.from("what_to_look_for").insert(
      analysis.whatToLookFor.map((w) => ({
        photo_id: photo.id,
        inspection_id: photo.inspection_id,
        item: w.item,
        details: w.details,
      })),
    );
  }
  if (analysis.notVisible.length > 0) {
    await supabase.from("not_visible").insert(
      analysis.notVisible.map((n) => ({
        photo_id: photo.id,
        inspection_id: photo.inspection_id,
        item: n.item,
        reason: n.reason,
      })),
    );
  }

  // Restore inspector thumbs ratings onto matching new findings by title.
  const restoredRatings = await reapplyRatings(
    supabase,
    photo.id,
    ratingSnapshot,
  );

  // Update raw_analysis on the photo, including any inspector-provided
  // context answers so the UI can surface what was clarified.
  const enrichedAnalysis = answers.length > 0
    ? { ...analysis, contextAnswers: answers }
    : analysis;
  await supabase
    .from("photos")
    .update({
      raw_analysis: enrichedAnalysis,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", photo.id);

  // Log the call
  await supabase.from("ai_calls").insert({
    inspection_id: photo.inspection_id,
    photo_id: photo.id,
    provider: aiProvider,
    model: aiModel,
    input_tokens: aiInputTokens,
    output_tokens: aiOutputTokens,
    cost_usd: aiCostUsd,
    duration_ms: aiDurationMs,
    status: "success",
  });

  return NextResponse.json({
    ok: true,
    tier,
    model: aiModel,
    cost: aiCostUsd,
    findingsCount: analysis.violations.length,
    contextUsed: answers.length,
    preservedUserFindings: preservedCount ?? 0,
    ratingsRestored: restoredRatings,
  });
}
