import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage } from "@/lib/ai/client";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

export const runtime = "nodejs";
export const maxDuration = 90;

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/photos/upload
 *
 * Multipart body:
 *   image          — File (jpeg/png/webp, ≤ 10 MB)
 *   inspection_id  — UUID of the parent inspection
 *   photo_location — optional string
 *
 * Uploads to Supabase Storage, calls the AI, persists photo + findings +
 * what_to_look_for + not_visible + ai_calls. Returns { ok, photoId }.
 *
 * Replaces the previous server action approach (which 400'd intermittently
 * in Next.js 16 due to cross-origin checks during the action invocation).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const inspectionId = String(formData.get("inspection_id") ?? "");
  if (!inspectionId) {
    return NextResponse.json({ ok: false, error: "Missing inspection_id" }, { status: 400 });
  }

  const { data: inspection } = await supabase
    .from("inspections")
    .select("id, status")
    .eq("id", inspectionId)
    .maybeSingle();
  if (!inspection) {
    return NextResponse.json({ ok: false, error: "Inspection not found" }, { status: 404 });
  }
  if (inspection.status === "completed") {
    return NextResponse.json({ ok: false, error: "Inspection is finalized" }, { status: 409 });
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing image" }, { status: 400 });
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: `Unsupported image type ${file.type}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image too large (max 10 MB)" },
      { status: 413 },
    );
  }

  const photoLocation =
    typeof formData.get("photo_location") === "string"
      ? (formData.get("photo_location") as string).trim() || null
      : null;

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const storagePath = `${user.id}/${inspectionId}/${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { error: uploadErr } = await supabase.storage
    .from("photos")
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("[upload] storage", uploadErr);
    return NextResponse.json(
      { ok: false, error: `Storage upload failed: ${uploadErr.message}` },
      { status: 502 },
    );
  }

  // ---- AI analysis with cost tracking ----
  let analysis: ComplianceAnalysis;
  let aiProvider: "anthropic" | "openai" | "google" = "anthropic";
  let aiModel = "";
  let aiInputTokens = 0;
  let aiOutputTokens = 0;
  let aiCostUsd = 0;
  let aiDurationMs = 0;

  try {
    const base64 = Buffer.from(bytes).toString("base64");
    const result = await analyzeImage(base64, file.type);
    analysis = result.analysis;
    aiProvider = result.provider;
    aiModel = result.model;
    aiInputTokens = result.usage.inputTokens;
    aiOutputTokens = result.usage.outputTokens;
    aiCostUsd = result.usage.costUsd;
    aiDurationMs = result.durationMs;
  } catch (err) {
    console.error("[upload] analyze", err);
    const message = err instanceof Error ? err.message : "AI analysis failed";

    await supabase.from("ai_calls").insert({
      inspection_id: inspectionId,
      provider: aiProvider,
      model: aiModel || "unknown",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: 0,
      status: "error",
      error_message: message,
    });

    await supabase.storage.from("photos").remove([storagePath]);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  // ---- Persist photo ----
  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .insert({
      inspection_id: inspectionId,
      storage_path: storagePath,
      width: analysis.image.width,
      height: analysis.image.height,
      photo_location: photoLocation,
      raw_analysis: analysis,
      analyzed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (photoErr || !photo) {
    console.error("[upload] photo insert", photoErr);
    await supabase.storage.from("photos").remove([storagePath]);
    return NextResponse.json(
      { ok: false, error: `Could not save photo: ${photoErr?.message ?? "unknown"}` },
      { status: 502 },
    );
  }

  await supabase.from("ai_calls").insert({
    inspection_id: inspectionId,
    photo_id: photo.id,
    provider: aiProvider,
    model: aiModel,
    input_tokens: aiInputTokens,
    output_tokens: aiOutputTokens,
    cost_usd: aiCostUsd,
    duration_ms: aiDurationMs,
    status: "success",
  });

  if (analysis.violations.length > 0) {
    await supabase.from("findings").insert(
      analysis.violations.map((v) => ({
        inspection_id: inspectionId,
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
        inspection_id: inspectionId,
        item: w.item,
        details: w.details,
      })),
    );
  }
  if (analysis.notVisible.length > 0) {
    await supabase.from("not_visible").insert(
      analysis.notVisible.map((n) => ({
        photo_id: photo.id,
        inspection_id: inspectionId,
        item: n.item,
        reason: n.reason,
      })),
    );
  }

  return NextResponse.json({ ok: true, photoId: photo.id });
}
