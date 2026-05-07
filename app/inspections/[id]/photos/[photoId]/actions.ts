"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FindingPatch = {
  title: string;
  category: string;
  code?: string;
  severity: "Low" | "Medium" | "High";
  description?: string;
  location?: string;
  remediation?: string;
  /**
   * Bbox patch. Tri-state semantics:
   *   - undefined  → don't touch the bbox columns
   *   - null       → clear the bbox (set all four columns to NULL)
   *   - object     → write x1/y1/x2/y2 (each must be in [0, 1])
   */
  bbox?: { x1: number; y1: number; x2: number; y2: number } | null;
};

export async function updateFinding(
  findingId: string,
  inspectionId: string,
  patch: FindingPatch,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const update: Record<string, unknown> = {
    title: patch.title,
    category: patch.category,
    code: patch.code || null,
    severity: patch.severity,
    description: patch.description || null,
    location: patch.location || null,
    remediation: patch.remediation || null,
    edited: true,
  };

  if (patch.bbox === null) {
    update.bbox_x1 = null;
    update.bbox_y1 = null;
    update.bbox_x2 = null;
    update.bbox_y2 = null;
  } else if (patch.bbox && typeof patch.bbox === "object") {
    const clamp = (n: number) => Math.max(0, Math.min(1, Number(n)));
    update.bbox_x1 = clamp(patch.bbox.x1);
    update.bbox_y1 = clamp(patch.bbox.y1);
    update.bbox_x2 = clamp(patch.bbox.x2);
    update.bbox_y2 = clamp(patch.bbox.y2);
  }

  const { error } = await supabase
    .from("findings")
    .update(update)
    .eq("id", findingId);

  if (error) {
    console.error("[updateFinding]", error);
  }

  revalidatePath(`/inspections/${inspectionId}`, "page");
}

export async function deleteFinding(findingId: string, inspectionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("findings")
    .delete()
    .eq("id", findingId);

  if (error) {
    console.error("[deleteFinding]", error);
  }

  revalidatePath(`/inspections/${inspectionId}`, "page");
}

export async function deletePhoto(
  photoId: string,
  storagePath: string,
  inspectionId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Findings cascade via photo_id ON DELETE SET NULL — manually clean them up.
  await supabase.from("findings").delete().eq("photo_id", photoId);
  await supabase.from("what_to_look_for").delete().eq("photo_id", photoId);
  await supabase.from("not_visible").delete().eq("photo_id", photoId);
  await supabase.from("photos").delete().eq("id", photoId);
  await supabase.storage.from("photos").remove([storagePath]);

  revalidatePath(`/inspections/${inspectionId}`);
  redirect(`/inspections/${inspectionId}`);
}


/**
 * Insert a manually-entered finding (the inspector saw something the AI
 * missed, or wants to override / add to the AI's call). Uses FormData per
 * the project's convention of avoiding .bind() on server actions in
 * Next.js 16.
 */
export async function addCustomFinding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const photoId = String(formData.get("photo_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const severity = String(formData.get("severity") ?? "Medium");
  const category = String(formData.get("category") ?? "Other");
  const code = String(formData.get("code") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const remediation =
    String(formData.get("remediation") ?? "").trim() || null;
  const referencesRaw = String(formData.get("references") ?? "").trim();
  const references =
    referencesRaw.length > 0
      ? referencesRaw
          .split(/[,;\n]/)
          .map((r) => r.trim())
          .filter(Boolean)
      : null;

  // Optional bbox from the BboxPicker — all four must be present and parse as
  // numbers in [0,1] or we drop the bbox entirely.
  const bx1 = Number(formData.get("bbox_x1"));
  const by1 = Number(formData.get("bbox_y1"));
  const bx2 = Number(formData.get("bbox_x2"));
  const by2 = Number(formData.get("bbox_y2"));
  const bboxValid =
    Number.isFinite(bx1) &&
    Number.isFinite(by1) &&
    Number.isFinite(bx2) &&
    Number.isFinite(by2) &&
    bx2 > bx1 &&
    by2 > by1;

  if (!photoId || !inspectionId || !title) {
    // Bail silently — the form should require these client-side.
    return;
  }

  const validSeverity = ["Low", "Medium", "High"].includes(severity)
    ? severity
    : "Medium";
  const validCategory = [
    "Fire",
    "Electrical",
    "Egress",
    "ADA",
    "Hazmat",
    "InfectionControl",
    "Structural",
    "Other",
  ].includes(category)
    ? category
    : "Other";

  const { error } = await supabase.from("findings").insert({
    photo_id: photoId,
    inspection_id: inspectionId,
    title,
    severity: validSeverity,
    category: validCategory,
    code,
    description,
    location,
    remediation,
    references,
    edited: true,
    ai_confidence: null,
    bbox_x1: bboxValid ? Math.max(0, Math.min(1, bx1)) : null,
    bbox_y1: bboxValid ? Math.max(0, Math.min(1, by1)) : null,
    bbox_x2: bboxValid ? Math.max(0, Math.min(1, bx2)) : null,
    bbox_y2: bboxValid ? Math.max(0, Math.min(1, by2)) : null,
  });

  if (error) {
    console.error("[addCustomFinding]", error);
  }

  revalidatePath(`/inspections/${inspectionId}`, "page");
  revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`, "page");
}
