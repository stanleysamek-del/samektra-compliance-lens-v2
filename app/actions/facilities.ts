"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org/current";

/**
 * Facility server actions (migration 0025). A facility outlives an
 * inspection: it owns the life-safety plans / drawings and is what an
 * inspection's `facility_id` points at. All writes ride RLS
 * (can_write_facility) — the actions only shape the payload and return
 * `{ ok: true } | { ok: false, error }` so callers toast and keep state.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export type FacilityInput = {
  name: string;
  address?: string | null;
  occupancy?: string | null;
};

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Turn a Postgres / PostgREST error into something a manager can act on. */
function friendly(
  err: { code?: string; message?: string } | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!err) return fallback;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  if (code === "42P01" || msg.includes("does not exist")) {
    return "Facilities aren't set up on this workspace yet (database migration 0025 pending).";
  }
  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied")
  ) {
    return "You don't have permission to change this facility.";
  }
  if (code === "23503") {
    return "This item is still linked to other records and can't be removed.";
  }
  if (code === "23514" || code === "22P02" || code === "22001") {
    return "Some of the values aren't valid. Check them and try again.";
  }
  if (code === "PGRST116") return "That facility no longer exists.";
  return err.message || fallback;
}

function revalidateFacility(facilityId?: string) {
  revalidatePath("/facilities");
  if (facilityId) revalidatePath(`/facilities/${facilityId}`);
  revalidatePath("/inspections/new");
}

/**
 * Create a facility. Org-scoped when the user is acting inside a team
 * (getCurrentOrg), personal otherwise. Returns the new id so the form can
 * navigate straight to it.
 */
export async function createFacility(
  input: FacilityInput,
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const name = clean(input.name);
  if (!name) return { ok: false, error: "A facility needs a name." };

  const currentOrg = await getCurrentOrg();

  const { data, error } = await supabase
    .from("facilities")
    .insert({
      name,
      address: clean(input.address),
      occupancy: clean(input.occupancy),
      organization_id: currentOrg?.id ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendly(error) };

  revalidateFacility(data.id as string);
  return { ok: true, id: data.id as string };
}

export async function updateFacility(
  facilityId: string,
  input: FacilityInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const name = clean(input.name);
  if (!name) return { ok: false, error: "A facility needs a name." };

  const { data, error } = await supabase
    .from("facilities")
    .update({
      name,
      address: clean(input.address),
      occupancy: clean(input.occupancy),
      updated_at: new Date().toISOString(),
    })
    .eq("id", facilityId)
    .select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "Nothing was changed — you may not have permission, or the facility no longer exists.",
    };
  }

  revalidateFacility(facilityId);
  return { ok: true };
}

/**
 * Delete a facility. Plans and pins cascade in the database; the plan
 * images in the `drawings` bucket are removed best-effort first so the
 * bucket doesn't keep orphans. Inspections keep their rows (facility_id
 * → null via ON DELETE SET NULL) and their facility_name text.
 */
export async function deleteFacility(facilityId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Best-effort storage cleanup — a failure here never blocks the delete.
  try {
    const { data: plans } = await supabase
      .from("facility_plans")
      .select("storage_path, source_path")
      .eq("facility_id", facilityId);
    const paths = new Set<string>();
    for (const p of plans ?? []) {
      if (p.storage_path) paths.add(p.storage_path as string);
      if (p.source_path) paths.add(p.source_path as string);
    }
    if (paths.size > 0) {
      await supabase.storage.from("drawings").remove([...paths]);
    }
  } catch (err) {
    console.warn("[deleteFacility] storage cleanup skipped", err);
  }

  const { data, error } = await supabase
    .from("facilities")
    .delete()
    .eq("id", facilityId)
    .select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "Nothing was deleted — you may not have permission, or the facility no longer exists.",
    };
  }

  revalidateFacility(facilityId);
  return { ok: true };
}
