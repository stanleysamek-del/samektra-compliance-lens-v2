"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PIN_SELECT,
  PLAN_SELECT,
  clamp01,
  toPinRow,
  type PinKind,
  type PinRow,
  type PlanRow,
} from "@/components/plans/types";

/**
 * Plan + pin server actions (migration 0025).
 *
 * Plans: the client rasterizes (pdf.js) and uploads to the `drawings`
 * bucket itself — the browser has the bytes and the storage policy is
 * facility-scoped — then calls createPlans() to record the rows.
 *
 * Pins: normalized 0..1 so they survive any re-render size. A FINDING
 * may have at most one pin: createPin() moves the existing one instead of
 * inserting a second. Every action returns `{ ok: true } | { ok: false,
 * error }` and revalidates the pages that show the plan.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function friendly(
  err: { code?: string; message?: string } | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!err) return fallback;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  if (code === "42P01" || msg.includes("does not exist")) {
    return "Plans aren't set up on this workspace yet (database migration 0025 pending).";
  }
  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied")
  ) {
    return "You don't have permission to change this plan.";
  }
  if (code === "23503") {
    return "This item is still linked to other records and can't be removed.";
  }
  if (code === "23514" || code === "22P02" || code === "22001") {
    return "Some of the values aren't valid. Check them and try again.";
  }
  if (code === "PGRST116") return "That item no longer exists.";
  return err.message || fallback;
}

const NO_ROWS =
  "Nothing was changed — you may not have permission, or the item no longer exists.";

function revalidateFor(facilityId?: string | null, inspectionId?: string | null) {
  if (facilityId) revalidatePath(`/facilities/${facilityId}`);
  revalidatePath("/facilities");
  // "layout" covers the inspection page AND its photo pages in one call.
  if (inspectionId) revalidatePath(`/inspections/${inspectionId}`, "layout");
}

/* ---------------------------------------------------------------------
 * Plans
 * ------------------------------------------------------------------- */

export type NewPlanInput = {
  name: string;
  page: number;
  width: number | null;
  height: number | null;
  storagePath: string;
  sourcePath: string | null;
};

/** Record already-uploaded plan pages. Returns the new plan ids in order. */
export async function createPlans(input: {
  facilityId: string;
  plans: NewPlanInput[];
}): Promise<ActionResult & { ids?: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!input.facilityId) return { ok: false, error: "Missing facility." };
  if (!Array.isArray(input.plans) || input.plans.length === 0) {
    return { ok: false, error: "Nothing to save." };
  }

  // The drawings bucket is facility-scoped (<facilityId>/<file>, 0025).
  // A row pointing at another facility's folder would let the signed-URL
  // helpers serve a plan the caller can't read from storage directly.
  const prefix = `${input.facilityId}/`;
  const validPath = (p: unknown) =>
    typeof p === "string" && p.startsWith(prefix) && !p.includes("..");
  for (const p of input.plans) {
    if (!validPath(p.storagePath)) return { ok: false, error: "Invalid plan path" };
    if (p.sourcePath != null && !validPath(p.sourcePath)) {
      return { ok: false, error: "Invalid plan path" };
    }
  }

  // Append after the facility's existing plans so upload order is kept.
  const { data: last } = await supabase
    .from("facility_plans")
    .select("sort")
    .eq("facility_id", input.facilityId)
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sort = (last?.sort as number | undefined) ?? -1;

  const rows = input.plans.map((p) => {
    sort += 1;
    return {
      facility_id: input.facilityId,
      created_by: user.id,
      name: (p.name || "Plan").slice(0, 200),
      storage_path: p.storagePath,
      source_path: p.sourcePath,
      page: Math.max(1, Math.floor(p.page || 1)),
      width: p.width && p.width > 0 ? Math.round(p.width) : null,
      height: p.height && p.height > 0 ? Math.round(p.height) : null,
      sort,
    };
  });

  const { data, error } = await supabase
    .from("facility_plans")
    .insert(rows)
    .select("id");
  if (error) return { ok: false, error: friendly(error) };

  revalidateFor(input.facilityId);
  return { ok: true, ids: (data ?? []).map((r) => r.id as string) };
}

export async function renamePlan(
  planId: string,
  name: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) return { ok: false, error: "A plan needs a name." };

  const { data, error } = await supabase
    .from("facility_plans")
    .update({ name: trimmed })
    .eq("id", planId)
    .select("facility_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidateFor(data[0].facility_id as string);
  return { ok: true };
}

/** Delete a plan page (pins cascade). Storage objects are removed
 *  best-effort; the source PDF is only removed when no other page of the
 *  same upload still references it. */
export async function deletePlan(planId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: plan } = await supabase
    .from("facility_plans")
    .select("id, facility_id, storage_path, source_path")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return { ok: false, error: NO_ROWS };

  const { data: deleted, error } = await supabase
    .from("facility_plans")
    .delete()
    .eq("id", planId)
    .select("id");
  if (error) return { ok: false, error: friendly(error) };
  if (!deleted || deleted.length === 0) return { ok: false, error: NO_ROWS };

  try {
    const paths: string[] = [plan.storage_path as string];
    if (plan.source_path) {
      const { count } = await supabase
        .from("facility_plans")
        .select("id", { count: "exact", head: true })
        .eq("source_path", plan.source_path as string);
      if (!count) paths.push(plan.source_path as string);
    }
    await supabase.storage.from("drawings").remove(paths);
  } catch (err) {
    console.warn("[deletePlan] storage cleanup skipped", err);
  }

  revalidateFor(plan.facility_id as string);
  return { ok: true };
}

export type FacilityPlanForClient = {
  id: string;
  name: string;
  page: number;
  width: number | null;
  height: number | null;
  /** Signed URL, 60 minutes. */
  url: string;
};

/**
 * Plans of a facility with 60-minute signed URLs, plus (optionally) the
 * pins already placed for one inspection. Used by the "Place on plan"
 * modal, which runs in the browser and can't mint signed URLs itself.
 * Degrades to an empty list (ok:true) when the tables aren't there yet.
 */
export async function listFacilityPlans(input: {
  facilityId: string;
  inspectionId?: string | null;
}): Promise<
  ActionResult & { plans?: FacilityPlanForClient[]; pins?: PinRow[] }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: plans, error } = await supabase
    .from("facility_plans")
    .select(PLAN_SELECT)
    .eq("facility_id", input.facilityId)
    .order("sort", { ascending: true })
    .order("page", { ascending: true });
  if (error) {
    // Pre-migration: behave as "no plans" rather than failing the modal.
    console.warn("[listFacilityPlans]", error.message);
    return { ok: true, plans: [], pins: [] };
  }

  const out: FacilityPlanForClient[] = [];
  for (const p of (plans ?? []) as PlanRow[]) {
    const { data: signed } = await supabase.storage
      .from("drawings")
      .createSignedUrl(p.storage_path, 60 * 60);
    if (!signed?.signedUrl) continue;
    out.push({
      id: p.id,
      name: p.name,
      page: p.page,
      width: p.width,
      height: p.height,
      url: signed.signedUrl,
    });
  }

  let pins: PinRow[] = [];
  if (input.inspectionId) {
    const { data: pinRows } = await supabase
      .from("plan_pins")
      .select(PIN_SELECT)
      .eq("inspection_id", input.inspectionId);
    pins = ((pinRows ?? []) as Record<string, unknown>[]).map(toPinRow);
  }

  return { ok: true, plans: out, pins };
}

/* ---------------------------------------------------------------------
 * Pins
 * ------------------------------------------------------------------- */

export type CreatePinInput = {
  planId: string;
  facilityId: string;
  kind: PinKind;
  inspectionId?: string | null;
  findingId?: string | null;
  photoId?: string | null;
  x: number;
  y: number;
  label?: string | null;
};

function cleanLabel(label: string | null | undefined): string | null {
  if (typeof label !== "string") return null;
  const t = label.trim().slice(0, 60);
  return t.length > 0 ? t : null;
}

/**
 * Place a pin. A finding may have at most ONE pin: if one already exists
 * for `findingId` (on any plan of the facility) it is moved to the new
 * plan + position instead of duplicated. Returns the pin id and the plan
 * name so the caller can show "Pinned on <plan>".
 */
export async function createPin(
  input: CreatePinInput,
): Promise<ActionResult & { pinId?: string; planName?: string; moved?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!input.planId || !input.facilityId) {
    return { ok: false, error: "Missing plan or facility." };
  }
  const kinds: PinKind[] = ["finding", "photo", "device", "note"];
  if (!kinds.includes(input.kind)) {
    return { ok: false, error: "Unknown pin kind." };
  }
  if (input.kind === "finding" && !input.findingId) {
    return { ok: false, error: "A finding pin needs a finding." };
  }

  const x = clamp01(Number(input.x));
  const y = clamp01(Number(input.y));

  const { data: plan } = await supabase
    .from("facility_plans")
    .select("id, name, facility_id")
    .eq("id", input.planId)
    .maybeSingle();
  if (!plan) return { ok: false, error: "That plan no longer exists." };
  if (plan.facility_id !== input.facilityId) {
    return { ok: false, error: "That plan belongs to a different facility." };
  }

  // One pin per finding: move the existing one.
  if (input.kind === "finding" && input.findingId) {
    const { data: existing } = await supabase
      .from("plan_pins")
      .select("id")
      .eq("finding_id", input.findingId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      const patch: Record<string, unknown> = {
        plan_id: input.planId,
        x,
        y,
        updated_at: new Date().toISOString(),
      };
      if (input.label !== undefined) patch.label = cleanLabel(input.label);
      const { data: moved, error: mvErr } = await supabase
        .from("plan_pins")
        .update(patch)
        .eq("id", existing.id)
        .select("id");
      if (mvErr) return { ok: false, error: friendly(mvErr) };
      if (!moved || moved.length === 0) return { ok: false, error: NO_ROWS };
      revalidateFor(input.facilityId, input.inspectionId);
      return {
        ok: true,
        pinId: existing.id as string,
        planName: plan.name as string,
        moved: true,
      };
    }
  }

  const { data, error } = await supabase
    .from("plan_pins")
    .insert({
      plan_id: input.planId,
      facility_id: input.facilityId,
      kind: input.kind,
      inspection_id: input.inspectionId ?? null,
      finding_id: input.kind === "finding" ? input.findingId ?? null : null,
      photo_id: input.photoId ?? null,
      x,
      y,
      label: cleanLabel(input.label),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendly(error) };

  revalidateFor(input.facilityId, input.inspectionId);
  return { ok: true, pinId: data.id as string, planName: plan.name as string };
}

export async function movePin(
  pinId: string,
  x: number,
  y: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_pins")
    .update({
      x: clamp01(Number(x)),
      y: clamp01(Number(y)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pinId)
    .select("facility_id, inspection_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };
  revalidateFor(data[0].facility_id as string, data[0].inspection_id as string | null);
  return { ok: true };
}

export async function updatePinLabel(
  pinId: string,
  label: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_pins")
    .update({ label: cleanLabel(label), updated_at: new Date().toISOString() })
    .eq("id", pinId)
    .select("facility_id, inspection_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };
  revalidateFor(data[0].facility_id as string, data[0].inspection_id as string | null);
  return { ok: true };
}

export async function deletePin(pinId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_pins")
    .delete()
    .eq("id", pinId)
    .select("facility_id, inspection_id");
  if (error) return { ok: false, error: friendly(error) };
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };
  revalidateFor(data[0].facility_id as string, data[0].inspection_id as string | null);
  return { ok: true };
}

/** Every pin placed for an inspection (all plans). Empty on pre-migration. */
export async function listPinsForInspection(
  inspectionId: string,
): Promise<ActionResult & { pins?: PinRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_pins")
    .select(PIN_SELECT)
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[listPinsForInspection]", error.message);
    return { ok: true, pins: [] };
  }
  return {
    ok: true,
    pins: ((data ?? []) as Record<string, unknown>[]).map(toPinRow),
  };
}
