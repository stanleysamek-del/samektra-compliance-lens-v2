"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Every mutating action in this file returns `{ ok: true } | { ok: false,
 * error }` so the calling component can toast the failure and keep the
 * user's state (the audit's "nothing lies, nothing loses work" rule).
 * Exceptions: finalizeInspection / deleteInspection keep their redirect
 * contract — the detail page reads `?error=` for those.
 */
type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Turn a raw Postgres / PostgREST error into something a facility manager
 * can act on. Anything we don't recognise falls through to the raw message
 * so nothing is hidden.
 */
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
  if (code === "23505") return "That name is already in use.";
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

/**
 * Finalize/reopen an inspection. Reads inspection_id + status from form data
 * (avoiding .bind() — Next.js 16 has been flaky with bound server actions).
 */
export async function finalizeInspection(formData: FormData) {
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!inspectionId) return;
  if (status !== "in_progress" && status !== "completed") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("inspections")
    .update({ status })
    .eq("id", inspectionId);

  if (error) {
    console.error("[finalizeInspection]", error);
    redirect(
      `/inspections/${inspectionId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/inspections/${inspectionId}`);
}

/** Field values the edit form round-trips so a failed save never wipes them. */
export type InspectionEditValues = {
  facility_name: string;
  facility_address: string;
  location: string;
  inspector_name: string;
  manager_assigned: string;
  manager_assigned_email: string;
  date_of_inspection: string;
  date_assigned: string;
};

export type UpdateInspectionState = {
  ok: boolean;
  error: string | null;
  values: InspectionEditValues | null;
};

/**
 * Update inspection metadata. Used by /inspections/[id]/edit through
 * useActionState — on failure the submitted values come back so the form
 * re-renders with what the user typed instead of the DB defaults.
 */
export async function updateInspection(
  _prev: UpdateInspectionState,
  formData: FormData,
): Promise<UpdateInspectionState> {
  const inspectionId = String(formData.get("inspection_id") ?? "");

  const values: InspectionEditValues = {
    facility_name: String(formData.get("facility_name") ?? "").trim(),
    facility_address: String(formData.get("facility_address") ?? ""),
    location: String(formData.get("location") ?? ""),
    inspector_name: String(formData.get("inspector_name") ?? ""),
    manager_assigned: String(formData.get("manager_assigned") ?? ""),
    manager_assigned_email: String(formData.get("manager_assigned_email") ?? ""),
    date_of_inspection: String(formData.get("date_of_inspection") ?? ""),
    date_assigned: String(formData.get("date_assigned") ?? ""),
  };

  if (!inspectionId) {
    return { ok: false, error: "Missing inspection id.", values };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!values.facility_name) {
    return { ok: false, error: "Facility name is required.", values };
  }

  const patch: Record<string, string | null> = {
    facility_name: values.facility_name,
    facility_address: stringOrNull(values.facility_address),
    location: stringOrNull(values.location),
    inspector_name: stringOrNull(values.inspector_name),
    manager_assigned: stringOrNull(values.manager_assigned),
    manager_assigned_email: stringOrNull(values.manager_assigned_email),
    date_of_inspection: stringOrNull(values.date_of_inspection),
    date_assigned: stringOrNull(values.date_assigned),
  };

  const { data, error } = await supabase
    .from("inspections")
    .update(patch)
    .eq("id", inspectionId)
    .select("id");

  if (error) {
    console.error("[updateInspection]", error);
    return { ok: false, error: friendlyError(error), values };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: NO_ROWS, values };
  }

  revalidatePath(`/inspections/${inspectionId}`);
  redirect(`/inspections/${inspectionId}`);
}

/**
 * Permanently delete an inspection plus its photos, findings, and storage
 * objects. RLS scoping ensures users can only delete their own inspections.
 *
 * Used from the history page row menu and the inspection detail page.
 */
export async function deleteInspection(formData: FormData) {
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const redirectTo = String(formData.get("redirect_to") ?? "/inspections/history");
  if (!inspectionId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull every photo so we can clean up storage objects too.
  const { data: photos } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("inspection_id", inspectionId);

  const storagePaths = (photos ?? [])
    .map((p) => p.storage_path)
    .filter((s): s is string => Boolean(s));

  if (storagePaths.length > 0) {
    await supabase.storage.from("photos").remove(storagePaths);
  }

  // CASCADE on the inspections row removes photos, findings, what_to_look_for,
  // not_visible, drawings (per 0001_init.sql FK definitions).
  const { error } = await supabase
    .from("inspections")
    .delete()
    .eq("id", inspectionId);

  if (error) {
    console.error("[deleteInspection]", error);
    redirect(
      `/inspections/history?error=${encodeURIComponent(friendlyError(error))}`,
    );
  }

  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
  redirect(redirectTo);
}

function stringOrNull(v: FormDataEntryValue | string | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/* =====================================================================
 * Signatures — inspector + manager sign-off (columns exist since 0001).
 *
 * The SignaturePad client component uploads the PNG to the `signatures`
 * bucket (owner-path policy: first folder = auth.uid()) and then calls
 * saveSignature with the storage PATH — same convention photos use, so
 * the PDF export downloads it server-side and embeds it.
 * ===================================================================== */

export async function saveSignature(input: {
  inspectionId: string;
  role: "inspector" | "manager";
  storagePath: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The path must live in the caller's own folder — the storage policy
  // enforces this for the upload; re-checking here keeps a forged path
  // from being recorded on the row.
  if (!input.storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, error: "Invalid signature path" };
  }

  const patch =
    input.role === "inspector"
      ? {
          inspector_signature_url: input.storagePath,
          inspector_signed_at: new Date().toISOString(),
        }
      : {
          manager_signature_url: input.storagePath,
          manager_signed_at: new Date().toISOString(),
        };

  const { data, error } = await supabase
    .from("inspections")
    .update(patch)
    .eq("id", input.inspectionId)
    .select("id");

  if (error) {
    console.error("[saveSignature]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${input.inspectionId}`);
  return { ok: true };
}

export async function clearSignature(input: {
  inspectionId: string;
  role: "inspector" | "manager";
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const patch =
    input.role === "inspector"
      ? { inspector_signature_url: null, inspector_signed_at: null }
      : { manager_signature_url: null, manager_signed_at: null };

  const { data, error } = await supabase
    .from("inspections")
    .update(patch)
    .eq("id", input.inspectionId)
    .select("id");

  if (error) {
    console.error("[clearSignature]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${input.inspectionId}`);
  return { ok: true };
}

/* =====================================================================
 * Re-photograph workflow — resolve / unresolve not_visible items.
 *
 * The not_visible table stores per-photo items Chip flagged as
 * un-verifiable from the original angle (e.g., "gauge calibration date
 * not legible"). Each one becomes a row on the inspection-level
 * punch-list. The inspector resolves them as they come back with a
 * better shot.
 * ===================================================================== */

export async function resolveNotVisible(formData: FormData): Promise<ActionResult> {
  const itemId = String(formData.get("item_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const note = stringOrNull(formData.get("note")) ?? null;
  const photoId = stringOrNull(formData.get("resolved_photo_id")) ?? null;
  if (!itemId || !inspectionId) {
    return { ok: false, error: "Missing item or inspection id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("not_visible")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_note: note,
      resolved_photo_id: photoId,
    })
    .eq("id", itemId)
    .select("id");
  if (error) {
    console.error("[resolveNotVisible]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

export async function unresolveNotVisible(formData: FormData): Promise<ActionResult> {
  const itemId = String(formData.get("item_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  if (!itemId || !inspectionId) {
    return { ok: false, error: "Missing item or inspection id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("not_visible")
    .update({
      resolved: false,
      resolved_at: null,
      resolved_note: null,
      resolved_photo_id: null,
    })
    .eq("id", itemId)
    .select("id");
  if (error) {
    console.error("[unresolveNotVisible]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

/**
 * Mark an item as "skipped" — Chip flagged it but the inspector has decided
 * it doesn't need re-photographing (false positive, out of scope, won't fix).
 * Skipped items leave the active to-do list but remain in the DB for audit.
 *
 * Mutually exclusive with resolved: skipping an item also clears any
 * resolution metadata, so we don't end up in a (resolved=true, skipped=true)
 * state.
 */
export async function skipNotVisible(formData: FormData): Promise<ActionResult> {
  const itemId = String(formData.get("item_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const reason = stringOrNull(formData.get("reason")) ?? null;
  if (!itemId || !inspectionId) {
    return { ok: false, error: "Missing item or inspection id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("not_visible")
    .update({
      skipped: true,
      skipped_reason: reason,
      skipped_at: new Date().toISOString(),
      // Clear any prior resolution so the state machine stays clean.
      resolved: false,
      resolved_at: null,
      resolved_note: null,
      resolved_photo_id: null,
    })
    .eq("id", itemId)
    .select("id");
  if (error) {
    console.error("[skipNotVisible]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

/**
 * Reopen a skipped item — sends it back to the active to-do list.
 */
export async function unskipNotVisible(formData: FormData): Promise<ActionResult> {
  const itemId = String(formData.get("item_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  if (!itemId || !inspectionId) {
    return { ok: false, error: "Missing item or inspection id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("not_visible")
    .update({
      skipped: false,
      skipped_reason: null,
      skipped_at: null,
    })
    .eq("id", itemId)
    .select("id");
  if (error) {
    console.error("[unskipNotVisible]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

/* =====================================================================
 * Photo organization — inspection_sections CRUD + photo assignment.
 * ===================================================================== */

/**
 * Create a new section ("Stair B", "Main Corridor", etc.) within an
 * inspection. Sort order auto-appends to the end.
 */
export async function createSection(formData: FormData): Promise<ActionResult> {
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!inspectionId) return { ok: false, error: "Missing inspection id." };
  if (!name) return { ok: false, error: "Section name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Place new section at the end of the existing list.
  const { data: existing } = await supabase
    .from("inspection_sections")
    .select("sort_order")
    .eq("inspection_id", inspectionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (existing?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("inspection_sections").insert({
    inspection_id: inspectionId,
    name: name.slice(0, 120),
    sort_order: nextOrder,
  });
  if (error) {
    console.error("[createSection]", error);
    return { ok: false, error: friendlyError(error) };
  }

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

/**
 * Rename a section in place.
 */
export async function renameSection(formData: FormData): Promise<ActionResult> {
  const sectionId = String(formData.get("section_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!sectionId || !inspectionId) {
    return { ok: false, error: "Missing section or inspection id." };
  }
  if (!name) return { ok: false, error: "Section name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("inspection_sections")
    .update({ name: name.slice(0, 120) })
    .eq("id", sectionId)
    .select("id");
  if (error) {
    console.error("[renameSection]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

/**
 * Delete a section. Photos in that section become Unassigned (FK is set null
 * on delete per migration 0011). Findings/annotations on those photos are
 * unaffected — only the grouping changes.
 */
export async function deleteSection(formData: FormData): Promise<ActionResult> {
  const sectionId = String(formData.get("section_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  if (!sectionId || !inspectionId) {
    return { ok: false, error: "Missing section or inspection id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("inspection_sections")
    .delete()
    .eq("id", sectionId)
    .select("id");
  if (error) {
    console.error("[deleteSection]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

/**
 * Move a section up or down in the ordering. Swaps sort_order with the
 * adjacent section in the requested direction. Simpler than a full
 * reorder API and good enough for ~20 sections.
 *
 * The neighbor query is built conditionally: "down" needs only a lower
 * bound (`sort_order > current`), "up" only an upper bound. The previous
 * version passed ±Infinity for the missing bound, which PostgREST
 * serialised as the string "Infinity" → Postgres 22P02 → the move silently
 * no-op'd for every section.
 */
export async function moveSection(formData: FormData): Promise<ActionResult> {
  const sectionId = String(formData.get("section_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!sectionId || !inspectionId) {
    return { ok: false, error: "Missing section or inspection id." };
  }
  if (direction !== "up" && direction !== "down") {
    return { ok: false, error: "Invalid move direction." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull the current section + its neighbor in the requested direction.
  const { data: current, error: currentErr } = await supabase
    .from("inspection_sections")
    .select("id, sort_order")
    .eq("id", sectionId)
    .maybeSingle();
  if (currentErr) {
    console.error("[moveSection]", currentErr);
    return { ok: false, error: friendlyError(currentErr) };
  }
  if (!current) return { ok: false, error: "That section no longer exists." };

  // Down → the next-higher sort_order (ascending, first row).
  // Up   → the next-lower sort_order (descending, first row).
  const base = supabase
    .from("inspection_sections")
    .select("id, sort_order")
    .eq("inspection_id", inspectionId)
    .neq("id", current.id);
  const bounded =
    direction === "down"
      ? base.gt("sort_order", current.sort_order).order("sort_order", { ascending: true })
      : base.lt("sort_order", current.sort_order).order("sort_order", { ascending: false });
  const { data: neighbor, error: neighborErr } = await bounded.limit(1).maybeSingle();
  if (neighborErr) {
    console.error("[moveSection]", neighborErr);
    return { ok: false, error: friendlyError(neighborErr) };
  }
  if (!neighbor) return { ok: true }; // already at the edge — nothing to do

  // Swap. If both rows share a sort_order (legacy data), nudge so the move
  // is still observable.
  const currentOrder =
    neighbor.sort_order === current.sort_order
      ? direction === "down"
        ? current.sort_order + 1
        : current.sort_order - 1
      : neighbor.sort_order;
  const neighborOrder = current.sort_order;

  const { error: e1 } = await supabase
    .from("inspection_sections")
    .update({ sort_order: currentOrder })
    .eq("id", current.id);
  if (e1) {
    console.error("[moveSection]", e1);
    return { ok: false, error: friendlyError(e1) };
  }
  const { error: e2 } = await supabase
    .from("inspection_sections")
    .update({ sort_order: neighborOrder })
    .eq("id", neighbor.id);
  if (e2) {
    console.error("[moveSection]", e2);
    return { ok: false, error: friendlyError(e2) };
  }

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

/**
 * Assign a single photo to a section (or detach by passing "" / "none").
 * Auto-appends to the end of the destination section's photo list.
 */
export async function assignPhotoToSection(formData: FormData): Promise<ActionResult> {
  const photoId = String(formData.get("photo_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const sectionRaw = String(formData.get("section_id") ?? "");
  const sectionId =
    sectionRaw && sectionRaw !== "none" && sectionRaw !== ""
      ? sectionRaw
      : null;
  if (!photoId || !inspectionId) {
    return { ok: false, error: "Missing photo or inspection id." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Append to end of destination — unassigned bucket OR a specific section.
  // Two queries because Supabase's PostgREST builder doesn't conditionally
  // chain .is() vs .eq() cleanly.
  let nextSortOrder = 0;
  if (sectionId === null) {
    const { data: maxRow } = await supabase
      .from("photos")
      .select("sort_order")
      .eq("inspection_id", inspectionId)
      .is("section_id", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    nextSortOrder = (maxRow?.sort_order ?? -1) + 1;
  } else {
    const { data: maxRow } = await supabase
      .from("photos")
      .select("sort_order")
      .eq("section_id", sectionId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    nextSortOrder = (maxRow?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("photos")
    .update({ section_id: sectionId, sort_order: nextSortOrder })
    .eq("id", photoId)
    .select("id");
  if (error) {
    console.error("[assignPhotoToSection]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidatePath(`/inspections/${inspectionId}`);
  revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`);
  return { ok: true };
}
