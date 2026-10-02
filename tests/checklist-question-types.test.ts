import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isItemVisible, scoreItems, visibleItems } from "@/lib/checklists/engine";
import type { ChecklistItemRow } from "@/lib/checklists/engine";

// Migration 0034 applied to a table shaped like 0022's checklist items.
let db: PGlite;
const migration = readFileSync("supabase/migrations/0034_checklist_question_types.sql", "utf8");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.inspection_checklist_items (
      id uuid primary key default gen_random_uuid(),
      inspection_id uuid not null,
      section_code text not null,
      section_title text not null,
      sort integer not null default 0,
      question text not null,
      answer text check (answer in ('yes', 'no', 'na'))
    );
    insert into public.inspection_checklist_items (inspection_id, section_code, section_title, question, answer)
    values ('33333333-3333-4333-8333-333333333333', 'A1', 'Egress', 'Legacy question', 'yes');
  `);
  await db.exec(migration);
});
afterAll(async () => db.close());

const insert = (cols: string, vals: string) =>
  db.exec(`insert into public.inspection_checklist_items (inspection_id, section_code, section_title, question, ${cols})
           values ('33333333-3333-4333-8333-333333333333', 'A1', 'Egress', 'Q', ${vals})`);

describe("migration 0034", () => {
  it("keeps existing rows as yes/no, optional, always shown", async () => {
    const { rows } = await db.query<{ response_type: string; required: boolean; show_if: unknown }>(
      "select response_type, required, show_if from public.inspection_checklist_items where question = 'Legacy question'",
    );
    expect(rows[0]).toEqual({ response_type: "yesno", required: false, show_if: null });
  });

  it("is safe to run twice", async () => {
    await expect(db.exec(migration)).resolves.toBeDefined();
  });

  it("stores text and number answers in their own columns", async () => {
    await expect(insert("response_type, value_text", "'text', 'Panel 2B'")).resolves.toBeDefined();
    await expect(insert("response_type, value_number, unit", "'number', 175.5, 'psi'")).resolves.toBeDefined();
  });

  it("rejects mixed or unknown answer types", async () => {
    await expect(insert("response_type, answer", "'number', 'yes'")).rejects.toThrow();
    await expect(insert("response_type, value_text", "'yesno', 'oops'")).rejects.toThrow();
    await expect(insert("response_type", "'date'")).rejects.toThrow();
    await expect(insert("response_type, value_text", `'text', '${"x".repeat(4001)}'`)).rejects.toThrow();
  });
});

const row = (p: Partial<ChecklistItemRow>): ChecklistItemRow => ({
  id: p.item_key ?? "x",
  inspection_id: "i",
  template_ref: null,
  template_name: null,
  section_code: "A1",
  section_title: "S",
  sort: 0,
  question: "Q",
  code_ref: null,
  match_terms: [],
  answer: null,
  note: null,
  answered_by: null,
  answered_by_ai: false,
  ai_confirmed: false,
  photo_id: null,
  finding_id: null,
  answered_at: null,
  ...p,
});

describe("show-if visibility and scoring", () => {
  const door = row({ item_key: "door", answer: "no" });
  const why = row({ item_key: "why", response_type: "text", show_if: { item: "door", equals: "no" } });
  const fixed = row({ item_key: "fixed", show_if: { item: "why", equals: "yes" } });
  const gap = row({ item_key: "gap", response_type: "number", value_number: 0.25, unit: "in" });

  it("shows a question only when its condition holds", () => {
    expect(isItemVisible(why, [door, why])).toBe(true);
    expect(isItemVisible(why, [{ ...door, answer: "yes" }, why])).toBe(false);
    // Conditions on a non-yes/no question never hold.
    expect(isItemVisible(fixed, [door, why, fixed])).toBe(false);
  });

  it("hides questions whose condition depends on a hidden question", () => {
    const a = row({ item_key: "a", answer: "yes" });
    const b = row({ item_key: "b", answer: "no", show_if: { item: "a", equals: "no" } });
    const c = row({ item_key: "c", show_if: { item: "b", equals: "no" } });
    expect(visibleItems([a, b, c]).map((i) => i.item_key)).toEqual(["a"]);
  });

  it("scores only visible yes/no questions and counts unanswered visible questions of any type", () => {
    const s = scoreItems([door, why, gap, row({ item_key: "q4", answer: "yes" })]);
    expect(s.yes).toBe(1);
    expect(s.no).toBe(1);
    expect(s.scored).toBe(2);
    expect(s.unanswered).toBe(1); // the visible text question
  });

  it("treats rows without the new fields exactly as before", () => {
    const s = scoreItems([{ answer: "yes" }, { answer: null }, { answer: "na" }]);
    expect(s).toMatchObject({ yes: 1, no: 0, na: 1, unanswered: 1, scored: 1, pct: 100 });
  });
});
