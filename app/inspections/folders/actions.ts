"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Every action here returns `{ ok: true } | { ok: false, error }` so the
 * FoldersManager / InspectionMoveMenu can toast a failure and keep the
 * user's draft instead of silently closing.
 */
type ActionResult = { ok: true } | { ok: false; error: string };

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
    return "You don't have permission to change this team's groups.";
  }
  if (code === "23505") return "A group with that name already exists.";
  if (code === "23503") {
    return "This group is still linked to other records and can't be removed.";
  }
  if (code === "23514" || code === "22P02" || code === "22001") {
    return "Some of the values aren't valid. Check them and try again.";
  }
  if (code === "PGRST116") return "That group no longer exists.";
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
  "Nothing was changed — you may not have permission, or the group no longer exists.";

function revalidateLists() {
  revalidatePath("/inspections");
  revalidatePath("/inspections/history");
}

export async function createFolder(formData: FormData): Promise<ActionResult> {
  const orgId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!orgId) return { ok: false, error: "Missing team id." };
  if (!name) return { ok: false, error: "Group name is required." };

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

  const { error } = await supabase.from("inspection_folders").insert({
    organization_id: orgId,
    name: name.slice(0, 120),
    sort_order: nextOrder,
  });
  if (error) {
    console.error("[createFolder]", error);
    return { ok: false, error: friendlyError(error) };
  }

  revalidateLists();
  return { ok: true };
}

export async function setFolderColor(formData: FormData): Promise<ActionResult> {
  const folderId = String(formData.get("folder_id") ?? "");
  const colorRaw = String(formData.get("color") ?? "").trim();
  if (!folderId) return { ok: false, error: "Missing group id." };

  // Accept 7-char hex (#RRGGBB) or empty/none → null. Anything else is
  // silently discarded to keep arbitrary CSS out of the DB column.
  const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("inspection_folders")
    .update({ color })
    .eq("id", folderId)
    .select("id");
  if (error) {
    console.error("[setFolderColor]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidateLists();
  return { ok: true };
}

export async function renameFolder(formData: FormData): Promise<ActionResult> {
  const folderId = String(formData.get("folder_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!folderId) return { ok: false, error: "Missing group id." };
  if (!name) return { ok: false, error: "Group name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("inspection_folders")
    .update({ name: name.slice(0, 120) })
    .eq("id", folderId)
    .select("id");
  if (error) {
    console.error("[renameFolder]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidateLists();
  return { ok: true };
}

export async function deleteFolder(formData: FormData): Promise<ActionResult> {
  const folderId = String(formData.get("folder_id") ?? "");
  if (!folderId) return { ok: false, error: "Missing group id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ON DELETE SET NULL on inspections.folder_id means inspections survive
  // and become "Unfiled" — findings/photos all stay intact.
  const { data, error } = await supabase
    .from("inspection_folders")
    .delete()
    .eq("id", folderId)
    .select("id");
  if (error) {
    console.error("[deleteFolder]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) return { ok: false, error: NO_ROWS };

  revalidateLists();
  return { ok: true };
}

/**
 * Move a folder up or down. The neighbor query is built conditionally —
 * "down" needs only `sort_order > current`, "up" only `< current`. The
 * previous version passed ±Infinity for the missing bound, which PostgREST
 * serialised as the string "Infinity" → Postgres 22P02 → every move
 * silently no-op'd.
 */
export async function moveFolder(formData: FormData): Promise<ActionResult> {
  const folderId = String(formData.get("folder_id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!folderId) return { ok: false, error: "Missing group id." };
  if (direction !== "up" && direction !== "down") {
    return { ok: false, error: "Invalid move direction." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current, error: currentErr } = await supabase
    .from("inspection_folders")
    .select("id, organization_id, sort_order")
    .eq("id", folderId)
    .maybeSingle();
  if (currentErr) {
    console.error("[moveFolder]", currentErr);
    return { ok: false, error: friendlyError(currentErr) };
  }
  if (!current) return { ok: false, error: "That group no longer exists." };

  const base = supabase
    .from("inspection_folders")
    .select("id, sort_order")
    .eq("organization_id", current.organization_id)
    .neq("id", current.id);
  const bounded =
    direction === "down"
      ? base.gt("sort_order", current.sort_order).order("sort_order", { ascending: true })
      : base.lt("sort_order", current.sort_order).order("sort_order", { ascending: false });
  const { data: neighbor, error: neighborErr } = await bounded.limit(1).maybeSingle();
  if (neighborErr) {
    console.error("[moveFolder]", neighborErr);
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
    .from("inspection_folders")
    .update({ sort_order: currentOrder })
    .eq("id", current.id);
  if (e1) {
    console.error("[moveFolder]", e1);
    return { ok: false, error: friendlyError(e1) };
  }
  const { error: e2 } = await supabase
    .from("inspection_folders")
    .update({ sort_order: neighborOrder })
    .eq("id", neighbor.id);
  if (e2) {
    console.error("[moveFolder]", e2);
    return { ok: false, error: friendlyError(e2) };
  }

  revalidateLists();
  return { ok: true };
}

export async function assignInspectionToFolder(formData: FormData): Promise<ActionResult> {
  const inspectionId = String(formData.get("inspection_id") ?? "");
  const folderRaw = String(formData.get("folder_id") ?? "");
  const folderId =
    folderRaw === "" || folderRaw === "none" ? null : folderRaw;
  if (!inspectionId) return { ok: false, error: "Missing inspection id." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("inspections")
    .update({ folder_id: folderId })
    .eq("id", inspectionId)
    .select("id");
  if (error) {
    console.error("[assignInspectionToFolder]", error);
    return { ok: false, error: friendlyError(error) };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "Nothing was changed — you may not have permission, or the inspection no longer exists.",
    };
  }

  revalidateLists();
  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}
