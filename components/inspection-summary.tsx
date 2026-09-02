import { Card } from "@/components/card";
import { HelpTip } from "@/components/help-tip";
import { formatDateShort, formatDateTime } from "@/lib/format-date";
import { severityColor } from "@/lib/severity";

type SeverityBreakdown = {
  high: number;
  medium: number;
  low: number;
};

type PunchListBreakdown = {
  open: number;
  resolved: number;
  skipped: number;
};

type Props = {
  photoCount: number;
  findings: { total: number } & SeverityBreakdown;
  punchList: PunchListBreakdown;
  ratings: { thumbsUp: number; thumbsDown: number };
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  finalizedAt?: string | null;
};

/**
 * Stat-grid summary card rendered on the inspection detail page right
 * below the main header card. Surfaces all the rollups Chip's findings
 * + the inspector's work would otherwise force you to scroll the page
 * for: photo count, finding severity breakdown, punch-list progress,
 * feedback ratings, and a small timeline strip.
 *
 * Pure server component — all data is already in scope on the page,
 * we just shape it here.
 */
export function InspectionSummary({
  photoCount,
  findings,
  punchList,
  ratings,
  status,
  createdAt,
  updatedAt,
  finalizedAt,
}: Props) {
  const punchTotal = punchList.open + punchList.resolved + punchList.skipped;
  const punchClosedPct =
    punchTotal === 0
      ? null
      : Math.round(((punchList.resolved + punchList.skipped) / punchTotal) * 100);

  return (
    <Card padded={false}>
      <div className="grid grid-cols-2 divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {/* Photos */}
        <Stat
          label="Photos"
          value={String(photoCount)}
          sub={
            photoCount === 0
              ? "No photos yet"
              : `${photoCount} ${photoCount === 1 ? "image" : "images"} analyzed`
          }
        />

        {/* Findings with severity pills */}
        <Stat
          label="Findings"
          value={String(findings.total)}
          sub={
            findings.total === 0 ? (
              <span className="text-[var(--fg-subtle)]">No findings yet</span>
            ) : (
              <span className="flex flex-wrap items-center gap-1">
                {findings.high > 0 ? (
                  <SevPill tone="High">{findings.high} High</SevPill>
                ) : null}
                {findings.medium > 0 ? (
                  <SevPill tone="Medium">{findings.medium} Med</SevPill>
                ) : null}
                {findings.low > 0 ? (
                  <>
                    <SevPill tone="Low">{findings.low} Advisory</SevPill>
                    <HelpTip title="Advisory" side="bottom">
                      Low-severity notes worth fixing but unlikely to be cited
                      on a survey. Hidden by default so the real deficiencies
                      stand out.
                    </HelpTip>
                  </>
                ) : null}
              </span>
            )
          }
        />

        {/* Punch-list progress */}
        <Stat
          label="Punch-list"
          value={
            punchTotal === 0
              ? "—"
              : `${punchList.open}/${punchTotal}`
          }
          sub={
            punchTotal === 0 ? (
              <span className="text-[var(--fg-subtle)]">Nothing flagged</span>
            ) : punchList.open === 0 ? (
              <span style={{ color: "#607a3a" }}>All clear ✓</span>
            ) : (
              <span>
                {punchClosedPct}% done
                {punchList.skipped > 0 ? (
                  <span className="text-[var(--fg-subtle)]">
                    {" "}
                    · {punchList.skipped} skipped
                  </span>
                ) : null}
              </span>
            )
          }
        />

        {/* Feedback ratings (thumbs) */}
        <Stat
          label="Feedback"
          value={
            ratings.thumbsUp + ratings.thumbsDown === 0
              ? "—"
              : `${ratings.thumbsUp + ratings.thumbsDown}`
          }
          sub={
            ratings.thumbsUp + ratings.thumbsDown === 0 ? (
              <span className="text-[var(--fg-subtle)]">No ratings yet</span>
            ) : (
              <span className="flex gap-2">
                <span style={{ color: "#b8902f" }}>👍 {ratings.thumbsUp}</span>
                <span style={{ color: "#a8362b" }}>👎 {ratings.thumbsDown}</span>
              </span>
            )
          }
        />
      </div>

      {/* Compact timeline strip across the bottom. Right-aligned dates
          keep the line tidy on narrow viewports. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--border)] px-5 py-2.5 text-[11px] text-[var(--fg-subtle)]">
        {createdAt ? (
          <TimelineItem
            dot="created"
            label={`Created ${fmtRelative(createdAt)}`}
            full={fmtFull(createdAt)}
          />
        ) : null}
        {updatedAt && updatedAt !== createdAt ? (
          <TimelineItem
            dot="updated"
            label={`Last edit ${fmtRelative(updatedAt)}`}
            full={fmtFull(updatedAt)}
          />
        ) : null}
        {status === "completed" && finalizedAt ? (
          <TimelineItem
            dot="finalized"
            label={`Finalized ${fmtRelative(finalizedAt)}`}
            full={fmtFull(finalizedAt)}
          />
        ) : null}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        {label}
      </span>
      <span className="text-2xl font-semibold leading-none tracking-tight text-[var(--fg)]">
        {value}
      </span>
      <div className="text-[11px] text-[var(--fg-muted)]">{sub}</div>
    </div>
  );
}

function SevPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "High" | "Medium" | "Low";
}) {
  const styles = severityColor(tone);
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: styles.bg, color: styles.fg }}
    >
      {children}
    </span>
  );
}

function TimelineItem({
  dot,
  label,
  full,
}: {
  dot: "created" | "updated" | "finalized";
  label: string;
  full: string;
}) {
  const color =
    dot === "created"
      ? "var(--fg-subtle)"
      : dot === "updated"
        ? "var(--primary)"
        : "#607a3a";
  return (
    <span className="inline-flex items-center gap-1.5" title={full}>
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

/** "just now" / "12m ago" / "3h ago" / "5d ago", then the shared short date. */
function fmtRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateShort(iso);
}

function fmtFull(iso: string): string {
  return formatDateTime(iso);
}
