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
