"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/card";
import {
  confirmAiAnswer,
  saveChecklistNote,
  setChecklistAnswer,
} from "@/app/actions/checklist";
import type { ChecklistItemRow } from "@/lib/checklists/engine";
import { scoreItems } from "@/lib/checklists/engine";
import { lswLinksForCitation } from "@/lib/lsw-links";
import { HelpTip } from "@/components/help-tip";

/**
 * The inspection checklist: sections of Yes/No/N.A. questions with live
 * scoring (yes ÷ (yes + no), N.A. excluded — the same math as the
 * customer's iAuditor reports). AI-prefilled answers show a gold badge
 * until the inspector confirms or changes them.
 */

type Props = {
  inspectionId: string;
  items: ChecklistItemRow[];
  readOnly: boolean;
};

const ANSWER_LABELS: Array<{ value: "yes" | "no" | "na"; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N.A." },
];

function pctLabel(pct: number | null): string {
  return pct === null ? "—" : `${pct}%`;
}

export function ChecklistPanel({ inspectionId, items, readOnly }: Props) {
  // Optimistic local copy — server actions revalidate, but the panel
  // should feel instant on a phone in a stairwell.
  const [local, setLocal] = useState<ChecklistItemRow[]>(items);
  // Explicit user toggles win; sections with flagged (No) answers OR any
  // unconfirmed AI answer default open so nothing that needs a human is
  // hidden behind a collapsed header.
  const [toggled, setToggled] = useState<Map<string, boolean>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sections = useMemo(() => {
    const map = new Map<string, { code: string; title: string; rows: ChecklistItemRow[] }>();
    for (const item of local) {
      const key = item.section_code;
      if (!map.has(key)) {
        map.set(key, {
          code: item.section_code,
          title: item.section_title,
          rows: [],
        });
      }
      map.get(key)!.rows.push(item);
    }
    return Array.from(map.values());
  }, [local]);

  const overall = scoreItems(local);
  const aiPending = local.filter((i) => i.answered_by_ai && !i.ai_confirmed).length;
  const templateName = local[0]?.template_name ?? "Checklist";

  function patchLocal(itemId: string, patch: Partial<ChecklistItemRow>) {
    setLocal((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    );
  }

  function answer(item: ChecklistItemRow, value: "yes" | "no" | "na") {
    if (readOnly) return;
    const next = item.answer === value && !item.answered_by_ai ? null : value;
    patchLocal(item.id, {
      answer: next,
      answered_by_ai: false,
      ai_confirmed: false,
    });
    startTransition(async () => {
      const res = await setChecklistAnswer({
        itemId: item.id,
        inspectionId,
        answer: next,
      });
      if (!res.ok) {
        patchLocal(item.id, item);
        setError(res.error ?? "Couldn't save the answer.");
      }
    });
  }

  function confirm(item: ChecklistItemRow) {
    if (readOnly) return;
    patchLocal(item.id, { ai_confirmed: true });
    startTransition(async () => {
      const res = await confirmAiAnswer({ itemId: item.id, inspectionId });
      if (!res.ok) {
        patchLocal(item.id, item);
        setError(res.error ?? "Couldn't confirm.");
      }
    });
  }

  function toggleSection(code: string, currentlyOpen: boolean) {
    setToggled((prev) => {
      const next = new Map(prev);
      next.set(code, !currentlyOpen);
      return next;
    });
  }

  return (
    <Card padded={false}>
      {/* Header with the overall score */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Checklist · {templateName}
          </h2>
          {aiPending > 0 ? (
            <p className="mt-1 text-xs font-medium text-[var(--accent)]">
              ✦ {aiPending} question{aiPending === 1 ? "" : "s"} flagged by AI —
              confirm or change below
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-xl font-semibold tabular-nums text-[var(--fg)]">
            <span>
              {overall.yes} / {overall.scored}
              <span className="ml-2 text-sm font-medium text-[var(--fg-muted)]">
                {pctLabel(overall.pct)}
              </span>
            </span>
            <HelpTip title="Checklist score" side="bottom">
              Score = Yes ÷ (Yes + No). N.A. (&ldquo;not applicable — this
              building doesn&apos;t have that system&rdquo;) is removed from
              the math, so it never hurts your score. Unanswered questions
              aren&apos;t counted but show as gaps on the report.
            </HelpTip>
          </div>
          <div className="text-[11px] text-[var(--fg-subtle)]">
            {overall.na} N.A. · {overall.unanswered} unanswered
          </div>
        </div>
      </div>

      {error ? (
        <p className="mx-5 mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6">
          {error}
        </p>
      ) : null}

      <div>
        {sections.map((section) => {
          const s = scoreItems(section.rows);
          const flagged = section.rows.filter((r) => r.answer === "no").length;
          const unconfirmedAi = section.rows.filter(
            (r) => r.answered_by_ai && !r.ai_confirmed,
          ).length;
          const open = toggled.get(section.code) ?? (flagged > 0 || unconfirmedAi > 0);
          return (
            <div key={section.code} className="border-b border-[var(--border)] last:border-b-0">
              <button
                type="button"
                onClick={() => toggleSection(section.code, open)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left sm:px-6"
                aria-expanded={open}
              >
                <span className="min-w-0 truncate text-sm font-medium text-[var(--fg)]">
                  {section.code}. {section.title}
                  {flagged > 0 ? (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                      {flagged} No
                    </span>
                  ) : null}
                  {unconfirmedAi > 0 ? (
                    <span className="ml-2 rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                      ✦ {unconfirmedAi} to confirm
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs tabular-nums text-[var(--fg-muted)]">
                    {s.yes}/{s.scored} · {pctLabel(s.pct)}
                  </span>
                  <span
                    aria-hidden
                    className="text-[var(--fg-subtle)]"
                    style={{
                      transform: open ? "rotate(90deg)" : "none",
                      transition: "transform .15s ease",
                    }}
                  >
                    ›
                  </span>
                </span>
              </button>

              {open ? (
                <div className="flex flex-col gap-3 px-5 pb-4 sm:px-6">
                  {section.rows.map((item, idx) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={idx + 1}
                      inspectionId={inspectionId}
                      readOnly={readOnly}
                      onAnswer={answer}
                      onConfirm={confirm}
                      onNoteSaved={(note) => patchLocal(item.id, { note })}
                      onError={setError}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ItemRow({
  item,
  index,
  inspectionId,
  readOnly,
  onAnswer,
  onConfirm,
  onNoteSaved,
  onError,
}: {
  item: ChecklistItemRow;
  index: number;
  inspectionId: string;
  readOnly: boolean;
  onAnswer: (item: ChecklistItemRow, value: "yes" | "no" | "na") => void;
  onConfirm: (item: ChecklistItemRow) => void;
  onNoteSaved: (note: string | null) => void;
  onError: (msg: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [, startTransition] = useTransition();

  const aiPending = item.answered_by_ai && !item.ai_confirmed;

  function saveNote() {
    setEditingNote(false);
    const trimmed = noteDraft.trim();
    onNoteSaved(trimmed.length > 0 ? trimmed : null);
    startTransition(async () => {
      const res = await saveChecklistNote({
        itemId: item.id,
        inspectionId,
        note: noteDraft,
      });
      if (!res.ok) onError(res.error ?? "Couldn't save the note.");
    });
  }

  return (
    <div
      className={`rounded border px-3 py-2.5 ${
        item.answer === "no"
          ? "border-red-300 bg-red-50/50"
          : "border-[var(--border)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-[var(--fg)]">
          <span className="mr-1.5 text-xs tabular-nums text-[var(--fg-subtle)]">
            {item.section_code}.{index}
          </span>
          {item.question}
          {item.code_ref ? (
            (() => {
              const lsw = lswLinksForCitation(item.code_ref)[0];
              return lsw ? (
                <a
                  href={lsw.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1.5 whitespace-nowrap text-[11px] text-[var(--accent)] underline decoration-dotted underline-offset-2"
                  title="Read this section on LifeSafetyWiki"
                >
                  {item.code_ref} ↗
                </a>
              ) : (
                <span className="ml-1.5 whitespace-nowrap text-[11px] text-[var(--fg-subtle)]">
                  {item.code_ref}
                </span>
              );
            })()
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {ANSWER_LABELS.map(({ value, label }) => {
            const active = item.answer === value;
            return (
              <button
                key={value}
                type="button"
                disabled={readOnly}
                onClick={() => onAnswer(item, value)}
                className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? value === "yes"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : value === "no"
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-[var(--fg-muted)] bg-[var(--fg-muted)] text-white"
                    : "border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--fg-muted)]"
                } ${readOnly ? "cursor-default opacity-60" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {aiPending ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-[var(--accent)]/10 px-2.5 py-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
            ✦ AI flagged
            <HelpTip title="AI flagged" side="bottom">
              A photo you uploaded matched this question, so the AI answered
              it. Nothing is final until you confirm — tap Confirm to agree,
              or Yes / No / N.A. to overrule. The report marks unconfirmed
              answers as AI-answered.
            </HelpTip>
          </span>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => onConfirm(item)}
              className="rounded border border-[var(--accent)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]"
            >
              Confirm
            </button>
          ) : null}
          <span className="text-[11px] text-[var(--fg-muted)]">
            or change the answer above
          </span>
        </div>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {item.photo_id ? (
          <Link
            href={`/inspections/${inspectionId}/photos/${item.photo_id}`}
            className="text-[11px] font-medium text-[var(--accent)] hover:underline"
          >
            View linked photo →
          </Link>
        ) : null}
        {!editingNote ? (
          <>
            {item.note ? (
              <span className="whitespace-pre-wrap text-xs text-[var(--fg-muted)]">
                {item.note}
              </span>
            ) : null}
            {!readOnly ? (
              <button
                type="button"
                onClick={() => {
                  setNoteDraft(item.note ?? "");
                  setEditingNote(true);
                }}
                className="text-[11px] text-[var(--fg-subtle)] underline"
              >
                {item.note ? "Edit note" : "Add note"}
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex w-full flex-col gap-1.5">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={2}
              className="cl-input text-sm"
              placeholder="What you observed, room number, notes…"
            />
            <div className="flex gap-2">
              <button type="button" onClick={saveNote} className="cl-btn-accent px-3 py-1 text-xs">
                Save note
              </button>
              <button
                type="button"
                onClick={() => setEditingNote(false)}
                className="cl-btn-outline px-3 py-1 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
