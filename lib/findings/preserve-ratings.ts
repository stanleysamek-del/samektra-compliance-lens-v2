import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Re-analysis routes (reanalyze, coach) wipe non-edited findings and insert
 * fresh AI output, which would otherwise drop the inspector's thumbs ratings.
 * This helper snapshots ratings before the delete and re-applies them after
 * the insert, matching new rows to old ones by case-insensitive title.
 *
 * The match is intentionally exact-case-insensitive rather than fuzzy —
 * partial / substring matching would risk applying the wrong rating to a
 * subtly different finding, which is worse than losing a rating.
 *
 * Returns a small report so the caller can include "N ratings preserved"
 * in its response payload.
 */

export type RatingSnapshot = {
  title: string;
  user_rating: 1 | -1;
  user_feedback_note: string | null;
};

export async function snapshotRatings(
  supabase: SupabaseClient,
  photoId: string,
): Promise<RatingSnapshot[]> {
  const { data, error } = await supabase
    .from("findings")
    .select("title, user_rating, user_feedback_note")
    .eq("photo_id", photoId)
    .not("user_rating", "is", null);

  if (error) {
    console.warn("[preserve-ratings] snapshot failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    title: String(r.title ?? ""),
    user_rating: r.user_rating as 1 | -1,
    user_feedback_note: (r.user_feedback_note as string | null) ?? null,
  }));
}

export async function reapplyRatings(
  supabase: SupabaseClient,
  photoId: string,
  snapshot: RatingSnapshot[],
): Promise<number> {
  if (snapshot.length === 0) return 0;
  let restored = 0;
  for (const r of snapshot) {
    if (!r.title) continue;
    const { count } = await supabase
      .from("findings")
      .update({
        user_rating: r.user_rating,
        user_feedback_note: r.user_feedback_note,
      }, { count: "exact" })
      .eq("photo_id", photoId)
      .ilike("title", r.title);
    restored += count ?? 0;
  }
  return restored;
}
