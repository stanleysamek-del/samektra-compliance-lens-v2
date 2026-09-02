import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Open checklist questions for an inspection, phrased for the analyzer's
 * INSPECTION CHECKLIST block: "A1 Fire Doors — Is the fire door
 * self-closing or automatic-closing?". Only questions a photo could still
 * answer are sent: unanswered, or AI-answered but not yet confirmed. Never
 * throws — an inspection without a checklist (or pre-migration) yields [].
 */
export async function loadChecklistFocus(
  supabase: SupabaseClient,
  inspectionId: string,
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("inspection_checklist_items")
      .select("section_code, section_title, question, answer, answered_by_ai, ai_confirmed, match_terms")
      .eq("inspection_id", inspectionId)
      .order("sort", { ascending: true });
    if (!data) return [];
    return data
      .filter((i) => i.answer === null || (i.answered_by_ai && !i.ai_confirmed))
      // Questions with no match terms are process/records questions the
      // AI can't judge from a photo ("Has the previous inspection been
      // reviewed?") — leave them out so the block stays photo-relevant.
      .filter((i) => Array.isArray(i.match_terms) && i.match_terms.length > 0)
      .map((i) => `${i.section_code} ${i.section_title} — ${i.question}`);
  } catch {
    return [];
  }
}
