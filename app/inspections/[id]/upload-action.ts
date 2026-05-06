"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage } from "@/lib/ai/client";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

export type UploadResult =
  | { ok: true; photoId: string }
  | { ok: false; error: string };

export async function uploadAndAnalyzePhoto(
  inspectionId: string,
  formData: FormData,
): Promise<UploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: inspection } = await supabase
    .from("inspections")
    .select("id, status")
    .eq("id", inspectionId)
    .maybeSingle();
  if (!inspection) return { ok: false, error: "Inspection not found" };
  if (inspection.status === "completed") {
    return { ok: false, error: "Inspection is finalized" };
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return { ok: false, error: "Missing image" };
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { ok: false, error: `Unsupported image type ${file.type}` };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "Image too large (max 10 MB)" };
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
    return { ok: false, error: `Storage upload failed: ${uploadErr.message}` };
  }

  // ---- AI analysis with cost tracking ----
  let analysis: ComplianceAnalysis;
  let aiProvider: "anthropic" | "openai" = "anthropic";
  let aiModel = "";
  let aiInputTokens = 0;
  let aiOutputTokens = 0;
  let aiCostUsd = 0;
  let aiDurationMs = 0;
  let aiStatus: "success" | "error" = "success";
  let aiErrorMessage: string | null = null;

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
    aiStatus = "error";
    aiErrorMessage = err instanceof Error ? err.message : "AI analysis failed";

    // Log the failed call so we still see it in the admin dashboard.
    await supabase.from("ai_calls").insert({
      inspection_id: inspectionId,
      provider: aiProvider,
      model: aiModel || "unknown",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      duration_ms: 0,
      status: "error",
      error_message: aiErrorMessage,
    });

    await supabase.storage.from("photos").remove([storagePath]);
    return { ok: false, error: aiErrorMessage };
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
    return {
      ok: false,
      error: `Could not save photo: ${photoErr?.message ?? "unknown"}`,
    };
  }

  // ---- Persist successful AI call (now that we have photo_id) ----
  await supabase.from("ai_calls").insert({
    inspection_id: inspectionId,
    photo_id: photo.id,
    provider: aiProvider,
    model: aiModel,
    input_tokens: aiInputTokens,
    output_tokens: aiOutputTokens,
    cost_usd: aiCostUsd,
    duration_ms: aiDurationMs,
    status: aiStatus,
  });

  // ---- Findings ----
  if (analysis.violations.length > 0) {
    const findingsRows = analysis.violations.map((v) => ({
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
    }));
    const { error: findingsErr } = await supabase
      .from("findings")
      .insert(findingsRows);
    if (findingsErr) {
      console.error("[upload] findings insert", findingsErr);
    }
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

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true, photoId: photo.id };
}
