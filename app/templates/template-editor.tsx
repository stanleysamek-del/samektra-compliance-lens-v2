"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/card";
import { HelpTip } from "@/components/help-tip";
import {
  deleteChecklistTemplate,
  saveChecklistTemplate,
} from "@/app/actions/checklist";
import type { TemplateSection } from "@/lib/checklists/builtin-templates";

/**
 * Custom checklist template editor — used for "create from scratch",
 * "duplicate a built-in", and "edit my template". Sections hold questions;
 * each question can carry a code reference and AI match terms (the
 * substrings the analyzer scores findings against for auto-filing).
 *
 * Work-loss guards: removing a section or a question with text asks
 * first; Cancel asks when there are unsaved changes; and the browser's
 * own leave-page prompt fires while the editor is dirty.
 */

type Props = {
  templateId?: string | null;
  initial: {
    name: string;
    description: string;
    occupancy: string;
    sections: TemplateSection[];
  };
  orgId?: string | null;
  orgName?: string | null;
};

const EMPTY_SECTIONS: TemplateSection[] = [
  { code: "A1", title: "", items: [{ q: "" }] },
];

export function TemplateEditor({ templateId, initial, orgId, orgName }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [occupancy, setOccupancy] = useState(initial.occupancy);
  const [sections, setSections] = useState<TemplateSection[]>(
    initial.sections.length > 0 ? initial.sections : EMPTY_SECTIONS,
  );
  const [shareWithOrg, setShareWithOrg] = useState(Boolean(orgId));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Snapshot of the initial state so "dirty" means "differs from what was
  // loaded", not "any keystroke ever". Captured once on mount (lazy
  // useState — never updated, so it's stable across renders).
  const [initialSnapshot] = useState(() =>
    JSON.stringify({
      name: initial.name,
      description: initial.description,
      occupancy: initial.occupancy,
      sections: initial.sections.length > 0 ? initial.sections : EMPTY_SECTIONS,
      shareWithOrg: Boolean(orgId),
    }),
  );
  const currentSnapshot = useMemo(
    () => JSON.stringify({ name, description, occupancy, sections, shareWithOrg }),
    [name, description, occupancy, sections, shareWithOrg],
  );
  const dirty = currentSnapshot !== initialSnapshot;

  // Once a save/delete succeeds we navigate away — don't let the
  // beforeunload guard (or Cancel) fire on that navigation.
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (leavingRef.current) return;
      e.preventDefault();
      // Legacy browsers need returnValue set to show the prompt.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function patchSection(idx: number, patch: Partial<TemplateSection>) {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }

  function patchItem(
    sIdx: number,
    iIdx: number,
    patch: Partial<TemplateSection["items"][number]> & { matchText?: string },
  ) {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        return {
          ...s,
          items: s.items.map((item, j) => {
            if (j !== iIdx) return item;
            const next = { ...item, ...patch };
            if (patch.matchText !== undefined) {
              const terms = patch.matchText
                .split(",")
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean);
              next.match = terms.length > 0 ? terms : undefined;
              delete (next as Record<string, unknown>).matchText;
            }
            return next;
          }),
        };
      }),
    );
  }

  function removeSection(sIdx: number) {
    const section = sections[sIdx];
    const filled = section.items.filter((i) => i.q.trim().length > 0).length;
    const label = section.title.trim() || section.code.trim() || "this section";
    const ok = window.confirm(
      filled > 0
        ? `Remove ${label} and its ${filled} question${filled === 1 ? "" : "s"}? This can't be undone once you save.`
        : `Remove ${label}?`,
    );
    if (!ok) return;
    setSections((prev) => prev.filter((_, i) => i !== sIdx));
  }

  function removeQuestion(sIdx: number, iIdx: number) {
    const item = sections[sIdx].items[iIdx];
    if (item.q.trim().length > 0) {
      const preview = item.q.trim().length > 60 ? `${item.q.trim().slice(0, 57)}…` : item.q.trim();
      if (!window.confirm(`Remove this question?\n\n“${preview}”`)) return;
    }
    patchSection(sIdx, {
      items: sections[sIdx].items.filter((_, j) => j !== iIdx),
    });
  }

  function save() {
    setError(null);
    // Strip empty questions/sections before validating server-side.
    const cleaned = sections
      .map((s) => ({
        code: s.code.trim(),
        title: s.title.trim(),
        items: s.items.filter((i) => i.q.trim().length > 0),
      }))
      .filter((s) => s.code && s.title && s.items.length > 0);
    startTransition(async () => {
      const res = await saveChecklistTemplate({
        id: templateId ?? null,
        name,
        description,
        occupancy,
        sections: cleaned,
        orgId: shareWithOrg ? orgId : null,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save the template.");
        return;
      }
      leavingRef.current = true;
      router.push("/templates");
      router.refresh();
    });
  }

  function cancel() {
    if (
      dirty &&
      !window.confirm("Discard your unsaved changes to this template?")
    ) {
      return;
    }
    leavingRef.current = true;
    router.push("/templates");
  }

  function remove() {
    if (!templateId) return;
    if (!window.confirm("Delete this template? Existing inspections keep their checklists.")) {
      return;
    }
    startTransition(async () => {
      const res = await deleteChecklistTemplate(templateId);
      if (!res.ok) {
        setError(res.error ?? "Couldn't delete the template.");
        return;
      }
      leavingRef.current = true;
      router.push("/templates");
      router.refresh();
    });
  }

  const totalQuestions = sections.reduce(
    (n, s) => n + s.items.filter((i) => i.q.trim()).length,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col sm:col-span-2">
            <label className="cl-label" htmlFor="tpl-name">Template name *</label>
            <input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="cl-input"
              placeholder="Hospital Smoke Compartment Round — Campus A"
            />
          </div>
          <div className="flex flex-col">
            <label className="cl-label" htmlFor="tpl-occupancy">Occupancy</label>
            <input
              id="tpl-occupancy"
              value={occupancy}
              onChange={(e) => setOccupancy(e.target.value)}
              className="cl-input"
              placeholder="Healthcare / Business / Restaurant…"
            />
          </div>
          <div className="flex flex-col">
            <label className="cl-label" htmlFor="tpl-description">Description</label>
            <input
              id="tpl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="cl-input"
              placeholder="What this round covers"
            />
          </div>
        </div>
        {orgId && !templateId ? (
          <label className="mt-3 flex items-center gap-2 text-sm text-[var(--fg)]">
            <input
              type="checkbox"
              checked={shareWithOrg}
              onChange={(e) => setShareWithOrg(e.target.checked)}
            />
            Share with {orgName ?? "my team"} (everyone on the team can use it)
          </label>
        ) : null}
      </Card>

      {sections.map((section, sIdx) => (
        <Card key={sIdx}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <input
                value={section.code}
                onChange={(e) => patchSection(sIdx, { code: e.target.value })}
                className="cl-input w-20"
                placeholder="A1"
                aria-label="Section code"
              />
              <HelpTip title="Section code" side="bottom">
                Short code that prefixes each question number on the report
                (A1 → A1.1, A1.2…). Match your existing paper forms so
                surveyors recognize the numbering.
              </HelpTip>
            </div>
            <input
              value={section.title}
              onChange={(e) => patchSection(sIdx, { title: e.target.value })}
              className="cl-input flex-1"
              placeholder="Section title (e.g. Fire Doors)"
              aria-label="Section title"
            />
            <button
              type="button"
              onClick={() => removeSection(sIdx)}
              className="cl-btn-outline px-3 py-1.5 text-xs"
            >
              Remove section
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {section.items.map((item, iIdx) => (
              <div
                key={iIdx}
                className="rounded border border-[var(--border)] p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs tabular-nums text-[var(--fg-subtle)]">
                    {section.code || "?"}.{iIdx + 1}
                  </span>
                  <textarea
                    value={item.q}
                    onChange={(e) => patchItem(sIdx, iIdx, { q: e.target.value })}
                    rows={2}
                    className="cl-input flex-1 text-sm"
                    placeholder="Question — phrased so 'Yes' means compliant"
                    aria-label={`Question ${section.code || "?"}.${iIdx + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeQuestion(sIdx, iIdx)}
                    className="cl-btn-outline min-h-[40px] min-w-[40px] px-2 py-1 text-xs"
                    aria-label="Remove question"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={item.ref ?? ""}
                    onChange={(e) =>
                      patchItem(sIdx, iIdx, {
                        ref: e.target.value.trim() || undefined,
                      })
                    }
                    className="cl-input text-xs"
                    placeholder="Code ref (optional) — NFPA 80 §5.2"
                    aria-label="Code reference"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      defaultValue={(item.match ?? []).join(", ")}
                      onChange={(e) =>
                        patchItem(sIdx, iIdx, { matchText: e.target.value })
                      }
                      className="cl-input flex-1 text-xs"
                      placeholder="AI match terms (optional) — door latch, latching"
                      aria-label="AI match terms"
                    />
                    <HelpTip title="AI match terms" side="bottom">
                      Comma-separated words Chip watches for. When a photo
                      produces a finding whose text contains one of these,
                      this question is auto-marked No for you to confirm.
                      Leave blank for questions only a human can judge, like
                      a records review.
                    </HelpTip>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patchSection(sIdx, { items: [...section.items, { q: "" }] })
              }
              className="cl-btn-outline self-start px-3 py-1.5 text-xs"
            >
              + Add question
            </button>
          </div>
        </Card>
      ))}

      <button
        type="button"
        onClick={() =>
          setSections((prev) => [
            ...prev,
            { code: `A${prev.length + 1}`, title: "", items: [{ q: "" }] },
          ])
        }
        className="cl-btn-outline self-start"
      >
        + Add section
      </button>

      {error ? (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-busy={pending}
          className="cl-btn-accent"
        >
          {pending ? "Saving…" : templateId ? "Save changes" : "Create template"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="cl-btn-outline"
        >
          Cancel
        </button>
        {templateId ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="ml-auto text-sm font-medium text-red-700 underline"
          >
            Delete template
          </button>
        ) : null}
        <span className="w-full text-xs text-[var(--fg-subtle)]">
          {totalQuestions} question{totalQuestions === 1 ? "" : "s"} across{" "}
          {sections.length} section{sections.length === 1 ? "" : "s"}
          {dirty ? (
            <span className="ml-2 font-medium" style={{ color: "#b8762a" }}>
              · Unsaved changes
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
