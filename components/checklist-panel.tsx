"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Card } from "@/components/card";
import {
  confirmAiAnswer,
  saveChecklistNote,
  setChecklistAnswer,
} from "@/app/actions/checklist";
import type { ChecklistItemRow } from "@/lib/checklists/engine";
import { scoreItems } from "@/lib/checklists/engine";
import { HelpTip } from "@/components/help-tip";
import {
  ChecklistItemRowView,
  type ActionContext,
  type LinkedFinding,
} from "@/components/checklist-item-row";

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
  /** Signed thumbnail URLs for photos linked to questions, by photo id. */
  photoUrls?: Record<string, string>;
  /** Actions (findings) linked to questions, by finding id. */
  linkedFindings?: Record<string, LinkedFinding>;
  actionContext?: ActionContext;
};

const NO_ACTIONS: ActionContext = { members: [], currentUserId: "", readOnly: true };

function pctLabel(pct: number | null): string {
  return pct === null ? "—" : `${pct}%`;
}

export function ChecklistPanel({
  inspectionId,
  items,
  readOnly,
  photoUrls = {},
  linkedFindings = {},
  actionContext = NO_ACTIONS,
}: Props) {
  // Optimistic local copy — server actions revalidate, but the panel
  // should feel instant on a phone in a stairwell.
  const [local, setLocal] = useState<ChecklistItemRow[]>(items);
  // Items with a save still in flight — their optimistic value must survive
  // a server refresh that lands before the save does.
  const pending = useRef<Map<string, number>>(new Map());
  // When the server sends fresh rows (router.refresh() after AI analysis
  // fills answers in), adopt them; keep only rows the user is mid-save on.
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setLocal((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      return items.map((i) =>
        (pending.current.get(i.id) ?? 0) > 0 ? (byId.get(i.id) ?? i) : i,
      );
    });
  }
  // Explicit user toggles win; sections with flagged (No) answers OR any
  // unconfirmed AI answer default open so nothing that needs a human is
  // hidden behind a collapsed header.
  const [toggled, setToggled] = useState<Map<string, boolean>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function track(itemId: string, delta: 1 | -1) {
    const n = (pending.current.get(itemId) ?? 0) + delta;
    if (n > 0) pending.current.set(itemId, n);
    else pending.current.delete(itemId);
  }

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

  const nextUnanswered = sections.find(section => section.rows.some(row => row.answer === null));
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
    const overrulesAi = item.answered_by_ai && !item.ai_confirmed && next !== "no";
    patchLocal(item.id, {
      answer: next,
      answered_by_ai: false,
      ai_confirmed: false,
      // Mirrors setChecklistAnswer: overruling the AI unlinks its finding.
      ...(overrulesAi
        ? {
            photo_id: null,
            finding_id: null,
            note:
              item.note
                ?.split("\n")
                .filter((l) => !l.startsWith("AI: "))
                .join("\n")
                .trim() || null,
          }
        : {}),
    });
    track(item.id, 1);
    startTransition(async () => {
      try {
        const res = await setChecklistAnswer({
          itemId: item.id,
          inspectionId,
          answer: next,
        });
        if (!res.ok) {
          patchLocal(item.id, item);
          setError(res.error ?? "Couldn't save the answer.");
        }
      } catch {
        patchLocal(item.id, item);
        setError("Couldn't save the answer — check your connection and try again.");
      } finally {
        track(item.id, -1);
      }
    });
  }

  function confirm(item: ChecklistItemRow) {
    if (readOnly) return;
    patchLocal(item.id, { ai_confirmed: true });
    track(item.id, 1);
    startTransition(async () => {
      try {
        const res = await confirmAiAnswer({ itemId: item.id, inspectionId });
        if (!res.ok) {
          patchLocal(item.id, item);
          setError(res.error ?? "Couldn't confirm.");
        }
      } catch {
        patchLocal(item.id, item);
        setError("Couldn't confirm — check your connection and try again.");
      } finally {
        track(item.id, -1);
      }
    });
  }

  async function saveNote(item: ChecklistItemRow, note: string): Promise<boolean> {
    const trimmed = note.trim();
    patchLocal(item.id, { note: trimmed.length > 0 ? trimmed : null });
    track(item.id, 1);
    try {
      const res = await saveChecklistNote({ itemId: item.id, inspectionId, note });
      if (!res.ok) {
        patchLocal(item.id, { note: item.note });
        setError(res.error ?? "Couldn't save the note.");
        return false;
      }
      return true;
    } catch {
      patchLocal(item.id, { note: item.note });
      setError("Couldn't save the note — check your connection and try again.");
      return false;
    } finally {
      track(item.id, -1);
    }
  }

  /** Open the question's section, scroll it to the middle, focus it. */
  function goToItem(itemId: string) {
    const target = local.find((i) => i.id === itemId);
    if (!target) return;
    setToggled((prev) => new Map(prev).set(target.section_code, true));
    // Wait for the section to render before scrolling.
    window.setTimeout(() => {
      const el = document.getElementById(`q-${itemId}`);
      // Focus first: focusing after a smooth scroll starts cancels it.
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  // Deep links from the Review step: ?step=audit#q-<id>.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#q-")) return;
    const t = window.setTimeout(() => goToItem(hash.slice(3)), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstUnanswered = local.find((i) => i.answer === null) ?? null;

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
        <div
          role="alert"
          className="mx-5 mt-3 flex items-start justify-between gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="shrink-0 px-1 font-semibold"
          >
            ✕
          </button>
        </div>
      ) : null}

      <div>
        {sections.map((section) => {
          const s = scoreItems(section.rows);
          const flagged = section.rows.filter((r) => r.answer === "no").length;
          const unconfirmedAi = section.rows.filter(
            (r) => r.answered_by_ai && !r.ai_confirmed,
          ).length;
          const open = toggled.get(section.code) ?? (flagged > 0 || unconfirmedAi > 0 || (!readOnly && section.code === nextUnanswered?.code));
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
                    <span className="ml-2 rounded bg-[#fdecea] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--danger)]">
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
                    <ChecklistItemRowView
                      key={item.id}
                      item={item}
                      index={idx + 1}
                      inspectionId={inspectionId}
                      readOnly={readOnly}
                      photoUrl={item.photo_id ? (photoUrls[item.photo_id] ?? null) : null}
                      linkedFinding={item.finding_id ? (linkedFindings[item.finding_id] ?? null) : null}
                      actionContext={actionContext}
                      onAnswer={answer}
                      onConfirm={confirm}
                      onSaveNote={(note) => saveNote(item, note)}
                      onPatch={(patch) => patchLocal(item.id, patch)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Floating "next unanswered" — always one tap to the next gap,
          above the phone tab bar and the iPhone home indicator. */}
      {!readOnly && firstUnanswered ? (
        <button
          type="button"
          onClick={() => goToItem(firstUnanswered.id)}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-20 inline-flex min-h-12 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-[var(--ink)] bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--paper)] shadow-lg lg:bottom-6 lg:left-[calc(50%+8rem)]"
        >
          Next unanswered
          <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-xs tabular-nums text-[var(--ink)]">
            {overall.unanswered}
          </span>
          <span aria-hidden>↓</span>
        </button>
      ) : null}
    </Card>
  );
}
