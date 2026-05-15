"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

/**
 * Update inspection metadata. Used by /inspections/[id]/edit.
 */
export async function updateInspection(formData: FormData) {
  const inspectionId = String(formData.get("inspection_id") ?? "");
  if (!inspectionId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const facility_name = String(formData.get("facility_name") ?? "").trim();
  if (!facility_name) {
    redirect(
      `/inspections/${inspectionId}/edit?error=Facility%20name%20is%20required`,
    );
  }

  const patch: Record<string, string | null> = {
    facility_name,
    facility_address: stringOrNull(formData.get("facility_address")),
    location: stringOrNull(formData.get("location")),
    inspector_name: stringOrNull(formData.get("inspector_name")),
    manager_assigned: stringOrNull(formData.get("manager_assigned")),
    manager_assigned_email: stringOrNull(formData.get("manager_assigned_email")),
    date_of_inspection: stringOrNull(formData.get("date_of_inspection")),
    date_assigned: stringOrNull(formData.get("date_assigned")),
  };

  const { error } = await supabase
    .from("inspections")
    .update(patch)
    .eq("id", inspectionId);

  if (error) {
    console.error("[updateInspection]", error);
    redirect(
      `/inspections/${inspectionId}/edit?error=${encodeURIComponent(error.message)}`,
    );
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
      `/inspections/history?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
  redirect(redirectTo);
}

function stringOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/* =====================================================================
 * Photo organization — inspection_sections CRUD + photo assignment.
 * ===================================================================== */

/**
 * Create a new section ("Stair B", "Main Corridor", etc.) within an
 * inspection. Sort order auto-appends to the end.
 */
export async function createSection(formData: FormData) {
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!inspectionId || !name) return;

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
  if (error) console.error("[createSection]", error);

  revalidatePath(`/inspections/${inspectionId}`);
}

/**
 * Rename a section in place.
 */
export async function renameSection(formData: FormData) {
  const sectionId = String(formData.get("section_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!sectionId || !inspectionId || !name) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("inspection_sections")
    .update({ name: name.slice(0, 120) })
    .eq("id", sectionId);
  if (error) console.error("[renameSection]", error);

  revalidatePath(`/inspections/${inspectionId}`);
}

/**
 * Delete a section. Photos in that section become Unassigned (FK is set null
 * on delete per migration 0011). Findings/annotations on those photos are
 * unaffected — only the grouping changes.
 */
export async function deleteSection(formData: FormData) {
  const sectionId = String(formData.get("section_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  if (!sectionId || !inspectionId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("inspection_sections")
    .delete()
    .eq("id", sectionId);
  if (error) console.error("[deleteSection]", error);

  revalidatePath(`/inspections/${inspectionId}`);
}

/**
 * Move a section up or down in the ordering. Swaps sort_order with the
 * adjacent section in the requested direction. Simpler than a full
 * reorder API and good enough for ~20 sections.
 */
export async function moveSection(formData: FormData) {
  const sectionId = String(formData.get("section_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!sectionId || !inspectionId) return;
  if (direction !== "up" && direction !== "down") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull the current section + its neighbor in the requested direction.
  const { data: current } = await supabase
    .from("inspection_sections")
    .select("id, sort_order")
    .eq("id", sectionId)
    .maybeSingle();
  if (!current) return;

  const { data: neighbor } = await supabase
    .from("inspection_sections")
    .select("id, sort_order")
    .eq("inspection_id", inspectionId)
    .order("sort_order", { ascending: direction === "down" })
    .gt(
      "sort_order",
      direction === "down" ? current.sort_order : -Infinity,
    )
    .lt(
      "sort_order",
      direction === "up" ? current.sort_order : Infinity,
    )
    .limit(1)
    .maybeSingle();
  if (!neighbor) return; // already at the edge

  // Swap.
  await supabase
    .from("inspection_sections")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);
  await supabase
    .from("inspection_sections")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id);

  revalidatePath(`/inspections/${inspectionId}`);
}

/**
 * Assign a single photo to a section (or detach by passing "" / "none").
 * Auto-appends to the end of the destination section's photo list.
 */
export async function assignPhotoToSection(formData: FormData) {
  const photoId = String(formData.get("photo_id") ?? "");
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const sectionRaw = String(formData.get("section_id") ?? "");
  const sectionId =
    sectionRaw && sectionRaw !== "none" && sectionRaw !== ""
      ? sectionRaw
      : null;
  if (!photoId || !inspectionId) return;

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

  const { error } = await supabase
    .from("photos")
    .update({ section_id: sectionId, sort_order: nextSortOrder })
    .eq("id", photoId);
  if (error) console.error("[assignPhotoToSection]", error);

  revalidatePath(`/inspections/${inspectionId}`);
  revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`);
}
