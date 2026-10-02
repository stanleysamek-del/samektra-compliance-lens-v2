"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/card";
import { HelpTip } from "@/components/help-tip";
import {
  deleteChecklistTemplate,
  saveChecklistTemplate,
} from "@/app/actions/checklist";
import type { TemplateItem, TemplateSection } from "@/lib/checklists/builtin-templates";

import { confirmDialog } from "@/components/ui/confirm-dialog";
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
  { code: "A1", title: "", items: [{ q: "", id: "k1" }] },
];

/** Next free "k<n>" question id — ids let show-if rules point at a question. */
function nextKey(sections: TemplateSection[]): string {
  let max = 0;
  for (const s of sections) for (const i of s.items) {
    const m = /^k(\d+)$/.exec(i.id ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `k${max + 1}`;
}

/** Give every question an id (older templates were saved without them). */
function withIds(sections: TemplateSection[]): TemplateSection[] {
  let n = 0;
  const used = new Set(sections.flatMap((s) => s.items.map((i) => i.id).filter(Boolean)));
  return sections.map((s) => ({
    ...s,
    items: s.items.map((i) => {
      if (i.id) return i;
      let id: string;
      do id = `k${++n}`; while (used.has(id));
      used.add(id);
      return { ...i, id };
    }),
  }));
}

const TYPE_LABEL: Record<NonNullable<TemplateItem["type"]>, string> = {
  yesno: "Yes / No / N.A.",
  text: "Text",
  number: "Number",
};

export function TemplateEditor({ templateId, initial, orgId, orgName }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [occupancy, setOccupancy] = useState(initial.occupancy);
  const [startSections] = useState(() =>
    withIds(initial.sections.length > 0 ? initial.sections : EMPTY_SECTIONS),
  );
  const [sections, setSections] = useState<TemplateSection[]>(startSections);
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
      sections: startSections,
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
    if (patch.type && patch.type !== "yesno") {
      const id = sections[sIdx].items[iIdx].id;
      if (id) dropRulesTo(id);
    }
  }

  /** Remove "only ask if" rules that refer to this question. */
  function dropRulesTo(id: string) {
    setSections((prev) =>
      prev.map((s) => ({
        ...s,
        items: s.items.map((i) => (i.showIf?.item === id ? { ...i, showIf: undefined } : i)),
      })),
    );
  }

  async function removeSection(sIdx: number) {
    const section = sections[sIdx];
    const filled = section.items.filter((i) => i.q.trim().length > 0).length;
    const label = section.title.trim() || section.code.trim() || "this section";
    const ok = await confirmDialog({
      title: `Remove ${label}?`,
      message:
        filled > 0
          ? `Its ${filled} question${filled === 1 ? "" : "s"} go too. This can't be undone once you save.`
          : undefined,
      confirmLabel: "Remove section",
      tone: "danger",
    });
    if (!ok) return;
    setSections((prev) => prev.filter((_, i) => i !== sIdx));
  }

  async function removeQuestion(sIdx: number, iIdx: number) {
    const item = sections[sIdx].items[iIdx];
    if (item.q.trim().length > 0) {
      const preview = item.q.trim().length > 60 ? `${item.q.trim().slice(0, 57)}…` : item.q.trim();
      const ok = await confirmDialog({
        title: "Remove this question?",
        message: `“${preview}”`,
        confirmLabel: "Remove",
        tone: "danger",
      });
      if (!ok) return;
    }
    patchSection(sIdx, {
      items: sections[sIdx].items.filter((_, j) => j !== iIdx),
    });
    if (item.id) dropRulesTo(item.id);
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

  async function cancel() {
    if (
      dirty &&
      !(await confirmDialog({
        title: "Discard your unsaved changes?",
        confirmLabel: "Discard changes",
        tone: "danger",
      }))
    ) {
      return;
    }
    leavingRef.current = true;
    router.push("/templates");
  }

  async function remove() {
    if (!templateId) return;
    const ok = await confirmDialog({
      title: "Delete this template?",
      message: "Existing inspections keep their checklists.",
      confirmLabel: "Delete template",
      tone: "danger",
    });
    if (!ok) return;
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
                    placeholder={
                      (item.type ?? "yesno") === "yesno"
                        ? "Question — phrased so 'Yes' means compliant"
                        : item.type === "number"
                          ? "What to measure — e.g. Extinguisher gauge pressure"
                          : "What to record — e.g. Panel ID"
                    }
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
                  {/* AI pre-fill only answers Yes / No questions. */}
                  {(item.type ?? "yesno") === "yesno" ? (
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
                  ) : null}
                </div>
                <QuestionOptions
                  item={item}
                  earlier={sections
                    .flatMap((sec, si) =>
                      sec.items.map((it, ii) => ({ it, label: `${sec.code || "?"}.${ii + 1}`, si, ii })),
                    )
                    .filter(
                      (x) =>
                        (x.si < sIdx || (x.si === sIdx && x.ii < iIdx)) &&
                        (x.it.type ?? "yesno") === "yesno" &&
                        x.it.q.trim() &&
                        x.it.id,
                    )
                    .map((x) => ({ id: x.it.id!, label: `${x.label} ${x.it.q.trim().slice(0, 60)}` }))}
                  onChange={(patch) => patchItem(sIdx, iIdx, patch)}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patchSection(sIdx, { items: [...section.items, { q: "", id: nextKey(sections) }] })
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
            { code: `A${prev.length + 1}`, title: "", items: [{ q: "", id: nextKey(prev) }] },
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
            <span className="ml-2 font-medium" style={{ color: "#8a5300" }}>
              · Unsaved changes
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/**
 * Answer type, unit, Required, and "only ask if" for one question.
 * Conditions can only point at an EARLIER Yes/No question, so a template
 * can never loop.
 */
function QuestionOptions({
  item,
  earlier,
  onChange,
}: {
  item: TemplateItem;
  earlier: Array<{ id: string; label: string }>;
  onChange: (patch: Partial<TemplateItem>) => void;
}) {
  const type = item.type ?? "yesno";
  return (
    <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-[var(--rule-paper)] pt-2">
      <label className="flex flex-col text-xs text-[var(--fg-muted)]">
        Answer
        <select
          className="cl-input mt-1 w-auto text-sm"
          value={type}
          onChange={(e) => {
            const next = e.target.value as NonNullable<TemplateItem["type"]>;
            onChange({
              type: next === "yesno" ? undefined : next,
              unit: next === "number" ? item.unit : undefined,
            });
          }}
        >
          {(Object.keys(TYPE_LABEL) as Array<keyof typeof TYPE_LABEL>).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      {type === "number" ? (
        <label className="flex flex-col text-xs text-[var(--fg-muted)]">
          Unit
          <input
            className="cl-input mt-1 w-24 text-sm"
            value={item.unit ?? ""}
            maxLength={20}
            placeholder="psi"
            onChange={(e) => onChange({ unit: e.target.value.trim() || undefined })}
          />
        </label>
      ) : null}
      <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--ink)]">
        <input
          type="checkbox"
          checked={Boolean(item.required)}
          onChange={(e) => onChange({ required: e.target.checked || undefined })}
        />
        Required
      </label>
      <div className="flex flex-col text-xs text-[var(--fg-muted)]">
        <span className="flex items-center gap-1">
          Only ask if
          <HelpTip title="Only ask if" side="bottom">
            Show this question only when an earlier Yes / No question has a
            given answer — e.g. ask &ldquo;Describe the damage&rdquo; only when
            &ldquo;Door in good condition?&rdquo; is No. Questions that
            don&apos;t apply are skipped on the inspection and the report.
          </HelpTip>
        </span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <select
            aria-label="Only ask if this question"
            className="cl-input w-auto max-w-[16rem] text-sm"
            value={item.showIf?.item ?? ""}
            onChange={(e) =>
              onChange({
                showIf: e.target.value
                  ? { item: e.target.value, equals: item.showIf?.equals ?? "no" }
                  : undefined,
              })
            }
          >
            <option value="">Always ask</option>
            {earlier.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
          {item.showIf ? (
            <select
              aria-label="has the answer"
              className="cl-input w-auto text-sm"
              value={item.showIf.equals}
              onChange={(e) =>
                onChange({
                  showIf: { item: item.showIf!.item, equals: e.target.value as "yes" | "no" | "na" },
                })
              }
            >
              <option value="no">is No</option>
              <option value="yes">is Yes</option>
              <option value="na">is N.A.</option>
            </select>
          ) : null}
        </div>
      </div>
    </div>
  );
}
