import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComplianceAnalysis } from "@/lib/prompts/types";
import { prefillChecklistFromFindings } from "@/lib/checklists/engine";

export type SavedAnalysis = {
  findingsCount: number;
  preservedCount: number;
  insertedFindings: Array<{
    id: string;
    title: string;
    description: string;
    code: string;
  }>;
  alreadySaved: boolean;
};
export async function persistAnalysis(
  supabase: SupabaseClient,
  photoId: string,
  inspectionId: string,
  analysis: ComplianceAnalysis,
  replace = false,
  expectedAnalyzedAt: string | null = null,
): Promise<
  | { ok: true; saved: SavedAnalysis }
  | { ok: false; error: string; status: number }
> {
  const { data, error } = await supabase.rpc("save_photo_analysis", {
    _photo_id: photoId,
    _analysis: analysis,
    _replace: replace,
    _expected_analyzed_at: expectedAnalyzedAt,
  });
  if (error || !data) {
    const missing = /save_photo_analysis|schema cache/.test(
      error?.message ?? "",
    );
    return {
      ok: false,
      status:
        error?.code === "42501"
          ? 403
          : error?.code === "40001" || error?.code === "P0001"
            ? 409
            : 503,
      error: missing
        ? "Analysis safety update is not installed yet. Your saved findings are unchanged. Contact your administrator."
        : (error?.message ??
          "Could not save analysis. Your saved findings are unchanged."),
    };
  }
  const saved = data as SavedAnalysis;
  if (saved.insertedFindings.length) {
    try {
      await prefillChecklistFromFindings(
        supabase,
        inspectionId,
        saved.insertedFindings,
        photoId,
      );
    } catch {
      console.warn("[analysis] Checklist suggestions could not be refreshed");
    }
  }
  return { ok: true, saved };
}
