import Link from "next/link";
import { Card } from "@/components/card";
import { SeverityBadge } from "@/components/severity-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NotVisibleChecklist, type NotVisibleItem } from "@/components/not-visible-checklist";
import { SignaturePad } from "@/components/signature-pad";
import { FinalizePreflight } from "@/components/finalize-preflight";
import { SubmitButton } from "@/components/submit-button";
import { HelpTip } from "@/components/help-tip";
import { finalizeInspection } from "./actions";

/**
 * Review: everything that still needs a human before the report is
 * final, each row linking to the exact place to fix it. An unanswered
 * question is a gap, not a pass. Then sign-off and Finalize (or Reopen).
 */

export type ReviewQuestion = { id: string; label: string; question: string };
export type ReviewFinding = {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
  href: string;
};

export function ReviewStep({
  inspectionId,
  isCompleted,
  readOnly,
  unanswered,
  aiToConfirm,
  ownerless,
  notVisibleItems,
  analysis,
  checklistTotal,
  signatures,
  userId,
}: {
  inspectionId: string;
  isCompleted: boolean;
  readOnly: boolean;
  unanswered: ReviewQuestion[];
  aiToConfirm: ReviewQuestion[];
  ownerless: ReviewFinding[];
  notVisibleItems: NotVisibleItem[];
  analysis: { queued: number; analyzing: number; failed: number };
  checklistTotal: number;
  signatures: {
    inspectorLabel: string;
    managerLabel: string;
    inspectorUrl: string | null;
    managerUrl: string | null;
    inspectorSignedAt: string | null;
    managerSignedAt: string | null;
  };
  userId: string;
}) {
  const openPunch = notVisibleItems.filter((n) => !n.resolved && !n.skipped).length;
  const allClear =
    unanswered.length === 0 && aiToConfirm.length === 0 && ownerless.length === 0 && openPunch === 0;

  return (
    <div className="flex flex-col gap-5">
      {allClear ? (
        <EmptyState title="Nothing left to review">
          Every question is answered, AI answers are confirmed and every
          finding has an owner. Sign below and finalize.
        </EmptyState>
      ) : null}

      <QuestionList
        inspectionId={inspectionId}
        title="Unanswered questions"
        help="An unanswered question shows as a gap on the report — it isn't counted as a pass."
        items={unanswered}
      />
      <QuestionList
        inspectionId={inspectionId}
        title="AI answers to confirm"
        help="Chip answered these from your photos. Confirm or change each one; the report marks unconfirmed answers."
        items={aiToConfirm}
      />

      {ownerless.length > 0 ? (
        <Card>
          <ListHeading count={ownerless.length}>Findings without an owner</ListHeading>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Assign each one an owner and due date so it becomes a tracked
            corrective action.
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-[var(--rule-paper)]">
            {ownerless.slice(0, 50).map((f) => (
              <li key={f.id}>
                <Link
                  href={f.href}
                  className="flex min-h-11 items-center gap-2 py-2 text-sm text-[var(--ink)] hover:underline"
                >
                  <SeverityBadge severity={f.severity} size="sm" compact />
                  <span className="min-w-0 flex-1 truncate">{f.title}</span>
                  <span aria-hidden className="text-[var(--fg-subtle)]">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {ownerless.length > 50 ? (
            <p className="mt-2 text-xs text-[var(--fg-muted)]">
              Showing 50 of {ownerless.length}. Use{" "}
              <Link href="/actions" className="underline">
                Actions
              </Link>{" "}
              for the full list.
            </p>
          ) : null}
        </Card>
      ) : null}

      {notVisibleItems.length > 0 ? (
        <div id="punch-list" className="scroll-mt-48">
          <NotVisibleChecklist inspectionId={inspectionId} items={notVisibleItems} readOnly={readOnly} />
        </div>
      ) : null}

      {!isCompleted ? (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--ink)]">Check the report before you sign</h2>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                Opens the PDF as it stands now, marked DRAFT on every page.
              </p>
            </div>
            <a
              href={`/api/inspections/${inspectionId}/export/pdf?inline=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="cl-btn-outline shrink-0"
            >
              Preview draft PDF ↗
            </a>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-base font-semibold text-[var(--ink)]">Sign-off</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 border-b border-[var(--border)] pb-4 sm:grid-cols-2">
          <SignaturePad
            inspectionId={inspectionId}
            role="inspector"
            label={signatures.inspectorLabel}
            signedUrl={signatures.inspectorUrl}
            signedAt={signatures.inspectorSignedAt}
            userId={userId}
          />
          <SignaturePad
            inspectionId={inspectionId}
            role="manager"
            label={signatures.managerLabel}
            signedUrl={signatures.managerUrl}
            signedAt={signatures.managerSignedAt}
            userId={userId}
          />
        </div>
        <div className="mt-4">
          {isCompleted ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-1.5 font-medium text-[var(--fg)]">
                  Inspection finalized
                  <HelpTip title="Finalized">
                    The inspection is locked — no new photos, no edits — and
                    the report is downloadable. Nothing is deleted; reopen any
                    time to unlock editing.
                  </HelpTip>
                </p>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  Get the report on the Report step, or reopen to make changes.
                </p>
              </div>
              {!readOnly ? (
                <form action={finalizeInspection}>
                  <input type="hidden" name="inspection_id" value={inspectionId} />
                  <input type="hidden" name="status" value="in_progress" />
                  <SubmitButton className="cl-btn-outline" pendingLabel="Reopening…">
                    Reopen
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          ) : !readOnly ? (
            <FinalizePreflight
              analysis={analysis}
              inspectionId={inspectionId}
              checklist={{
                total: checklistTotal,
                unanswered: unanswered.length,
                unconfirmedAi: aiToConfirm.length,
              }}
              openPunchList={openPunch}
              inspectorSigned={Boolean(signatures.inspectorSignedAt)}
              managerSigned={Boolean(signatures.managerSignedAt)}
            />
          ) : (
            <p className="text-sm text-[var(--fg-muted)]">
              You have view-only access to this inspection.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function QuestionList({
  inspectionId,
  title,
  help,
  items,
}: {
  inspectionId: string;
  title: string;
  help: string;
  items: ReviewQuestion[];
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <ListHeading count={items.length}>{title}</ListHeading>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">{help}</p>
      <ul className="mt-3 flex flex-col divide-y divide-[var(--rule-paper)]">
        {items.slice(0, 50).map((q) => (
          <li key={q.id}>
            <Link
              href={`/inspections/${inspectionId}?step=audit#q-${q.id}`}
              className="flex min-h-11 items-center gap-2 py-2 text-sm text-[var(--ink)] hover:underline"
            >
              <span className="w-12 shrink-0 text-xs tabular-nums text-[var(--fg-subtle)]">{q.label}</span>
              <span className="min-w-0 flex-1">{q.question}</span>
              <span aria-hidden className="text-[var(--fg-subtle)]">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 50 ? (
        <p className="mt-2 text-xs text-[var(--fg-muted)]">
          Showing 50 of {items.length} — the Audit step&apos;s &ldquo;Next unanswered&rdquo;
          button walks through the rest.
        </p>
      ) : null}
    </Card>
  );
}

function ListHeading({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
      {children}
      <span className="rounded-full bg-[#fdf3dc] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#8a5300]">
        {count}
      </span>
    </h2>
  );
}
