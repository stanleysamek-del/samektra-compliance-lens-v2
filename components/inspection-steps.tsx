import Link from "next/link";

/**
 * Sticky inspection header + step tabs, SafetyCulture-style:
 *
 *   ← History   St. Anselm · 5th floor SC 1                In progress
 *   ███████████░░░░░░  28 / 40 answered · Score 84%
 *   Info · Audit 28/40 · Photos & Plans 12 · Review 3 · Report
 *
 * Steps are plain links (?step=…) so refresh, back/forward and sharing a
 * URL all keep the inspector's place. Sticks just under the app header.
 */

export const INSPECTION_STEPS = ["info", "audit", "photos", "review", "report"] as const;
export type InspectionStep = (typeof INSPECTION_STEPS)[number];

export function isInspectionStep(v: string | undefined): v is InspectionStep {
  return (INSPECTION_STEPS as readonly string[]).includes(v ?? "");
}

const LABELS: Record<InspectionStep, string> = {
  info: "Info",
  audit: "Audit",
  photos: "Photos & Plans",
  review: "Review",
  report: "Report",
};

export function InspectionSteps({
  inspectionId,
  current,
  title,
  subtitle,
  status,
  answered,
  totalQuestions,
  scorePct,
  photoCount,
  reviewIssues,
}: {
  inspectionId: string;
  current: InspectionStep;
  title: string;
  subtitle: string | null;
  status: string;
  answered: number;
  totalQuestions: number;
  scorePct: number | null;
  photoCount: number;
  /** Open items the Review step lists (unanswered, AI to confirm, …). */
  reviewIssues: number;
}) {
  const progress = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : null;
  const badge: Partial<Record<InspectionStep, string>> = {
    audit: totalQuestions > 0 ? `${answered}/${totalQuestions}` : undefined,
    photos: photoCount > 0 ? String(photoCount) : undefined,
    review: reviewIssues > 0 ? String(reviewIssues) : undefined,
  };

  return (
    <div className="sticky top-14 z-20 -mx-4 border-b border-[var(--ink)] bg-[var(--paper)]/95 px-4 pt-2 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/inspections/history"
            className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          >
            ← History
          </Link>
          {/* Sans at this size — the serif only reads well at 24px+. */}
          <h1
            className="truncate text-lg font-semibold leading-tight text-[var(--ink)] sm:text-xl"
            style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
          >
            {title}
            {subtitle ? (
              <span className="font-normal text-[var(--fg-muted)]"> · {subtitle}</span>
            ) : null}
          </h1>
        </div>
        <StatusPill status={status} />
      </div>

      {progress !== null ? (
        <div className="mt-2 flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--paper-3)]"
            role="progressbar"
            aria-label="Questions answered"
            aria-valuemin={0}
            aria-valuemax={totalQuestions}
            aria-valuenow={answered}
          >
            <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${progress}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-[var(--fg-muted)]">
            {answered}/{totalQuestions} answered
            {scorePct !== null ? (
              <>
                {" · "}
                <span className="font-semibold text-[var(--ink)]">Score {scorePct}%</span>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <nav aria-label="Inspection steps" className="-mx-1 mt-1 flex overflow-x-auto">
        {INSPECTION_STEPS.map((step, i) => {
          const active = step === current;
          return (
            <Link
              key={step}
              href={`/inspections/${inspectionId}?step=${step}`}
              aria-current={active ? "step" : undefined}
              scroll={false}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 text-sm transition ${
                active
                  ? "border-[var(--ink)] font-semibold text-[var(--ink)]"
                  : "border-transparent text-[var(--fg-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <span aria-hidden className="text-xs tabular-nums text-[var(--fg-subtle)]">
                {i + 1}
              </span>
              {LABELS[step]}
              {badge[step] ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                    step === "review"
                      ? "bg-[#fdf3dc] font-semibold text-[#8a5300]"
                      : "bg-[var(--paper-3)] text-[var(--fg-muted)]"
                  }`}
                >
                  {badge[step]}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Previous / next step links at the bottom of each step. */
export function StepFooter({
  inspectionId,
  current,
}: {
  inspectionId: string;
  current: InspectionStep;
}) {
  const i = INSPECTION_STEPS.indexOf(current);
  const prev = i > 0 ? INSPECTION_STEPS[i - 1] : null;
  const next = i < INSPECTION_STEPS.length - 1 ? INSPECTION_STEPS[i + 1] : null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--rule-paper)] pt-4">
      {prev ? (
        <Link href={`/inspections/${inspectionId}?step=${prev}`} className="cl-btn-outline">
          ← {LABELS[prev]}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={`/inspections/${inspectionId}?step=${next}`} className="cl-btn-primary">
          {LABELS[next]} →
        </Link>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    in_progress: { label: "In progress", bg: "#fdf3dc", fg: "#8a5300" },
    completed: { label: "Finalized", bg: "#e8f1e4", fg: "#2f6b2f" },
    archived: { label: "Archived", bg: "var(--paper-3)", fg: "var(--slate)" },
  };
  const m = map[status] ?? map.archived;
  return (
    <span
      className="mt-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
