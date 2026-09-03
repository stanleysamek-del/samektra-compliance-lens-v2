"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org/current";
import { attachTemplate, resolveTemplate } from "@/lib/checklists/engine";

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

  let facility_address = clean(formData.get("facility_address"));
  const location = clean(formData.get("location"));
  const inspector_name = clean(formData.get("inspector_name"));
  const manager_assigned = clean(formData.get("manager_assigned"));
  const manager_assigned_email = clean(formData.get("manager_assigned_email"));
  const date_of_inspection = clean(formData.get("date_of_inspection"));
  const date_assigned = clean(formData.get("date_assigned"));

  // If the user is currently acting inside a team, scope the new inspection
  // to that org so every team member sees it. Personal workspace = null.
  const currentOrg = await getCurrentOrg();

  // Facility link (migration 0025). "" → none (legacy behavior), "__new__"
  // → create a facility from the typed name, <uuid> → link + prefill the
  // address when the inspector left it blank. Any failure here degrades to
  // "no facility" so an inspection is never lost over a missing table.
  const facilityChoice = clean(formData.get("facility_id"));
  let facility_id: string | null = null;
  if (facilityChoice === "__new__") {
    const { data: created, error: facErr } = await supabase
      .from("facilities")
      .insert({
        name: facility_name,
        address: facility_address,
        organization_id: currentOrg?.id ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (facErr) console.warn("[createInspection] facility create skipped:", facErr.message);
    else facility_id = created.id as string;
  } else if (facilityChoice && /^[0-9a-f-]{36}$/i.test(facilityChoice)) {
    const { data: fac, error: facErr } = await supabase
      .from("facilities")
      .select("id, address")
      .eq("id", facilityChoice)
      .maybeSingle();
    if (facErr) console.warn("[createInspection] facility lookup skipped:", facErr.message);
    else if (fac) {
      facility_id = fac.id as string;
      if (!facility_address && fac.address) facility_address = fac.address as string;
    }
  }

  const baseRow = {
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
  };

  const row: Record<string, unknown> = { ...baseRow };
  if (facility_id) row.facility_id = facility_id;

  let { data, error } = await supabase
    .from("inspections")
    .insert(row)
    .select("id")
    .single();

  // Pre-0025 database: the facility_id column doesn't exist. Retry without it.
  if (error && facility_id && /facility_id/i.test(error.message ?? "")) {
    console.warn("[createInspection] facility_id column missing — inserting without it");
    ({ data, error } = await supabase
      .from("inspections")
      .insert(baseRow)
      .select("id")
      .single());
  }

  if (error || !data) {
    console.error("[createInspection]", error);
    redirect(
      `/inspections/new?error=${encodeURIComponent(error?.message ?? "Could not create inspection")}`,
    );
  }

  // Optional checklist template: snapshot its questions onto the
  // inspection AND create matching photo sections, so photos file under
  // the same groups the questions live in. Best-effort — a checklist
  // failure never loses the inspection that was just created.
  const templateId = clean(formData.get("template_id"));
  if (templateId) {
    try {
      const template = await resolveTemplate(supabase, templateId);
      if (template) {
        const { error: attachErr, sectionTitles } = await attachTemplate(
          supabase,
          data.id,
          template,
        );
        if (attachErr) {
          console.error("[createInspection] checklist attach", attachErr);
        } else if (sectionTitles.length > 0) {
          const { error: sectionsErr } = await supabase
            .from("inspection_sections")
            .insert(
              sectionTitles.map((name, idx) => ({
                inspection_id: data.id,
                name,
                sort_order: idx,
              })),
            );
          if (sectionsErr) {
            console.error("[createInspection] sections", sectionsErr);
          }
        }
      }
    } catch (err) {
      console.error("[createInspection] checklist", err);
    }
  }

  redirect(`/inspections/${data.id}`);
}
