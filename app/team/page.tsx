import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { TeamNav } from "@/components/team-nav";
import { getCurrentOrg, listMyOrganizations } from "@/lib/org/current";
import { createOrganization, switchCurrentOrg } from "./actions";

type Severity = "High" | "Medium" | "Low";

export default async function TeamDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const userShell = {
    fullName: profile.full_name,
    organization: profile.organization,
    email: user.email ?? null,
  };

  const { error } = await searchParams;
  const currentOrg = await getCurrentOrg();
  const allOrgs = await listMyOrganizations();

  /* =================================================================
   * Branch 1 — Not in any team yet (show create form)
   * ================================================================= */
  if (allOrgs.length === 0) {
    return (
      <AppShell user={userShell}>
        <div className="flex flex-col gap-5">
          <div className="px-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Team
            </h1>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
              Create a team to share inspections with coworkers.
            </p>
          </div>
          <Card>
            <h2 className="text-base font-semibold text-[var(--fg)]">
              Create your team
            </h2>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              You&apos;ll be the first admin. Add other inspectors after.
            </p>
            <form action={createOrganization} className="mt-4 flex flex-col gap-3">
              <label className="cl-label" htmlFor="name">Team name</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Acme Inspection Services"
                className="cl-input"
              />
              {error ? (
                <p className="text-xs" style={{ color: "#fca5a5" }}>{error}</p>
              ) : null}
              <button type="submit" className="cl-btn-primary self-start">
                Create team
              </button>
            </form>
          </Card>
          <Card variant="tinted-teal">
            <p className="text-xs text-[var(--fg-muted)]">
              <span className="font-medium text-[var(--fg)]">Already invited?</span>{" "}
              Open the invite link from your email — you&apos;ll be added automatically.
            </p>
          </Card>
        </div>
      </AppShell>
    );
  }

  /* =================================================================
   * Branch 2 — In one or more teams but no current org set
   * ================================================================= */
  if (!currentOrg && allOrgs.length > 0) {
    return (
      <AppShell user={userShell}>
        <div className="flex flex-col gap-5">
          <div className="px-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Choose a team
            </h1>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
              You&apos;re a member of {allOrgs.length}{" "}
              {allOrgs.length === 1 ? "team" : "teams"}.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {allOrgs.map((o) => (
              <li key={o.id}>
                <form action={switchCurrentOrg}>
                  <input type="hidden" name="organization_id" value={o.id} />
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-left transition hover:border-[var(--primary)]"
                  >
                    <span className="font-medium text-[var(--fg)]">{o.name}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--fg-subtle)]">
                      {o.role}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </AppShell>
    );
  }

  /* =================================================================
   * Branch 3 — Team dashboard (the real new content)
   * ================================================================= */
  const org = currentOrg!;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // --- Members for activity attribution
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, role, profiles:user_id (full_name)")
    .eq("organization_id", org.id);
  const memberNameById = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.profiles as unknown as { full_name: string } | null;
    memberNameById.set(m.user_id, p?.full_name ?? "—");
  }
  const memberCount = (members ?? []).length;

  // --- Inspections (org-scoped). All counts derive from this single fetch.
  const { data: inspections } = await supabase
    .from("inspections")
    .select(
      "id, facility_name, location, status, folder_id, created_by, created_at, updated_at",
    )
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(500);

  const insps = inspections ?? [];
  const totalInspections = insps.length;
  const inspectionsThisMonth = insps.filter(
    (i) => i.created_at >= thirtyDaysAgo,
  ).length;
  const inProgressCount = insps.filter((i) => i.status === "in_progress").length;
  const completedCount = insps.filter((i) => i.status === "completed").length;
  const completionPct =
    totalInspections === 0
      ? null
      : Math.round((completedCount / totalInspections) * 100);

  // --- Findings rollup. RLS lets us pull all findings under the org.
  const inspectionIds = insps.map((i) => i.id);
  let findingsTotal = 0;
  let findingsHigh = 0;
  let findingsMedium = 0;
  let findingsLow = 0;
  type RecentFinding = {
    id: string;
    title: string;
    severity: Severity;
    created_at: string;
    created_by: string;
    inspection_id: string;
    photo_id: string | null;
  };
  let recentFindings: RecentFinding[] = [];

  if (inspectionIds.length > 0) {
    const { data: findings } = await supabase
      .from("findings")
      .select(
        "id, title, severity, created_at, created_by, inspection_id, photo_id",
      )
      .in("inspection_id", inspectionIds)
      .order("created_at", { ascending: false })
      .limit(500);
    for (const f of findings ?? []) {
      findingsTotal += 1;
      if (f.severity === "High") findingsHigh += 1;
      else if (f.severity === "Medium") findingsMedium += 1;
      else if (f.severity === "Low") findingsLow += 1;
    }
    recentFindings = (findings ?? []).slice(0, 10) as RecentFinding[];
  }

  // --- Open punch-list items across the org's inspections.
  let openPunchListCount = 0;
  if (inspectionIds.length > 0) {
    const { count } = await supabase
      .from("not_visible")
      .select("id", { count: "exact", head: true })
      .in("inspection_id", inspectionIds)
      .eq("resolved", false)
      .eq("skipped", false);
    openPunchListCount = count ?? 0;
  }

  // --- Photo count (just the number — for one tile).
  let photoCount = 0;
  if (inspectionIds.length > 0) {
    const { count } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .in("inspection_id", inspectionIds);
    photoCount = count ?? 0;
  }

  // --- Top facilities by inspection count.
  const facilityCounts = new Map<string, number>();
  for (const i of insps) {
    facilityCounts.set(
      i.facility_name,
      (facilityCounts.get(i.facility_name) ?? 0) + 1,
    );
  }
  const topFacilities = Array.from(facilityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // --- Member contribution counts (inspections created).
  const contribCounts = new Map<string, number>();
  for (const i of insps) {
    if (i.created_by) {
      contribCounts.set(
        i.created_by,
        (contribCounts.get(i.created_by) ?? 0) + 1,
      );
    }
  }
  const topContributors = Array.from(contribCounts.entries())
    .map(([uid, cnt]) => ({
      userId: uid,
      name: memberNameById.get(uid) ?? "—",
      count: cnt,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <AppShell user={userShell}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
              Team
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--fg)]">
              {org.name}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
              {memberCount} {memberCount === 1 ? "member" : "members"} ·{" "}
              you are an{" "}
              <span className="font-medium text-[var(--fg)]">{org.role}</span>
            </p>
          </div>

          {allOrgs.length > 1 ? (
            <form action={switchCurrentOrg}>
              <select
                name="organization_id"
                defaultValue={org.id}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="cl-input py-1 text-xs"
              >
                {allOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                <option value="personal">Personal workspace</option>
              </select>
              <noscript>
                <button type="submit" className="cl-btn-outline">
                  Switch
                </button>
              </noscript>
            </form>
          ) : null}
        </div>

        <TeamNav />

        {/* Stat tiles */}
        <Card padded={false}>
          <div className="grid grid-cols-2 divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <StatTile
              label="Inspections"
              value={String(totalInspections)}
              sub={
                inspectionsThisMonth > 0
                  ? `${inspectionsThisMonth} this month`
                  : "None yet this month"
              }
            />
            <StatTile
              label="Findings"
              value={String(findingsTotal)}
              sub={
                findingsTotal === 0 ? (
                  <span className="text-[var(--fg-subtle)]">None yet</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {findingsHigh > 0 ? (
                      <SevPill tone="high">{findingsHigh}H</SevPill>
                    ) : null}
                    {findingsMedium > 0 ? (
                      <SevPill tone="medium">{findingsMedium}M</SevPill>
                    ) : null}
                    {findingsLow > 0 ? (
                      <SevPill tone="low">{findingsLow}L</SevPill>
                    ) : null}
                  </span>
                )
              }
            />
            <StatTile
              label="Open punch-list"
              value={String(openPunchListCount)}
              sub={
                openPunchListCount === 0 ? (
                  <span style={{ color: "#86efac" }}>All clear ✓</span>
                ) : (
                  "items need re-photograph"
                )
              }
            />
            <StatTile
              label="Completion"
              value={completionPct === null ? "—" : `${completionPct}%`}
              sub={`${completedCount} of ${totalInspections} done`}
            />
          </div>
        </Card>

        {/* Quick links */}
        <div className="flex flex-wrap gap-2">
          <Link href="/inspections/new" className="cl-btn-accent">
            New inspection
          </Link>
          <Link href="/inspections/history" className="cl-btn-outline">
            All inspections
          </Link>
          <Link href="/findings" className="cl-btn-outline">
            Findings dashboard
          </Link>
          <Link href="/team/members" className="cl-btn-outline">
            Manage members
          </Link>
        </div>

        {/* Top facilities + top contributors side by side on desktop */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Top facilities
            </h2>
            {topFacilities.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--fg-subtle)]">
                No inspections yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {topFacilities.map(([name, count]) => (
                  <li
                    key={name}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate font-medium text-[var(--fg)]">
                      {name}
                    </span>
                    <span className="shrink-0 font-mono text-[var(--fg-muted)]">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Top contributors
            </h2>
            {topContributors.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--fg-subtle)]">
                No activity yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {topContributors.map((c) => (
                  <li
                    key={c.userId}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate font-medium text-[var(--fg)]">
                      {c.name}
                      {c.userId === user.id ? (
                        <span className="ml-1 text-[10px] font-normal text-[var(--fg-subtle)]">
                          (you)
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-[var(--fg-muted)]">
                      {c.count} insp.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Recent activity — interleaves recent inspections + recent findings */}
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Recent activity
          </h2>
          {insps.length === 0 && recentFindings.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-[var(--fg-muted)]">
                No activity in this team yet. Start an inspection to populate
                the feed.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {/* We interleave the 5 most-recent inspections + 10 findings,
                  then sort by timestamp desc and cap at 15 items. */}
              {(() => {
                const items: Array<{
                  kind: "inspection" | "finding";
                  at: string;
                  href: string;
                  primary: string;
                  secondary: string;
                  actor: string;
                  severity?: Severity;
                }> = [];
                for (const i of insps.slice(0, 8)) {
                  items.push({
                    kind: "inspection",
                    at: i.created_at,
                    href: `/inspections/${i.id}`,
                    primary: i.facility_name,
                    secondary: i.location || "New inspection started",
                    actor: memberNameById.get(i.created_by) ?? "—",
                  });
                }
                for (const f of recentFindings) {
                  items.push({
                    kind: "finding",
                    at: f.created_at,
                    href: f.photo_id
                      ? `/inspections/${f.inspection_id}/photos/${f.photo_id}#finding-${f.id}`
                      : `/inspections/${f.inspection_id}`,
                    primary: f.title,
                    secondary: "Finding",
                    actor: memberNameById.get(f.created_by) ?? "—",
                    severity: f.severity,
                  });
                }
                items.sort((a, b) => (a.at < b.at ? 1 : -1));
                return items.slice(0, 15).map((it, idx) => (
                  <li key={`${it.kind}-${idx}`}>
                    <Link
                      href={it.href}
                      className="block rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 transition hover:border-[var(--primary)]"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className="rounded-full px-2 py-0.5 font-medium"
                          style={
                            it.kind === "inspection"
                              ? { background: "rgba(20,184,166,0.12)", color: "#5eead4" }
                              : { background: "rgba(168,85,247,0.12)", color: "#d8b4fe" }
                          }
                        >
                          {it.kind === "inspection" ? "Inspection" : "Finding"}
                        </span>
                        {it.severity ? <SevPill tone={severityTone(it.severity)}>{it.severity}</SevPill> : null}
                        <span className="text-[var(--fg-subtle)]">
                          by {it.actor}
                        </span>
                        <span className="ml-auto text-[var(--fg-subtle)]">
                          {fmtRelative(it.at)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-[var(--fg)]">
                        {it.primary}
                      </p>
                      <p className="truncate text-[11px] text-[var(--fg-muted)]">
                        {it.secondary}
                      </p>
                    </Link>
                  </li>
                ));
              })()}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatTile({
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
  tone: "high" | "medium" | "low";
}) {
  const styles = {
    high: { bg: "rgba(239,68,68,0.12)", fg: "#fca5a5" },
    medium: { bg: "rgba(245,158,11,0.12)", fg: "#fbbf24" },
    low: { bg: "rgba(148,163,184,0.12)", fg: "#cbd5e1" },
  }[tone];
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: styles.bg, color: styles.fg }}
    >
      {children}
    </span>
  );
}

function severityTone(s: Severity): "high" | "medium" | "low" {
  return s === "High" ? "high" : s === "Medium" ? "medium" : "low";
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
