"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage } from "@/lib/ai/client";
import type { ComplianceAnalysis } from "@/lib/prompts/types";

export type UploadResult =
  | { ok: true; photoId: string }
  | { ok: false; error: string };

/**
 * Server action invoked by the client uploader.
 * 1. Verifies auth + inspection ownership
 * 2. Uploads the file to Supabase Storage (bucket: photos)
 * 3. Calls the AI analyzer
 * 4. Persists photo + findings + whatToLookFor + notVisible
 * 5. Returns the new photo id
 */
export async function uploadAndAnalyzePhoto(
  inspectionId: string,
  formData: FormData,
): Promise<UploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Verify the inspection belongs to this user (RLS will also enforce)
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

  // ---- Storage upload ----
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const storagePath = `${user.id}/${inspectionId}/${filename}`;

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const { error: uploadErr } = await supabase.storage
    .from("photos")
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    console.error("[upload] storage", uploadErr);
    return { ok: false, error: `Storage upload failed: ${uploadErr.message}` };
  }

  // ---- AI analysis ----
  let analysis: ComplianceAnalysis;
  try {
    const base64 = Buffer.from(bytes).toString("base64");
    const result = await analyzeImage(base64, file.type);
    analysis = result.analysis;
  } catch (err) {
    console.error("[upload] analyze", err);
    // Roll back storage if analysis failed so the user can retry cleanly.
    await supabase.storage.from("photos").remove([storagePath]);
    const message =
      err instanceof Error ? err.message : "AI analysis failed";
    return { ok: false, error: message };
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

  // ---- Persist findings ----
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
      // Soft-fail — keep the photo, drop findings.
    }
  }

  // ---- Persist what-to-look-for + not-visible ----
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
