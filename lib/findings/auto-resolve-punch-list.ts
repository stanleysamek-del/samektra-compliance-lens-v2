import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After a fresh AI pass produces a new `notVisible` array for a photo, any
 * item that was OPEN on the previous pass and is NOT in the new set is
 * considered automatically resolved — Chip can now see it. We mark those
 * rows resolved with a "AI auto-resolved on re-analysis" note so the
 * audit trail explains why they cleared without an inspector touching them.
 *
 * Matching is case-insensitive item-text equality. Substring / fuzzy
 * matching would risk false positives (e.g., "gauge date" and "gauge
 * needle position" are different things). Exact match keeps it tight.
 *
 * Items the inspector already skipped or resolved manually are left alone.
 *
 * Returns the count of items that were auto-resolved so the caller can
 * surface it in the response payload.
 */
export async function autoResolveClearedPunchListItems(
  supabase: SupabaseClient,
  photoId: string,
  newItems: Array<{ item: string }>,
): Promise<number> {
  // Normalize the new set for comparison.
  const newSet = new Set(
    newItems.map((n) => (n.item ?? "").trim().toLowerCase()),
  );

  const { data: openRows, error } = await supabase
    .from("not_visible")
    .select("id, item")
    .eq("photo_id", photoId)
    .eq("resolved", false)
    .eq("skipped", false);

  if (error) {
    console.warn("[auto-resolve] read failed:", error.message);
    return 0;
  }
  if (!openRows || openRows.length === 0) return 0;

  const toResolve: string[] = [];
  for (const r of openRows) {
    const norm = (r.item as string | null)?.trim().toLowerCase() ?? "";
    if (norm && !newSet.has(norm)) {
      toResolve.push(r.id as string);
    }
  }
  if (toResolve.length === 0) return 0;

  const { error: updateErr } = await supabase
    .from("not_visible")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_note: "AI auto-resolved on re-analysis (item no longer flagged)",
    })
    .in("id", toResolve);

  if (updateErr) {
    console.warn("[auto-resolve] update failed:", updateErr.message);
    return 0;
  }
  return toResolve.length;
}
