import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage, type Tier } from "@/lib/ai/client";
import type { ContextAnswer } from "@/lib/prompts/compliance";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

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

  // Fetch the photo + parent inspection
  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("id, inspection_id, storage_path, photo_location")
    .eq("id", photoId)
    .maybeSingle();
  if (photoErr || !photo) {
    return NextResponse.json({ ok: false, error: "Photo not found" }, { status: 404 });
  }

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
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = blob.type || "image/jpeg";

  // ---- Run AI ----
  let analysis: ComplianceAnalysis;
  let aiProvider: "anthropic" | "openai" = "anthropic";
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

  // ---- Replace findings & related rows ----
  await supabase.from("findings").delete().eq("photo_id", photo.id);
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
  });
}
