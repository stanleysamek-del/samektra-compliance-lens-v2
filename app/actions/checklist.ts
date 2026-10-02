"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { attachTemplate, resolveTemplate } from "@/lib/checklists/engine";
import type { TemplateSection } from "@/lib/checklists/builtin-templates";

/**
 * Checklist server actions: answering questions, confirming AI answers,
 * attaching a template to an existing inspection, and custom-template CRUD.
 * All writes ride RLS (can_write_inspection / template policies) — the
 * actions themselves only shape the payload.
 */

type ActionResult = { ok: boolean; error?: string };

function revalidateInspection(inspectionId: string) {
  revalidatePath(`/inspections/${inspectionId}`);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Completed inspections are locked. The UI hides the controls, but the
 * server must refuse too — a stale tab could still post an answer.
 * The item must also belong to the inspection we revalidate.
 */
async function checkEditable(
  supabase: Supabase,
  itemId: string,
  inspectionId: string,
): Promise<string | null> {
  const { data: inspection } = await supabase
    .from("inspections")
    .select("status")
    .eq("id", inspectionId)
    .maybeSingle();
  if (!inspection) return "Inspection not found.";
  if (inspection.status === "completed") {
    return "This inspection is finalized — reopen it to change answers.";
  }
  const { data: item } = await supabase
    .from("inspection_checklist_items")
    .select("id")
    .eq("id", itemId)
    .eq("inspection_id", inspectionId)
    .maybeSingle();
  if (!item) return "Checklist question not found.";
  return null;
}

/** Drop the "AI: …" lines prefillChecklistFromFindings appends to a note. */
function stripAiNoteLines(note: string | null): string | null {
  if (!note) return note;
  const kept = note
    .split("\n")
    .filter((line) => !line.startsWith("AI: "))
    .join("\n")
    .trim();
  return kept.length > 0 ? kept : null;
}

export async function setChecklistAnswer(input: {
  itemId: string;
  inspectionId: string;
  answer: "yes" | "no" | "na" | null;
  note?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const locked = await checkEditable(supabase, input.itemId, input.inspectionId);
  if (locked) return { ok: false, error: locked };

  // "*": includes 0034's response_type when the column exists.
  const { data: current } = await supabase
    .from("inspection_checklist_items")
    .select("*")
    .eq("id", input.itemId)
    .maybeSingle();
  if (current && (current.response_type ?? "yesno") !== "yesno") {
    return { ok: false, error: "This question takes a written or numeric answer." };
  }

  const patch: Record<string, unknown> = {
    answer: input.answer,
    answered_by: input.answer === null ? null : user.id,
    answered_by_ai: false,
    ai_confirmed: false,
    answered_at: input.answer === null ? null : new Date().toISOString(),
  };
  // Overruling an AI "No": the question no longer describes that
  // deficiency, so unlink the finding/photo and drop the AI note line.
  // (The finding itself stays on its photo for the inspector to dismiss.)
  if (current?.answered_by_ai && !current.ai_confirmed && input.answer !== "no") {
    patch.finding_id = null;
    patch.photo_id = null;
    if (input.note === undefined) patch.note = stripAiNoteLines(current.note);
  }
  if (input.note !== undefined) patch.note = input.note;

  const { error } = await supabase
    .from("inspection_checklist_items")
    .update(patch)
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  revalidateInspection(input.inspectionId);
  return { ok: true };
}

/** Inspector agrees with an AI-prefilled "no" — keeps the AI provenance. */
export async function confirmAiAnswer(input: {
  itemId: string;
  inspectionId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const locked = await checkEditable(supabase, input.itemId, input.inspectionId);
  if (locked) return { ok: false, error: locked };

  const { error } = await supabase
    .from("inspection_checklist_items")
    .update({ ai_confirmed: true, answered_by: user.id })
    .eq("id", input.itemId)
    .eq("answered_by_ai", true);
  if (error) return { ok: false, error: error.message };
  revalidateInspection(input.inspectionId);
  return { ok: true };
}

export async function saveChecklistNote(input: {
  itemId: string;
  inspectionId: string;
  note: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const locked = await checkEditable(supabase, input.itemId, input.inspectionId);
  if (locked) return { ok: false, error: locked };
  const trimmed = input.note.trim();
  const { error } = await supabase
    .from("inspection_checklist_items")
    .update({ note: trimmed.length > 0 ? trimmed : null })
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  revalidateInspection(input.inspectionId);
  return { ok: true };
}

/**
 * Answer a text or number question (migration 0034). An empty value
 * clears the answer. Numbers must parse to a finite value.
 */
export async function setChecklistValue(input: {
  itemId: string;
  inspectionId: string;
  value: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const locked = await checkEditable(supabase, input.itemId, input.inspectionId);
  if (locked) return { ok: false, error: locked };

  const { data: item } = await supabase
    .from("inspection_checklist_items")
    .select("*")
    .eq("id", input.itemId)
    .maybeSingle();
  const type = (item?.response_type as string | undefined) ?? "yesno";
  if (type !== "text" && type !== "number") {
    return { ok: false, error: "This question takes a Yes / No / N.A. answer." };
  }

  const raw = input.value.trim();
  const patch: Record<string, unknown> = {
    answered_by: raw ? user.id : null,
    answered_at: raw ? new Date().toISOString() : null,
  };
  if (type === "text") {
    if (raw.length > 4000) return { ok: false, error: "Keep the answer under 4,000 characters." };
    patch.value_text = raw || null;
  } else {
    if (!raw) {
      patch.value_number = null;
    } else {
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: "Enter a number, e.g. 175 or 0.25." };
      patch.value_number = n;
    }
  }

  const { error } = await supabase.from("inspection_checklist_items").update(patch).eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  revalidateInspection(input.inspectionId);
  return { ok: true };
}

/**
 * Evidence for a question: link a photo (just taken with the question's
 * camera button) to the checklist item. The photo must belong to the same
 * inspection.
 */
export async function linkChecklistPhoto(input: {
  itemId: string;
  inspectionId: string;
  photoId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const locked = await checkEditable(supabase, input.itemId, input.inspectionId);
  if (locked) return { ok: false, error: locked };

  const { data: photo } = await supabase
    .from("photos")
    .select("id")
    .eq("id", input.photoId)
    .eq("inspection_id", input.inspectionId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "That photo isn't part of this inspection." };

  const { error } = await supabase
    .from("inspection_checklist_items")
    .update({ photo_id: input.photoId })
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };

  // An action already raised from this question gets the photo too, so it
  // shows on the report and the action's evidence.
  const { data: item } = await supabase
    .from("inspection_checklist_items")
    .select("finding_id")
    .eq("id", input.itemId)
    .maybeSingle();
  if (item?.finding_id) {
    await supabase
      .from("findings")
      .update({ photo_id: input.photoId })
      .eq("id", item.finding_id)
      .is("photo_id", null);
  }

  revalidateInspection(input.inspectionId);
  return { ok: true };
}

/**
 * "Create action" on a question: record the deficiency as a finding
 * (photo optional — the question's photo when there is one), link it to
 * the question, and return its id so the UI can open the assign/due-date
 * strip right there. One action per question.
 */
export async function createChecklistFinding(input: {
  itemId: string;
  inspectionId: string;
  title: string;
  severity: "Low" | "Medium" | "High";
  description?: string | null;
}): Promise<ActionResult & { findingId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const locked = await checkEditable(supabase, input.itemId, input.inspectionId);
  if (locked) return { ok: false, error: locked };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Describe the problem first." };
  const severity = ["Low", "Medium", "High"].includes(input.severity) ? input.severity : "Medium";

  const { data: item } = await supabase
    .from("inspection_checklist_items")
    .select("finding_id, photo_id, code_ref")
    .eq("id", input.itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Checklist question not found." };
  if (item.finding_id) {
    return { ok: false, error: "This question already has an action." };
  }

  const { data: finding, error } = await supabase
    .from("findings")
    .insert({
      inspection_id: input.inspectionId,
      photo_id: item.photo_id ?? null,
      title: title.slice(0, 300),
      severity,
      category: "Other",
      code: item.code_ref ?? null,
      description: input.description?.trim() || null,
      edited: true,
      ai_confidence: null,
    })
    .select("id")
    .single();
  if (error || !finding) {
    console.error("[createChecklistFinding]", error);
    return { ok: false, error: "Couldn't create the action. Try again." };
  }

  const { error: linkErr } = await supabase
    .from("inspection_checklist_items")
    .update({ finding_id: finding.id })
    .eq("id", input.itemId);
  if (linkErr) {
    // Don't leave an orphan the inspector can't find from the question.
    await supabase.from("findings").delete().eq("id", finding.id);
    return { ok: false, error: "Couldn't link the action to the question. Try again." };
  }

  revalidateInspection(input.inspectionId);
  revalidatePath("/actions");
  return { ok: true, findingId: finding.id as string };
}

/** Attach a template to an EXISTING inspection that has no checklist yet. */
export async function attachChecklistToInspection(input: {
  inspectionId: string;
  templateId: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: inspection } = await supabase
    .from("inspections")
    .select("status")
    .eq("id", input.inspectionId)
    .maybeSingle();
  if (!inspection) return { ok: false, error: "Inspection not found." };
  if (inspection.status === "completed") {
    return { ok: false, error: "This inspection is finalized — reopen it to add a checklist." };
  }

  const { count } = await supabase
    .from("inspection_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("inspection_id", input.inspectionId);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "This inspection already has a checklist." };
  }

  const template = await resolveTemplate(supabase, input.templateId);
  if (!template) return { ok: false, error: "Template not found" };

  const { error } = await attachTemplate(supabase, input.inspectionId, template);
  if (error) return { ok: false, error };
  revalidateInspection(input.inspectionId);
  return { ok: true };
}

// ---- Custom template CRUD --------------------------------------------

function validSections(sections: unknown): sections is TemplateSection[] {
  if (!Array.isArray(sections) || sections.length === 0) return false;
  for (const s of sections) {
    if (typeof s?.code !== "string" || typeof s?.title !== "string") return false;
    if (!Array.isArray(s?.items) || s.items.length === 0) return false;
    for (const item of s.items) {
      if (typeof item?.q !== "string" || item.q.trim().length === 0) return false;
      if (item.match !== undefined && !Array.isArray(item.match)) return false;
      if (item.type !== undefined && !["yesno", "text", "number"].includes(item.type)) return false;
      if (item.required !== undefined && typeof item.required !== "boolean") return false;
      if (item.unit !== undefined && (typeof item.unit !== "string" || item.unit.length > 20)) return false;
      if (item.id !== undefined && (typeof item.id !== "string" || item.id.length > 60)) return false;
    }
  }
  return true;
}

/**
 * Show-if rules must point at an EARLIER yes/no question of the same
 * template (so they can't loop), with a Yes/No/N.A. value.
 */
function showIfProblem(sections: TemplateSection[]): string | null {
  const earlier = new Map<string, string>(); // id -> type
  const ids = new Set<string>();
  for (const s of sections) {
    for (const item of s.items) {
      if (item.id) {
        if (ids.has(item.id)) return "Two questions share the same id.";
        ids.add(item.id);
      }
      if (item.showIf) {
        const target = earlier.get(item.showIf.item);
        if (!target) return `"${item.q.slice(0, 60)}" depends on a question that isn't earlier in the template.`;
        if (target !== "yesno") return `"${item.q.slice(0, 60)}" can only depend on a Yes / No / N.A. question.`;
        if (!["yes", "no", "na"].includes(item.showIf.equals)) return "A condition needs Yes, No or N.A.";
      }
      if (item.id) earlier.set(item.id, item.type ?? "yesno");
    }
  }
  return null;
}

export async function saveChecklistTemplate(input: {
  id?: string | null;
  name: string;
  description?: string | null;
  occupancy?: string | null;
  sections: TemplateSection[];
  orgId?: string | null;
}): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Template name is required" };
  if (!validSections(input.sections)) {
    return {
      ok: false,
      error: "Every section needs a code, a title, and at least one question.",
    };
  }
  const logicProblem = showIfProblem(input.sections);
  if (logicProblem) return { ok: false, error: logicProblem };
  const totalItems = input.sections.reduce((n, s) => n + s.items.length, 0);
  if (totalItems > 300) {
    return { ok: false, error: "Templates are capped at 300 questions." };
  }

  const row = {
    name,
    description: input.description?.trim() || null,
    occupancy: input.occupancy?.trim() || null,
    sections: input.sections,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabase
      .from("checklist_templates")
      .update(row)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/templates");
    return { ok: true, id: input.id };
  }

  const { data, error } = await supabase
    .from("checklist_templates")
    .insert({ ...row, org_id: input.orgId ?? null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/templates");
  return { ok: true, id: data.id };
}

export async function deleteChecklistTemplate(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/templates");
  return { ok: true };
}
