"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ASSET_TYPES } from "@/lib/assets";
export async function createAsset(form: FormData) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const type = String(form.get("type"));
  const label = String(form.get("label") ?? "").trim();
  if (!ASSET_TYPES.some((t) => t === type) || !label || label.length > 160)
    redirect("/assets?error=Check%20the%20equipment%20name%20and%20type");
  const { data, error } = await db
    .from("assets")
    .insert({
      facility_id: form.get("facility_id"),
      type,
      label,
      barcode:
        String(form.get("barcode") ?? "")
          .trim()
          .slice(0, 160) || null,
      location_text:
        String(form.get("location") ?? "")
          .trim()
          .slice(0, 500) || null,
      next_due_at: form.get("next_due") || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data)
    redirect(
      `/assets?error=${encodeURIComponent(error?.code === "23505" ? "That barcode already exists at this facility." : "Could not save equipment. Check your editing access and setup.")}`,
    );
  revalidatePath("/assets");
  redirect(`/assets/${data.id}`);
}
export async function recordCheck(form: FormData) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const id = String(form.get("id"));
  const { error } = await db.rpc("record_asset_check", {
    _asset_id: id,
    _result: form.get("result"),
    _note: String(form.get("note") ?? "").slice(0, 4000),
    _next_due: form.get("next_due") || null,
  });
  if (error)
    redirect(`/assets/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
}

export async function importEquipment(
  facilityId: string,
  rows: import("@/lib/asset-import").EquipmentImportRow[],
  overwrite: boolean,
) {
  const { validateEquipmentRows } = await import("@/lib/asset-import");
  const invalid = validateEquipmentRows(rows);
  if (invalid) return { ok: false, error: invalid };
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to import equipment." };
  const { data, error } = await db.rpc("import_equipment_rows", {
    _facility_id: facilityId,
    _rows: rows,
    _overwrite: overwrite === true,
  });
  if (error)
    return {
      ok: false,
      error:
        "Import could not be saved. Check building editing access, duplicate barcodes, and database setup.",
    };
  revalidatePath("/assets");
  return {
    ok: true,
    result: data as { added: number; updated: number; skipped: number },
  };
}
export async function placeEquipment(
  assetId: string,
  planId: string,
  x: number,
  y: number,
) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  )
    return { ok: false, error: "Invalid plan position." };
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to place equipment." };
  const { data, error } = await db.rpc("place_asset_on_plan", {
    _asset_id: assetId,
    _plan_id: planId,
    _x: x,
    _y: y,
  });
  if (error)
    return {
      ok: false,
      error:
        "Could not place equipment. Choose a plan in this building and check your editing access.",
    };
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/facilities", "layout");
  return { ok: true, id: String(data) };
}
