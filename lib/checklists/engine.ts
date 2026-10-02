import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBuiltinTemplate,
  type ChecklistTemplate,
  type ResponseType,
  type YesNoAnswer,
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
  // Migration 0034 — absent on older databases, so all optional; absent
  // means yes/no, not required, always shown.
  item_key?: string | null;
  response_type?: ResponseType | null;
  unit?: string | null;
  required?: boolean | null;
  show_if?: { item: string; equals: YesNoAnswer } | null;
  value_text?: string | null;
  value_number?: number | string | null;
};

/** Columns every checklist read selects; 0034's come in CHECKLIST_COLS_0034. */
export const CHECKLIST_COLS =
  "id, inspection_id, template_ref, template_name, section_code, section_title, sort, question, code_ref, match_terms, answer, note, answered_by, answered_by_ai, ai_confirmed, photo_id, finding_id, answered_at";
export const CHECKLIST_COLS_0034 =
  "item_key, response_type, unit, required, show_if, value_text, value_number";

/** True when a query failed because 0034's columns don't exist yet. */
export function isMissing0034(err: { message?: string } | null | undefined): boolean {
  return Boolean(
    err?.message &&
      /item_key|response_type|show_if|value_text|value_number/i.test(err.message),
  );
}

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
  let usesNewFields = false;
  for (const section of template.sections) {
    section.items.forEach((item, idx) => {
      const type = item.type ?? "yesno";
      if (type !== "yesno" || item.required || item.showIf) usesNewFields = true;
      rows.push({
        inspection_id: inspectionId,
        template_ref: template.id,
        template_name: template.name,
        section_code: section.code,
        section_title: section.title,
        sort: sort++,
        question: item.q,
        code_ref: item.ref ?? null,
        // Only yes/no questions take AI pre-fill.
        match_terms: type === "yesno" ? (item.match ?? []) : [],
        item_key: item.id ?? `${section.code}-${idx + 1}`,
        response_type: type,
        unit: type === "number" ? (item.unit ?? null) : null,
        required: Boolean(item.required),
        show_if: item.showIf ?? null,
      });
    });
  }
  if (rows.length === 0) return { error: "Template has no questions", sectionTitles: [] };

  let { error } = await supabase.from("inspection_checklist_items").insert(rows);
  // Database without migration 0034: a plain yes/no template still
  // attaches (drop the new columns); one that relies on the new question
  // types can't be represented, so say so instead of silently degrading.
  if (error && isMissing0034(error)) {
    if (usesNewFields) {
      return {
        error: "This template uses text/number, required or conditional questions, which need a database update (migration 0034).",
        sectionTitles: [],
      };
    }
    const NEW_COLS = ["item_key", "response_type", "unit", "required", "show_if"];
    const legacy = rows.map((r) =>
      Object.fromEntries(Object.entries(r).filter(([k]) => !NEW_COLS.includes(k))),
    );
    ({ error } = await supabase.from("inspection_checklist_items").insert(legacy));
  }
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

/** Characters that make a regex special; escaped so a term can be dropped
 *  straight into a pattern without breaking it. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Score a finding against one item's match terms. Multi-word phrases are
 * worth more than single words — "supported by the sprinkler" hitting is
 * far stronger evidence than the bare word "sprinkler".
 *
 * Single-word terms match on a WORD BOUNDARY, not a raw substring — a bare
 * `hay.includes("ppe")` matched inside "equipped", "shipped", "stopped",
 * every past-tense verb ending "-pped", which produced wrong AI-flagged
 * answers on real inspection photos (scripts/vision-eval.ts). Multi-word
 * phrases stay substring matches: they're long enough that a false hit
 * inside another phrase is vanishingly unlikely, and word-boundary regexes
 * for a full phrase get expensive to build/verify for no real benefit.
 */
function scoreItem(hay: string, terms: string[]): number {
  let score = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (!t) continue;
    if (t.includes(" ")) {
      if (hay.includes(t)) score += 2;
    } else {
      if (new RegExp(`\\b${escapeRegExp(t)}\\b`).test(hay)) score += 1;
    }
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
    // "*" so the 0034 columns come along when they exist, without failing
    // on databases that don't have them yet.
    .select("*")
    .eq("inspection_id", inspectionId);
  if (!items || items.length === 0) return 0;

  // Open = unanswered, or an unconfirmed AI answer we're allowed to refine.
  // Only yes/no questions take a pre-filled "no".
  const open = items.filter(
    (i) =>
      (i.response_type ?? "yesno") === "yesno" &&
      (i.answer === null || (i.answered_by_ai && !i.ai_confirmed)),
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

type ScoreInput = Pick<ChecklistItemRow, "answer"> &
  Partial<Pick<ChecklistItemRow, "item_key" | "response_type" | "show_if" | "value_text" | "value_number">>;

/**
 * Does this question apply? A show-if question applies only while its
 * target (an earlier yes/no question, itself visible) has the expected
 * answer. Rows without show_if always apply.
 */
export function isItemVisible<T extends ScoreInput>(item: T, all: T[], depth = 0): boolean {
  const cond = item.show_if;
  if (!cond) return true;
  if (depth > 20) return false; // defensive: a cycle never shows
  const target = all.find((i) => i.item_key === cond.item);
  if (!target || (target.response_type ?? "yesno") !== "yesno") return false;
  return target.answer === cond.equals && isItemVisible(target, all, depth + 1);
}

export function visibleItems<T extends ScoreInput>(items: T[]): T[] {
  return items.filter((i) => isItemVisible(i, items));
}

/** Answered = has a value for its type. */
export function isItemAnswered(item: ScoreInput): boolean {
  const type = item.response_type ?? "yesno";
  if (type === "text") return Boolean(item.value_text && String(item.value_text).trim());
  if (type === "number") return item.value_number !== null && item.value_number !== undefined && item.value_number !== "";
  return item.answer !== null && item.answer !== undefined;
}

/**
 * Score = Yes ÷ (Yes + No) over the questions that apply; N.A. and
 * text/number answers don't count toward it. `unanswered` counts every
 * applicable question without an answer, of any type.
 */
export function scoreItems(items: ScoreInput[]): ChecklistScore {
  let yes = 0,
    no = 0,
    na = 0,
    unanswered = 0;
  for (const i of visibleItems(items)) {
    if (!isItemAnswered(i)) unanswered++;
    else if ((i.response_type ?? "yesno") !== "yesno") continue;
    else if (i.answer === "yes") yes++;
    else if (i.answer === "no") no++;
    else if (i.answer === "na") na++;
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
