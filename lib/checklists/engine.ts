import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBuiltinTemplate,
  type ChecklistTemplate,
} from "@/lib/checklists/builtin-templates";

/**
 * Checklist engine helpers shared by server actions, the analyze routes,
 * and the exports: template attach (snapshot), the finding→question
 * AI-prefill matcher, and score math.
 */

export type ChecklistItemRow = {
  id: string;
  inspection_id: string;
  template_ref: string | null;
  template_name: string | null;
  section_code: string;
  section_title: string;
  sort: number;
  question: string;
  code_ref: string | null;
  match_terms: string[];
  answer: "yes" | "no" | "na" | null;
  note: string | null;
  answered_by: string | null;
  answered_by_ai: boolean;
  ai_confirmed: boolean;
  photo_id: string | null;
  finding_id: string | null;
  answered_at: string | null;
};

/** Resolve a picker value to a template: "builtin:<slug>" or a DB uuid. */
export async function resolveTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<ChecklistTemplate | null> {
  if (templateId.startsWith("builtin:")) return getBuiltinTemplate(templateId);
  const { data } = await supabase
    .from("checklist_templates")
    .select("id, name, description, occupancy, sections")
    .eq("id", templateId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? "",
    occupancy: data.occupancy ?? "Any",
    sections: (data.sections ?? []) as ChecklistTemplate["sections"],
  };
}

/**
 * Snapshot a template's questions onto an inspection. Also returns the
 * distinct section titles so the caller can create matching photo
 * sections (inspection_sections) in the same order.
 */
export async function attachTemplate(
  supabase: SupabaseClient,
  inspectionId: string,
  template: ChecklistTemplate,
): Promise<{ error: string | null; sectionTitles: string[] }> {
  const rows: Array<Record<string, unknown>> = [];
  let sort = 0;
  for (const section of template.sections) {
    for (const item of section.items) {
      rows.push({
        inspection_id: inspectionId,
        template_ref: template.id,
        template_name: template.name,
        section_code: section.code,
        section_title: section.title,
        sort: sort++,
        question: item.q,
        code_ref: item.ref ?? null,
        match_terms: item.match ?? [],
      });
    }
  }
  if (rows.length === 0) return { error: "Template has no questions", sectionTitles: [] };

  const { error } = await supabase
    .from("inspection_checklist_items")
    .insert(rows);
  return {
    error: error ? error.message : null,
    sectionTitles: template.sections.map((s) => `${s.code}. ${s.title}`),
  };
}

// ---- AI pre-fill matcher ---------------------------------------------

export type FindingForMatch = {
  id: string;
  title: string | null;
  description: string | null;
  code: string | null;
};

/**
 * Score a finding against one item's match terms. Multi-word phrases are
 * worth more than single words — "supported by the sprinkler" hitting is
 * far stronger evidence than the bare word "sprinkler".
 */
function scoreItem(hay: string, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (!t) continue;
    if (hay.includes(t)) score += t.includes(" ") ? 2 : 1;
  }
  return score;
}

/**
 * For each finding, pick the best-matching OPEN question (unanswered or
 * already AI-answered without human confirmation) and mark it "no".
 * Never touches a human answer. Returns the number of items updated.
 *
 * Deliberately conservative: a finding with no term hits files nowhere —
 * the inspector still sees it in the findings list; the checklist just
 * doesn't guess.
 */
export async function prefillChecklistFromFindings(
  supabase: SupabaseClient,
  inspectionId: string,
  findings: FindingForMatch[],
  photoId: string | null,
): Promise<number> {
  if (findings.length === 0) return 0;

  const { data: items } = await supabase
    .from("inspection_checklist_items")
    .select(
      "id, answer, answered_by_ai, ai_confirmed, match_terms, note, finding_id",
    )
    .eq("inspection_id", inspectionId);
  if (!items || items.length === 0) return 0;

  // Open = unanswered, or an unconfirmed AI answer we're allowed to refine.
  const open = items.filter(
    (i) => i.answer === null || (i.answered_by_ai && !i.ai_confirmed),
  );
  if (open.length === 0) return 0;

  let updated = 0;
  const claimed = new Set<string>();

  for (const f of findings) {
    const hay = [f.title ?? "", f.description ?? "", f.code ?? ""]
      .join(" ")
      .toLowerCase();
    let best: { id: string; score: number; note: string | null } | null = null;
    for (const item of open) {
      if (claimed.has(item.id)) continue;
      const score = scoreItem(hay, (item.match_terms as string[]) ?? []);
      if (score > 0 && (!best || score > best.score)) {
        best = { id: item.id, score, note: item.note };
      }
    }
    if (!best) continue;

    claimed.add(best.id);
    const noteLine = f.title ? `AI: ${f.title}` : null;
    const { error } = await supabase
      .from("inspection_checklist_items")
      .update({
        answer: "no",
        answered_by_ai: true,
        ai_confirmed: false,
        finding_id: f.id,
        photo_id: photoId,
        note: best.note
          ? noteLine && !best.note.includes(noteLine)
            ? `${best.note}\n${noteLine}`
            : best.note
          : noteLine,
        answered_at: new Date().toISOString(),
      })
      .eq("id", best.id);
    if (!error) updated++;
  }
  return updated;
}

// ---- Score math ------------------------------------------------------

export type ChecklistScore = {
  yes: number;
  no: number;
  na: number;
  unanswered: number;
  scored: number; // yes + no
  pct: number | null; // yes / (yes + no), null when nothing scored
};

export function scoreItems(
  items: Array<Pick<ChecklistItemRow, "answer">>,
): ChecklistScore {
  let yes = 0,
    no = 0,
    na = 0,
    unanswered = 0;
  for (const i of items) {
    if (i.answer === "yes") yes++;
    else if (i.answer === "no") no++;
    else if (i.answer === "na") na++;
    else unanswered++;
  }
  const scored = yes + no;
  return {
    yes,
    no,
    na,
    unanswered,
    scored,
    pct: scored > 0 ? Math.round((yes / scored) * 1000) / 10 : null,
  };
}
