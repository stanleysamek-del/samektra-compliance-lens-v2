"use client";

import { finalizeInspection } from "@/app/inspections/[id]/actions";
import { HelpTip } from "@/components/help-tip";
import { SubmitButton } from "@/components/submit-button";

/**
 * Finalize pre-flight. Before the inspector locks the report, show — not
 * hide — what's still open: unanswered checklist questions, AI answers
 * nobody confirmed, punch-list items still waiting on a re-photograph,
 * and which signatures are on the page. Anything ⚠ turns the submit into
 * a confirm ("Finalize anyway?"). Nothing here blocks; it just stops the
 * surprise of a report that says "AI-answered" in a dozen places.
 *
 * Pure presentation over counts the server page already computed. The
 * form still posts to the existing finalizeInspection server action,
 * which redirects with ?error= on failure (the page renders that banner).
 */

type Props = {
  inspectionId: string;
  checklist: {
    /** Total questions on the checklist. 0 = no checklist on this inspection. */
    total: number;
    unanswered: number;
    /** answered_by_ai && !ai_confirmed */
    unconfirmedAi: number;
  };
  /** Not-visible items neither resolved nor skipped. */
  openPunchList: number;
  inspectorSigned: boolean;
  managerSigned: boolean;
};

type Check = { ok: boolean; label: string; detail?: string };

export function FinalizePreflight({
  inspectionId,
  checklist,
  openPunchList,
  inspectorSigned,
  managerSigned,
}: Props) {
  const checks: Check[] = [];

  if (checklist.total > 0) {
    checks.push({
      ok: checklist.unanswered === 0,
      label:
        checklist.unanswered === 0
          ? "Every checklist question answered"
          : `${checklist.unanswered} checklist question${checklist.unanswered === 1 ? "" : "s"} unanswered`,
      detail:
        checklist.unanswered === 0
          ? undefined
          : "Unanswered questions show as gaps on the report.",
    });
    checks.push({
      ok: checklist.unconfirmedAi === 0,
      label:
        checklist.unconfirmedAi === 0
          ? "All AI-flagged answers confirmed"
          : `${checklist.unconfirmedAi} AI-flagged answer${checklist.unconfirmedAi === 1 ? "" : "s"} not confirmed`,
      detail:
        checklist.unconfirmedAi === 0
          ? undefined
          : "The report marks these as AI-answered until you confirm or overrule them.",
    });
  }

  checks.push({
    ok: openPunchList === 0,
    label:
      openPunchList === 0
        ? "Punch list clear"
        : `${openPunchList} item${openPunchList === 1 ? "" : "s"} still need${openPunchList === 1 ? "s" : ""} a re-photograph`,
    detail:
      openPunchList === 0
        ? undefined
        : "Resolve with a better shot, or Skip with a reason, so the report doesn't list them as open.",
  });
  checks.push({
    ok: inspectorSigned,
    label: inspectorSigned ? "Inspector signed" : "Inspector signature missing",
  });
  checks.push({
    ok: managerSigned,
    label: managerSigned ? "Manager signed" : "Manager signature missing",
    detail: managerSigned
      ? undefined
      : "A manager can still sign after you finalize — this is a heads-up, not a blocker.",
  });

  const warnings = checks.filter((c) => !c.ok);
  const confirmMessage =
    warnings.length > 0
      ? `Finalize anyway?\n\n${warnings.map((w) => `• ${w.label}`).join("\n")}\n\nNothing is deleted — you can reopen to fix these later.`
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-[var(--fg)]">
            Done capturing photos?
            <HelpTip title="Finalize">
              Locks the inspection — no new photos, no edits — and makes the
              report and workbooks downloadable. Nothing is deleted; reopen
              any time to unlock editing.
            </HelpTip>
          </p>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Finalize locks the report and unlocks the downloads. You can
            reopen it later.
          </p>
        </div>
        <form action={finalizeInspection} className="shrink-0">
          <input type="hidden" name="inspection_id" value={inspectionId} />
          <input type="hidden" name="status" value="completed" />
          <SubmitButton
            className="cl-btn-primary"
            pendingLabel="Finalizing…"
            confirmMessage={confirmMessage}
          >
            Finalize inspection
          </SubmitButton>
        </form>
      </div>

      <ul
        aria-label="Pre-flight checks"
        className="flex flex-col gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2.5 text-xs"
      >
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-px w-4 shrink-0 text-center font-semibold"
              style={{ color: c.ok ? "#607a3a" : "#b8762a" }}
            >
              {c.ok ? "✓" : "⚠"}
            </span>
            <span className="min-w-0">
              <span className={c.ok ? "text-[var(--fg-muted)]" : "font-medium text-[var(--fg)]"}>
                {c.label}
              </span>
              {c.detail ? (
                <span className="block text-[11px] text-[var(--fg-subtle)]">{c.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {warnings.length > 0 ? (
        <p className="text-[11px] text-[var(--fg-subtle)]">
          You can finalize with open items — the button will ask you to
          confirm first.
        </p>
      ) : null}
    </div>
  );
}
