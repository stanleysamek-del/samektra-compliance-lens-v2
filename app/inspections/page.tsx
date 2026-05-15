import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { InspectionRowMenu } from "@/components/inspection-row-menu";
import { TeamTipBanner } from "@/components/team-tip-banner";

/**
 * Runs a Supabase query with a hard timeout. If Supabase is slow we return
 * `null` instead of hanging the whole page render until Vercel's gateway
 * times out. The page will show a "Couldn't load X" placeholder for that
 * section rather than failing the entire dashboard.
 */
async function withQueryTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = 4000,
  label = "query",
): Promise<T | null> {
  try {
    return (await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label}-timeout`)),
          timeoutMs,
        ),
      ),
    ])) as T;
  } catch (err) {
    console.warn(
      `[dashboard] ${label} failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export default async function InspectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Profile lookup is gating — we need it to render the header. Keep the
  // timeout but treat null as "couldn't load" rather than redirect to
  // onboarding (which would loop on a Supabase outage).
  const profileResult = await withQueryTimeout(
    supabase
      .from("profiles")
      .select("full_name, organization")
      .eq("user_id", user.id)
      .maybeSingle(),
    4000,
    "profiles",
  );
  const profile = profileResult?.data ?? null;
  if (profileResult !== null && !profile) {
    // Confirmed missing profile (not a timeout) — send them to onboarding.
    redirect("/onboarding");
  }

  // Fire the rest of the queries in parallel and let any of them fail open.
  const [inProgressResult, recentResult, weeklyScansResult, weeklyHighFindingsResult] =
    await Promise.all([
      withQueryTimeout(
        supabase
          .from("inspections")
          .select("id, facility_name, location, date_of_inspection, updated_at")
          .eq("status", "in_progress")
          .order("updated_at", { ascending: false })
          .limit(5),
        4000,
        "in_progress",
      ),
      withQueryTimeout(
        supabase
          .from("inspections")
          .select("id, facility_name, location, status, date_of_inspection, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        4000,
        "recent",
      ),
      withQueryTimeout(
        (async () => {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          return supabase
            .from("photos")
            .select("id", { count: "exact", head: true })
            .gte("created_at", sevenDaysAgo);
        })(),
        4000,
        "weekly_scans",
      ),
      withQueryTimeout(
        (async () => {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          return supabase
            .from("findings")
            .select("id", { count: "exact", head: true })
            .eq("severity", "High")
            .gte("created_at", sevenDaysAgo);
        })(),
        4000,
        "weekly_high_findings",
      ),
    ]);

  const inProgress = inProgressResult?.data ?? null;
  const recent = recentResult?.data ?? null;
  const weeklyScans = weeklyScansResult?.count ?? null;
  const weeklyHighFindings = weeklyHighFindingsResult?.count ?? null;
  // True when at least one section couldn't load — surfaces a banner.
  const anySectionDegraded =
    inProgressResult === null ||
    recentResult === null ||
    weeklyScansResult === null ||
    weeklyHighFindingsResult === null;

  // Fallback profile so we can still render something if the profile query
  // itself timed out. The user can refresh.
  const displayProfile = profile ?? {
    full_name: user.email ?? "Inspector",
    organization: null as string | null,
  };

  const insight = pickDailyInsight();

  return (
    <AppShell
      user={{
        fullName: displayProfile.full_name,
        organization: displayProfile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-6">
        {anySectionDegraded ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
            style={{
              borderColor: "rgba(245,158,11,0.3)",
              background: "rgba(245,158,11,0.08)",
              color: "#fde68a",
            }}
          >
            <span aria-hidden>⚠</span>
            <span>
              Some sections couldn&apos;t load — we&apos;re showing what we
              have. Refresh to retry.
            </span>
          </div>
        ) : null}

        {/* ============== Header ============== */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
              Home
            </p>
            <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-[var(--fg)] sm:text-3xl">
              {`Welcome back, ${displayProfile.full_name.split(" ")[0] || displayProfile.full_name}.`}
            </h1>
            {displayProfile.organization ? (
              <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                {displayProfile.organization}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/inspections/history" className="cl-btn-outline">
              History
            </Link>
            <Link href="/inspections/new" className="cl-btn-accent">
              + New inspection
            </Link>
          </div>
        </header>

        {/* One-time, dismissible nudge — only shows for users not in a
            team yet. Renders nothing once dismissed (localStorage). */}
        <TeamTipBanner />

        {/* ============== Summary tiles ============== */}
        <Card padded={false}>
          <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
            <HomeStat
              label="Weekly scans"
              value={String(weeklyScans ?? 0)}
              sub="last 7 days"
            />
            <HomeStat
              label="High-severity"
              value={String(weeklyHighFindings ?? 0)}
              sub={
                (weeklyHighFindings ?? 0) === 0 ? (
                  <span style={{ color: "#86efac" }}>None this week</span>
                ) : (
                  "open issues"
                )
              }
              tone="warning"
            />
            <HomeStat
              label="Compliance"
              value={
                (weeklyScans ?? 0) === 0
                  ? "—"
                  : `${Math.max(0, 100 - Math.min(100, (weeklyHighFindings ?? 0) * 5))}%`
              }
              sub="this week"
              tone="primary"
            />
          </div>
        </Card>

        {/* ============== In progress (horizontal scroll) ============== */}
        {inProgress && inProgress.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                In progress
                <span className="ml-1.5 font-medium text-[var(--fg-subtle)]">
                  · {inProgress.length}
                </span>
              </h2>
              <Link
                href="/inspections/history?status=in_progress"
                className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
              >
                See all
              </Link>
            </div>
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
              {inProgress.map((row) => (
                <Link
                  key={row.id}
                  href={`/inspections/${row.id}`}
                  className="block w-64 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3 transition hover:border-[var(--primary)]"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
                    Inspection
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-[var(--fg)]">
                    {row.facility_name}
                  </p>
                  {row.location ? (
                    <p className="mt-0.5 truncate text-[11px] text-[var(--fg-muted)]">
                      {row.location}
                    </p>
                  ) : null}
                  <p className="mt-3 text-[11px] text-[var(--fg-subtle)]">
                    {row.date_of_inspection ?? "No date"}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* ============== Recent activity (ledger) ============== */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Recent activity
            </h2>
            <Link
              href="/inspections/history"
              className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
            >
              See all
            </Link>
          </div>
          {recent && recent.length > 0 ? (
            <Card padded={false}>
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((row) => (
                  <li key={row.id}>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <Link
                        href={`/inspections/${row.id}`}
                        className="flex min-w-0 flex-1 flex-col gap-0.5 transition hover:opacity-90"
                      >
                        <p className="truncate text-sm font-medium text-[var(--fg)]">
                          {row.facility_name}
                        </p>
                        <p className="truncate text-[11px] text-[var(--fg-subtle)]">
                          {row.location ?? "—"}
                        </p>
                      </Link>
                      <StatusPill status={row.status} />
                      <InspectionRowMenu
                        inspectionId={row.id}
                        facilityName={row.facility_name}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            /* Rich empty state — first-time users see this. Explains the
               loop and offers the primary action right here, not buried
               in the header. */
            <Card variant="tinted-teal" padded={false}>
              <div className="flex flex-col gap-5 px-6 py-8 sm:px-8 sm:py-10">
                <div className="flex flex-col items-center gap-2 text-center">
                  <h3 className="text-lg font-semibold tracking-tight text-[var(--fg)]">
                    Ready for your first inspection?
                  </h3>
                  <p className="max-w-md text-sm text-[var(--fg-muted)]">
                    The loop is fast: snap photos of equipment, Chip flags
                    violations with code citations, you confirm or correct,
                    then export the signed report.
                  </p>
                </div>
                <ol className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
                  <EmptyStep n={1} title="Create" body="Set up a facility and a date — under a minute." />
                  <EmptyStep n={2} title="Snap & coach" body="Add photos. Chip writes findings. You correct anything wrong." />
                  <EmptyStep n={3} title="Export" body="PDF, CAP, LSRA, ILSM — all generated for you." />
                </ol>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Link href="/inspections/new" className="cl-btn-accent">
                    + Start your first inspection
                  </Link>
                  <Link href="/welcome" className="cl-btn-outline">
                    Open the guide
                  </Link>
                </div>
              </div>
            </Card>
          )}
        </section>

        {/* ============== Daily code insight (smaller, less prominent) ============== */}
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
              💡 Daily code insight
            </div>
            <span className="text-[10px] text-[var(--fg-subtle)]">
              {insight.day} / {insight.totalDays}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold tracking-tight text-[var(--fg)]">
            {insight.title}
            <span className="ml-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
              ({insight.year}) {insight.subtitle}
            </span>
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-[var(--fg-muted)]">
            {insight.body}
          </p>
        </Card>
      </div>
    </AppShell>
  );
}

function EmptyStep({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{
            background: "rgba(20,184,166,0.18)",
            color: "#5eead4",
          }}
        >
          {n}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--fg)]">{title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--fg-muted)]">
            {body}
          </p>
        </div>
      </div>
    </li>
  );
}

function HomeStat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  tone?: "default" | "primary" | "warning";
}) {
  const accent =
    tone === "primary"
      ? "var(--primary)"
      : tone === "warning"
        ? "var(--warning)"
        : "var(--fg)";
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        {label}
      </span>
      <span
        className="text-2xl font-semibold leading-none tracking-tight"
        style={{ color: accent }}
      >
        {value}
      </span>
      <div className="text-[11px] text-[var(--fg-muted)]">{sub}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    in_progress: { label: "In progress", bg: "rgba(245,158,11,0.12)", fg: "#fbbf24" },
    completed: { label: "Completed", bg: "rgba(34,197,94,0.12)", fg: "#86efac" },
    archived: { label: "Archived", bg: "rgba(148,163,184,0.12)", fg: "#cbd5e1" },
  };
  const m = map[status] ?? map.archived;
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

type Insight = {
  day: number;
  totalDays: number;
  title: string;
  subtitle: string;
  year: number;
  body: string;
};

function pickDailyInsight(): Insight {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const idx = dayOfYear % CODE_INSIGHTS.length;
  return { ...CODE_INSIGHTS[idx], day: idx + 1, totalDays: CODE_INSIGHTS.length };
}

const CODE_INSIGHTS: Omit<Insight, "day" | "totalDays">[] = [
  {
    title: "NFPA 25 — Water-Based Fire Protection Systems",
    subtitle: "Reference Valves & Supervision",
    year: 2023,
    body: "Keep control valves accessible, identified, and supervised where required. A closed valve is one of the fastest ways to turn a compliant sprinkler system into a life-safety risk.",
  },
  {
    title: "NFPA 10 — Portable Fire Extinguishers",
    subtitle: "Mounting & Accessibility",
    year: 2022,
    body: "Extinguishers must be conspicuous, unobstructed, and mounted so the top is no more than 60 in. above the floor. ADA reach often pulls the handle to ≤ 48 in. — measure to the handle.",
  },
  {
    title: "NFPA 13 — Sprinkler Storage Clearance",
    subtitle: "18-inch Rule",
    year: 2022,
    body: "Storage must remain at least 18 in. below the sprinkler deflector. Anything closer disrupts the spray pattern and can render the head ineffective at the moment it matters.",
  },
  {
    title: "NFPA 80 — Fire Doors",
    subtitle: "Self-Closing & Positive Latching",
    year: 2022,
    body: "A propped fire door is no longer a fire door. Wedges, kick-downs, and unapproved hold-open devices defeat the rated assembly. Door must close and latch under its own power.",
  },
  {
    title: "NFPA 101 — Penetrations in Rated Barriers",
    subtitle: "Through-Penetration Firestopping",
    year: 2024,
    body: "Every cable, conduit, or pipe crossing a fire- or smoke-rated wall needs a tested, listed firestop assembly. Unsealed penetrations are a top finding nearly every survey.",
  },
  {
    title: "NEC 110.26 — Working Space at Electrical Equipment",
    subtitle: "36-inch Clear Depth",
    year: 2023,
    body: "Maintain at least 36 in. of clear working space in front of panels and disconnects rated 600 V or less. Storage in front of an electrical panel is a high-severity finding nearly every time.",
  },
];
