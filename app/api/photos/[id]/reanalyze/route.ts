import { persistAnalysis } from "@/lib/jobs/persist-analysis";
import { requireInspectionWrite } from "@/lib/inspection-access";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage, type Tier } from "@/lib/ai/client";
import { burnAnnotationsOnImage } from "@/lib/ai/burn-annotations";
import type { ContextAnswer } from "@/lib/prompts/compliance";
import type { ComplianceAnalysis } from "@/lib/prompts/types";
import { loadChecklistFocus } from "@/lib/checklists/focus";
import { assertAiBudget, settleAiBudget } from "@/lib/ai/budget";

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
    .select("id, inspection_id, storage_path, photo_location, annotations, created_by, analyzed_at")
    .eq("id", photoId)
    .maybeSingle();
  if (photoErr || !photo) {
    return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });
  }

  const access = await requireInspectionWrite(supabase, photo.inspection_id);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

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
    .select("id, status, organization_id")
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

  // Daily AI spend cap — metered against the photo's owner + the org.
  const budget = await assertAiBudget(supabase, {
    userId: user.id,
    orgId: inspection.organization_id as string | null,
    tier: tier,
  });
  if (!budget.ok) {
    return NextResponse.json({ ok: false, error: budget.error }, { status: 429 });
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
  let aiCostComplete = false;
  let aiDurationMs = 0;

  try {
    const checklistFocus = await loadChecklistFocus(supabase, photo.inspection_id);
    const result = await analyzeImage(base64, mimeType, tier, answers, [], [], checklistFocus);
    aiCostComplete = result.costComplete === true;
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

  if (aiCostComplete) await settleAiBudget(budget.reservationId, aiCostUsd);

  const persisted = await persistAnalysis(supabase, photo.id, photo.inspection_id,
    answers.length > 0 ? { ...analysis, contextAnswers: answers } : analysis, true, photo.analyzed_at ?? null);
  if (!persisted.ok) return NextResponse.json({ ok: false, error: persisted.error }, { status: persisted.status });
  const preservedCount = persisted.saved.preservedCount;
  const restoredRatings = 0; // Rated findings retain their IDs and feedback.
  const autoResolvedCount = 0; // Only an inspector can verify missing evidence.

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
    findingsCount: persisted.saved.findingsCount,
    contextUsed: answers.length,
    preservedUserFindings: preservedCount ?? 0,
    ratingsRestored: restoredRatings,
    autoResolvedPunchList: autoResolvedCount,
  });
}
