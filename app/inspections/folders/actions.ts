"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createFolder(formData: FormData) {
  const orgId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!orgId || !name) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Append to end of the existing folder list for this org.
  const { data: lastRow } = await supabase
    .from("inspection_folders")
    .select("sort_order")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (lastRow?.sort_order ?? -1) + 1;

  await supabase.from("inspection_folders").insert({
    organization_id: orgId,
    name: name.slice(0, 120),
    sort_order: nextOrder,
  });

  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
}

export async function setFolderColor(formData: FormData) {
  const folderId = String(formData.get("folder_id") ?? "");
  const colorRaw = String(formData.get("color") ?? "").trim();
  if (!folderId) return;

  // Accept 7-char hex (#RRGGBB) or empty/none → null. Anything else is
  // silently discarded to keep arbitrary CSS out of the DB column.
  const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("inspection_folders")
    .update({ color })
    .eq("id", folderId);

  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
}

export async function renameFolder(formData: FormData) {
  const folderId = String(formData.get("folder_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!folderId || !name) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("inspection_folders")
    .update({ name: name.slice(0, 120) })
    .eq("id", folderId);

  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
}

export async function deleteFolder(formData: FormData) {
  const folderId = String(formData.get("folder_id") ?? "");
  if (!folderId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ON DELETE SET NULL on inspections.folder_id means inspections survive
  // and become "Unfiled" — findings/photos all stay intact.
  await supabase.from("inspection_folders").delete().eq("id", folderId);

  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
}

export async function moveFolder(formData: FormData) {
  const folderId = String(formData.get("folder_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!folderId || (direction !== "up" && direction !== "down")) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current } = await supabase
    .from("inspection_folders")
    .select("id, organization_id, sort_order")
    .eq("id", folderId)
    .maybeSingle();
  if (!current) return;

  const { data: neighbor } = await supabase
    .from("inspection_folders")
    .select("id, sort_order")
    .eq("organization_id", current.organization_id)
    .order("sort_order", { ascending: direction === "down" })
    .gt("sort_order", direction === "down" ? current.sort_order : -Infinity)
    .lt("sort_order", direction === "up" ? current.sort_order : Infinity)
    .limit(1)
    .maybeSingle();
  if (!neighbor) return;

  await supabase
    .from("inspection_folders")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);
  await supabase
    .from("inspection_folders")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id);

  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
}

export async function assignInspectionToFolder(formData: FormData) {
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const folderRaw = String(formData.get("folder_id") ?? "");
  const folderId =
    folderRaw === "" || folderRaw === "none" ? null : folderRaw;
  if (!inspectionId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("inspections")
    .update({ folder_id: folderId })
    .eq("id", inspectionId);

  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
  revalidatePath(`/inspections/${inspectionId}`);
}
