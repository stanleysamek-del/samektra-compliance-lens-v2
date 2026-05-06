import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateContextQuestions } from "@/lib/ai/client";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/photos/[id]/deep-questions
 *
 * Pass 1 of the deep-analysis flow: asks Sonnet 4.5 what clarifying
 * questions it needs answered before producing final findings. Returns
 * a `questions` array; the client renders them and POSTs answers to
 * /api/photos/[id]/reanalyze.
 *
 * Logs an ai_calls row for cost tracking.
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: photoId } = await ctx.params;
  if (!photoId) {
    return NextResponse.json(
      { ok: false, error: "Missing photo id" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("id, inspection_id, storage_path")
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
    return NextResponse.json(
      { ok: false, error: "Inspection not found" },
      { status: 404 },
    );
  }
  if (inspection.status === "completed") {
    return NextResponse.json(
      { ok: false, error: "Inspection is finalized" },
      { status: 409 },
    );
  }

  // Download the photo bytes.
  const { data: blob, error: dlErr } = await supabase.storage
    .from("photos")
    .download(photo.storage_path);
  if (dlErr || !blob) {
    return NextResponse.json(
      {
        ok: false,
        error: `Could not download photo: ${dlErr?.message ?? "unknown"}`,
      },
      { status: 502 },
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = blob.type || "image/jpeg";

  try {
    const result = await generateContextQuestions(base64, mimeType);

    // Log the call for cost dashboard.
    await supabase.from("ai_calls").insert({
      inspection_id: photo.inspection_id,
      photo_id: photo.id,
      provider: result.provider,
      model: result.model,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      cost_usd: result.usage.costUsd,
      duration_ms: result.durationMs,
      status: "success",
    });

    return NextResponse.json({
      ok: true,
      questions: result.questions,
      cost: result.usage.costUsd,
      model: result.model,
    });
  } catch (err) {
    console.error("[deep-questions]", err);
    const message = err instanceof Error ? err.message : "Question generation failed";

    await supabase.from("ai_calls").insert({
      inspection_id: photo.inspection_id,
      photo_id: photo.id,
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: 0,
      status: "error",
      error_message: message,
    });

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
