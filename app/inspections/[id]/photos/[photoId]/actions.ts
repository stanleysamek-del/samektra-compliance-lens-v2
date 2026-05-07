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

  // Read photo_id BEFORE updating so we can revalidate the photo page too —
  // otherwise the photo detail page renders with stale findings/bboxes/badges.
  const { data: existing } = await supabase
    .from("findings")
    .select("photo_id")
    .eq("id", findingId)
    .maybeSingle();
  const photoId = (existing?.photo_id as string | null) ?? null;

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
  if (photoId) {
    revalidatePath(
      `/inspections/${inspectionId}/photos/${photoId}`,
      "page",
    );
  }
}

export async function deleteFinding(findingId: string, inspectionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Read photo_id BEFORE deleting so we can revalidate that photo's page,
  // which is what makes the bbox + numbered badge disappear and remaining
  // findings re-number from #1 onward.
  const { data: existing } = await supabase
    .from("findings")
    .select("photo_id")
    .eq("id", findingId)
    .maybeSingle();
  const photoId = (existing?.photo_id as string | null) ?? null;

  const { error } = await supabase
    .from("findings")
    .delete()
    .eq("id", findingId);

  if (error) {
    console.error("[deleteFinding]", error);
  }

  revalidatePath(`/inspections/${inspectionId}`, "page");
  if (photoId) {
    revalidatePath(
      `/inspections/${inspectionId}/photos/${photoId}`,
      "page",
    );
  }
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

/* =====================================================================
 *  Photo annotation layer (rect / circle / arrow / text shapes drawn
 *  by the inspector on top of a photo). Stored as JSONB on photos.
 * ===================================================================== */

export type Annotation = {
  id: string;
  type: "rect" | "circle" | "arrow" | "text";
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text?: string;
  /** Line thickness multiplier — 1 (thin), 2 (medium), 3 (thick). Default 2. */
  strokeWidth?: number;
  /** Text size multiplier — 1 (small), 2 (medium), 3 (large). Default 2. */
  fontSize?: number;
  /** Fill color (hex). Undefined means no fill. Rendered at 25% opacity. */
  fill?: string;
};

/**
 * Persist the inspector-drawn annotation layer for a photo. Replaces the
 * full annotations JSON. The shape array can be empty to clear all
 * annotations on a photo.
 */
export async function updatePhotoAnnotations(
  photoId: string,
  inspectionId: string,
  annotations: Annotation[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clamp = (n: number) => Math.max(0, Math.min(1, Number(n)));
  const cleaned: Annotation[] = (Array.isArray(annotations) ? annotations : [])
    .slice(0, 200)
    .map((a) => ({
      id: String(a.id ?? Math.random().toString(36).slice(2, 10)),
      type:
        a.type === "rect" ||
        a.type === "circle" ||
        a.type === "arrow" ||
        a.type === "text"
          ? a.type
          : "rect",
      color: typeof a.color === "string" ? a.color.slice(0, 16) : "#f87171",
      x1: clamp(a.x1),
      y1: clamp(a.y1),
      x2: clamp(a.x2),
      y2: clamp(a.y2),
      text:
        typeof a.text === "string" && a.text.length > 0
          ? a.text.slice(0, 200)
          : undefined,
      strokeWidth:
        typeof a.strokeWidth === "number" && a.strokeWidth >= 0.5 && a.strokeWidth <= 5
          ? a.strokeWidth
          : 2,
      fontSize:
        typeof a.fontSize === "number" && a.fontSize >= 0.5 && a.fontSize <= 5
          ? a.fontSize
          : 2,
      fill:
        typeof a.fill === "string" && /^#[0-9a-fA-F]{3,8}$/.test(a.fill)
          ? a.fill.slice(0, 16)
          : undefined,
    }));

  const { error } = await supabase
    .from("photos")
    .update({ annotations: cleaned })
    .eq("id", photoId);

  if (error) {
    console.error("[updatePhotoAnnotations]", error);
  }

  revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`, "page");
}


/* =====================================================================
 *  Combined photo-editor save: persists annotations + per-finding bbox
 *  updates in a single round-trip. Used by the unified PhotoEditor.
 *
 *  bboxUpdates entries with bbox=null clear the finding's bbox columns;
 *  finding-bbox deletion does NOT delete the finding itself — the
 *  inspector should remove the finding via the FindingCard if intended.
 * ===================================================================== */

export type FindingBboxPatch = {
  findingId: string;
  bbox: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Optional stroke-width override (1 thin, 2 medium, 3 thick). Undefined means don't change. */
  strokeWidth?: number;
  /**
   * Optional color override. Tri-state: undefined means don't change,
   * null means clear to the severity default, hex string sets it.
   */
  color?: string | null;
  /**
   * Optional fill override. Tri-state: undefined means don't change,
   * null means no fill, hex string sets the fill at 25% opacity.
   */
  fill?: string | null;
};

export async function updatePhotoState(
  photoId: string,
  inspectionId: string,
  annotations: Annotation[],
  bboxUpdates: FindingBboxPatch[],
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Persist annotations (re-uses the cleaning logic from updatePhotoAnnotations).
  const clamp = (n: number) => Math.max(0, Math.min(1, Number(n)));
  const cleanedAnnotations: Annotation[] = (Array.isArray(annotations) ? annotations : [])
    .slice(0, 200)
    .map((a) => ({
      id: String(a.id ?? Math.random().toString(36).slice(2, 10)),
      type:
        a.type === "rect" ||
        a.type === "circle" ||
        a.type === "arrow" ||
        a.type === "text"
          ? a.type
          : "rect",
      color: typeof a.color === "string" ? a.color.slice(0, 16) : "#f87171",
      x1: clamp(a.x1),
      y1: clamp(a.y1),
      x2: clamp(a.x2),
      y2: clamp(a.y2),
      text:
        typeof a.text === "string" && a.text.length > 0
          ? a.text.slice(0, 200)
          : undefined,
      strokeWidth:
        typeof a.strokeWidth === "number" && a.strokeWidth >= 0.5 && a.strokeWidth <= 5
          ? a.strokeWidth
          : 2,
      fontSize:
        typeof a.fontSize === "number" && a.fontSize >= 0.5 && a.fontSize <= 5
          ? a.fontSize
          : 2,
      fill:
        typeof a.fill === "string" && /^#[0-9a-fA-F]{3,8}$/.test(a.fill)
          ? a.fill.slice(0, 16)
          : undefined,
    }));

  await supabase
    .from("photos")
    .update({ annotations: cleanedAnnotations })
    .eq("id", photoId);

  // Apply bbox updates to each affected finding. We mark edited=true so the
  // re-analyze flow preserves these adjustments.
  for (const u of bboxUpdates ?? []) {
    if (!u || !u.findingId) continue;
    const update: Record<string, unknown> = { edited: true };
    if (u.bbox === null) {
      update.bbox_x1 = null;
      update.bbox_y1 = null;
      update.bbox_x2 = null;
      update.bbox_y2 = null;
    } else if (u.bbox && typeof u.bbox === "object") {
      update.bbox_x1 = clamp(u.bbox.x1);
      update.bbox_y1 = clamp(u.bbox.y1);
      update.bbox_x2 = clamp(u.bbox.x2);
      update.bbox_y2 = clamp(u.bbox.y2);
    }
    if (typeof u.strokeWidth === "number" && u.strokeWidth >= 0.5 && u.strokeWidth <= 5) {
      update.bbox_stroke_width = u.strokeWidth;
    }
    if (u.color === null) {
      update.bbox_color = null;
    } else if (typeof u.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(u.color)) {
      update.bbox_color = u.color.slice(0, 16);
    }
    if (u.fill === null) {
      update.bbox_fill = null;
    } else if (typeof u.fill === "string" && /^#[0-9a-fA-F]{3,8}$/.test(u.fill)) {
      update.bbox_fill = u.fill.slice(0, 16);
    }
    if (Object.keys(update).length === 1) {
      // Only "edited: true" present — nothing to write.
      continue;
    }
    await supabase.from("findings").update(update).eq("id", u.findingId);
  }

  revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`, "page");
  revalidatePath(`/inspections/${inspectionId}`, "page");
}
