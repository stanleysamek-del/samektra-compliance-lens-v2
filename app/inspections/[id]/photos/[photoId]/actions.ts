"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Every mutating action here returns `{ ok: true } | { ok: false, error }`
 * so the calling component can toast the failure and keep the user's
 * draft (finding edits, custom findings, annotation drawings). The one
 * exception is deletePhoto, which redirects on success and returns the
 * error shape on any failure.
 */
type ActionResult = { ok: true } | { ok: false; error: string };

function friendlyError(
  err: { code?: string; message?: string } | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!err) return fallback;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied")
  ) {
    return "You don't have permission to change this inspection.";
  }
  if (code === "23505") return "That already exists.";
  if (code === "23503") {
    return "This item is still linked to other records and can't be removed.";
  }
  if (code === "23514" || code === "22P02" || code === "22001") {
    return "Some of the values aren't valid. Check them and try again.";
  }
  if (code === "PGRST116") return "That item no longer exists.";
  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnrefused")
  ) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return err.message || fallback;
}

/** RLS hides rows it denies, so a 0-row update is a permission/missing case. */
const NO_ROWS =
  "Nothing was changed — you may not have permission, or the item no longer exists.";

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
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = (patch.title ?? "").trim();
  if (!title) return { ok: false, error: "A finding needs a title." };

  // Read photo_id BEFORE updating so we can revalidate the photo page too —
  // otherwise the photo detail page renders with stale findings/bboxes/badges.
  const { data: existing } = await supabase
    .from("findings")
    .select("photo_id")
    .eq("id", findingId)
    .maybeSingle();
  const photoId = (existing?.photo_id as string | null) ?? null;

  const update: Record<string, unknown> = {
    title,
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

  const { data, error } = await supabase
    .from("findings")
    .update(update)
    .eq("id", findingId)
    .select("id");

  if (error) {
    console.error("[updateFinding]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`, "page");
  if (photoId) {
    revalidatePath(
      `/inspections/${inspectionId}/photos/${photoId}`,
      "page",
    );
  }
  return { ok: true };
}

/**
 * Set or clear the inspector's thumbs-up/down on a finding. The rating is
 * NOT a destructive edit — it doesn't flip the `edited` flag, so a thumbs-up
 * on an AI finding doesn't lock it out of being replaced on a subsequent
 * re-analysis. (Inspector edits to the finding's CONTENT still set edited.)
 *
 * Ratings are read by the Coach API when building the prompt context so the
 * AI sees which prior findings the inspector liked vs disliked.
 */
export async function rateFinding(
  findingId: string,
  inspectionId: string,
  rating: 1 | -1 | null,
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("findings")
    .select("photo_id")
    .eq("id", findingId)
    .maybeSingle();
  const photoId = (existing?.photo_id as string | null) ?? null;

  const { data, error } = await supabase
    .from("findings")
    .update({
      user_rating: rating,
      user_feedback_note: rating === null ? null : (note ?? null),
    })
    .eq("id", findingId)
    .select("id");

  if (error) {
    console.error("[rateFinding]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`, "page");
  if (photoId) {
    revalidatePath(
      `/inspections/${inspectionId}/photos/${photoId}`,
      "page",
    );
  }
  return { ok: true };
}

export async function deleteFinding(
  findingId: string,
  inspectionId: string,
): Promise<ActionResult> {
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

  const { data, error } = await supabase
    .from("findings")
    .delete()
    .eq("id", findingId)
    .select("id");

  if (error) {
    console.error("[deleteFinding]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`, "page");
  if (photoId) {
    revalidatePath(
      `/inspections/${inspectionId}/photos/${photoId}`,
      "page",
    );
  }
  return { ok: true };
}

/**
 * Delete a photo and everything hanging off it (findings, what-to-look-for,
 * not-visible rows, the storage object).
 *
 * CONTRACT (the photo page's confirm button depends on it):
 *   - success → redirect to the inspection page
 *   - ANY failure → return `{ ok: false, error }` and do NOT redirect
 *
 * The storage path is looked up here rather than trusted from the client,
 * so a forged path can never delete somebody else's object.
 */
export async function deletePhoto(
  photoId: string,
  inspectionId: string,
): Promise<{ ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: photo, error: photoErr } = await supabase
    .from("photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (photoErr) {
    console.error("[deletePhoto] lookup", photoErr);
    return { ok: false, error: friendlyError(photoErr) };
  }
  if (!photo) {
    return {
      ok: false,
      error: "That photo no longer exists, or you don't have access to it.",
    };
  }

  // Findings cascade via photo_id ON DELETE SET NULL — manually clean them up.
  const dependents: Array<["findings" | "what_to_look_for" | "not_visible", string]> = [
    ["findings", "findings"],
    ["what_to_look_for", "what-to-look-for items"],
    ["not_visible", "re-photograph items"],
  ];
  for (const [table, label] of dependents) {
    const { error } = await supabase.from(table).delete().eq("photo_id", photoId);
    if (error) {
      console.error(`[deletePhoto] ${table}`, error);
      return {
        ok: false,
        error: `Couldn't remove the photo's ${label}: ${friendlyError(error)}`,
      };
    }
  }

  const { data: deleted, error: delErr } = await supabase
    .from("photos")
    .delete()
    .eq("id", photoId)
    .select("id");
  if (delErr) {
    console.error("[deletePhoto] photos", delErr);
    return { ok: false, error: friendlyError(delErr) };
  }
  if (!deleted || deleted.length === 0) {
    return {
      ok: false,
      error: "You don't have permission to delete this photo.",
    };
  }

  // Storage cleanup is best-effort: the row is gone, so the report is
  // already correct. Log but don't fail — an orphaned object is harmless.
  const storagePath = (photo.storage_path as string | null) ?? null;
  if (storagePath) {
    const { error: storageErr } = await supabase.storage
      .from("photos")
      .remove([storagePath]);
    if (storageErr) console.error("[deletePhoto] storage", storageErr);
  }

  revalidatePath(`/inspections/${inspectionId}`);
  redirect(`/inspections/${inspectionId}`);
}

/**
 * Insert a manually-entered finding (the inspector saw something the AI
 * missed, or wants to override / add to the AI's call). Uses FormData per
 * the project's convention of avoiding .bind() on server actions in
 * Next.js 16.
 */
export async function addCustomFinding(formData: FormData): Promise<ActionResult> {
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

  if (!photoId || !inspectionId) {
    return { ok: false, error: "Missing photo or inspection id." };
  }
  if (!title) return { ok: false, error: "A finding needs a title." };

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
    return { ok: false, error: friendlyError(error) };
  }

  revalidatePath(`/inspections/${inspectionId}`, "page");
  revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`, "page");
  return { ok: true };
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

/** Shared sanitiser for the annotation JSON — used by both persist paths. */
function cleanAnnotations(annotations: Annotation[]): Annotation[] {
  const clamp = (n: number) => Math.max(0, Math.min(1, Number(n)));
  return (Array.isArray(annotations) ? annotations : [])
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
}

/**
 * Persist the inspector-drawn annotation layer for a photo. Replaces the
 * full annotations JSON. The shape array can be empty to clear all
 * annotations on a photo.
 */
export async function updatePhotoAnnotations(
  photoId: string,
  inspectionId: string,
  annotations: Annotation[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("photos")
    .update({ annotations: cleanAnnotations(annotations) })
    .eq("id", photoId)
    .select("id");

  if (error) {
    console.error("[updatePhotoAnnotations]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`, "page");
  return { ok: true };
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
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clamp = (n: number) => Math.max(0, Math.min(1, Number(n)));

  const { data: photoRows, error: annErr } = await supabase
    .from("photos")
    .update({ annotations: cleanAnnotations(annotations) })
    .eq("id", photoId)
    .select("id");
  if (annErr) {
    console.error("[updatePhotoState] annotations", annErr);
    return { ok: false, error: friendlyError(annErr) };
  }
  if (!photoRows || photoRows.length === 0) return { ok: false, error: NO_ROWS };

  // Apply bbox updates to each affected finding. We mark edited=true so the
  // re-analyze flow preserves these adjustments.
  const failed: string[] = [];
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
    const { error } = await supabase
      .from("findings")
      .update(update)
      .eq("id", u.findingId);
    if (error) {
      console.error("[updatePhotoState] finding", u.findingId, error);
      failed.push(friendlyError(error));
    }
  }

  revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`, "page");
  revalidatePath(`/inspections/${inspectionId}`, "page");

  if (failed.length > 0) {
    // Annotations landed but some finding boxes didn't — say so honestly so
    // the inspector can retry rather than assume everything saved.
    return {
      ok: false,
      error: `Your drawings were saved, but ${failed.length} finding box${
        failed.length === 1 ? "" : "es"
      } didn't update: ${failed[0]}`,
    };
  }
  return { ok: true };
}
