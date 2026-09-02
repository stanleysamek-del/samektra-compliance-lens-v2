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

  const patch: Record<string, unknown> = {
    answer: input.answer,
    answered_by: input.answer === null ? null : user.id,
    answered_by_ai: false,
    ai_confirmed: false,
    answered_at: input.answer === null ? null : new Date().toISOString(),
  };
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
  const trimmed = input.note.trim();
  const { error } = await supabase
    .from("inspection_checklist_items")
    .update({ note: trimmed.length > 0 ? trimmed : null })
    .eq("id", input.itemId);
  if (error) return { ok: false, error: error.message };
  revalidateInspection(input.inspectionId);
  return { ok: true };
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
    }
  }
  return true;
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
