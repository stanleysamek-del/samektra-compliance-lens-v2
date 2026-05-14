import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { InspectionRowMenu } from "@/components/inspection-row-menu";

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
      <div className="flex flex-col gap-5">
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

        {/* Hero card */}
        <Card variant="tinted-orange">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(249,115,22,0.14)", border: "1px solid rgba(249,115,22,0.28)" }}
            >
              <span className="text-lg font-bold text-[var(--accent)]">ST</span>
            </div>
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--fg-muted)]">
                <span className="cl-status-dot online" />
                Online · Your Compliance Ally
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--fg)] sm:text-2xl">
                Welcome back, {displayProfile.full_name.split(" ")[0] || displayProfile.full_name}.
              </h1>
              {displayProfile.organization ? (
                <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{displayProfile.organization}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Link href="/inspections/new" className="cl-btn-accent w-full sm:w-auto sm:flex-1">
              + New Inspection
            </Link>
            <Link href="/inspections/history" className="cl-btn-outline w-full sm:w-auto sm:flex-1">
              History
            </Link>
          </div>
        </Card>

        {/* Resume in-progress */}
        {inProgress && inProgress.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                In progress · {inProgress.length}
              </h2>
              <Link
                href="/inspections/history?status=in_progress"
                className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
              >
                See all
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {inProgress.map((row) => (
                <li key={row.id}>
                  <Card padded={false}>
                    <div className="flex items-center gap-3 px-5 py-4">
                      <Link
                        href={`/inspections/${row.id}`}
                        className="flex min-w-0 flex-1 flex-col gap-1"
                      >
                        <p className="truncate font-medium text-[var(--fg)]">
                          {row.facility_name}
                        </p>
                        <p className="truncate text-xs text-[var(--fg-muted)]">
                          {row.location ?? "—"} ·{" "}
                          {row.date_of_inspection ?? "no date"}
                        </p>
                      </Link>
                      <Link
                        href={`/inspections/${row.id}`}
                        className="hidden shrink-0 text-xs font-medium text-[var(--accent)] sm:inline"
                      >
                        Continue →
                      </Link>
                      <InspectionRowMenu
                        inspectionId={row.id}
                        facilityName={row.facility_name}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Stats grid */}
        <section className="grid grid-cols-3 gap-3">
          <StatCard label="Weekly Scans" value={String(weeklyScans ?? 0)} />
          <StatCard
            label="Risks Found"
            value={String(weeklyHighFindings ?? 0)}
            tone="warning"
          />
          <StatCard
            label="Compliance"
            value={(weeklyScans ?? 0) === 0 ? "—" : `${Math.max(0, 100 - Math.min(100, (weeklyHighFindings ?? 0) * 5))}%`}
            tone="primary"
          />
        </section>

        {/* Daily Code Insight */}
        <Card variant="tinted-orange">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
              💡 Daily Code Insight
            </div>
            <span className="text-[11px] text-[var(--fg-subtle)]">
              {insight.day} of {insight.totalDays}
            </span>
          </div>
          <h3 className="mt-3 text-base font-semibold tracking-tight text-[var(--fg)]">
            {insight.title}
          </h3>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
            ({insight.year}) {insight.subtitle}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">
            {insight.body}
          </p>
        </Card>

        {/* Recent activity */}
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
            <ul className="flex flex-col gap-2">
              {recent.map((row) => (
                <li key={row.id}>
                  <Card padded={false}>
                    <div className="flex items-center gap-3 px-5 py-4">
                      <Link
                        href={`/inspections/${row.id}`}
                        className="flex min-w-0 flex-1 flex-col gap-1"
                      >
                        <p className="truncate text-sm font-medium text-[var(--fg)]">
                          {row.facility_name}
                        </p>
                        <p className="truncate text-xs text-[var(--fg-muted)]">
                          {row.location ?? "—"}
                        </p>
                      </Link>
                      <StatusPill status={row.status} />
                      <InspectionRowMenu
                        inspectionId={row.id}
                        facilityName={row.facility_name}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card padded={false}>
              <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                <p className="text-sm font-medium text-[var(--fg-muted)]">
                  No inspections yet
                </p>
                <p className="text-xs text-[var(--fg-subtle)]">
                  Start your first inspection from the button above.
                </p>
              </div>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "warning";
}) {
  const accent =
    tone === "primary" ? "var(--primary)" : tone === "warning" ? "var(--warning)" : "var(--fg)";
  return (
    <div className="cl-card flex flex-col gap-1 p-4">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight" style={{ color: accent }}>
        {value}
      </span>
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
