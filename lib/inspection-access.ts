import type { SupabaseClient } from "@supabase/supabase-js";

/** Read access is insufficient for paid AI, uploads, or service-role jobs. */
export async function requireInspectionWrite(
  supabase: SupabaseClient,
  inspectionId: string,
) {
  const { data, error } = await supabase.rpc("can_write_inspection", {
    _inspection_id: inspectionId,
  });
  if (error)
    return {
      ok: false as const,
      status: 503,
      error: "Could not verify editing permission. Please try again.",
    };
  if (data !== true)
    return {
      ok: false as const,
      status: 403,
      error: "You have read-only access to this inspection.",
    };
  return { ok: true as const };
}
