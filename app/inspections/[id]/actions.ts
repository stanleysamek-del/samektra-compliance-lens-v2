"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Finalize/reopen an inspection. Reads inspection_id + status from the
 * submitted form data — using FormData rather than .bind() avoids a Next.js
 * 16 quirk where bound server-action invocations could 400 the page.
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

function stringOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
