"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org/current";

function clean(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function createInspection(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const facility_name = clean(formData.get("facility_name"));
  if (!facility_name) {
    redirect("/inspections/new?error=Facility%20name%20is%20required");
  }

  const facility_address = clean(formData.get("facility_address"));
  const location = clean(formData.get("location"));
  const inspector_name = clean(formData.get("inspector_name"));
  const manager_assigned = clean(formData.get("manager_assigned"));
  const manager_assigned_email = clean(formData.get("manager_assigned_email"));
  const date_of_inspection = clean(formData.get("date_of_inspection"));
  const date_assigned = clean(formData.get("date_assigned"));

  // If the user is currently acting inside a team, scope the new inspection
  // to that org so every team member sees it. Personal workspace = null.
  const currentOrg = await getCurrentOrg();

  const { data, error } = await supabase
    .from("inspections")
    .insert({
      facility_name,
      facility_address,
      location,
      inspector_name,
      manager_assigned,
      manager_assigned_email,
      date_of_inspection,
      date_assigned,
      organization_id: currentOrg?.id ?? null,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[createInspection]", error);
    redirect(
      `/inspections/new?error=${encodeURIComponent(error.message ?? "Could not create inspection")}`,
    );
  }

  redirect(`/inspections/${data.id}`);
}
