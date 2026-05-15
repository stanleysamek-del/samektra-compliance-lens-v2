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
                <p className="text-xs" style={{ color: "#a8362b" }}>{error}</p>
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
   * Layout borrows structural cues from Safety Culture's Home page:
   * summary tiles, horizontal-scroll card rows for In Progress + Groups,
   * sectioned content with clear headers and counts, generous whitespace.
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
    .order("updated_at", { ascending: false })
    .limit(500);

  const insps = inspections ?? [];

  // --- Folders (Groups) for the horizontal row. Joined with per-folder
  // inspection counts so we can render a meaningful card per group.
  const { data: foldersData } = await supabase
    .from("inspection_folders")
    .select("id, name, sort_order")
    .eq("organization_id", org.id)
    .order("sort_order", { ascending: true })
    .limit(20);
  const folders = foldersData ?? [];
  const folderInspectionCount = new Map<string, number>();
  for (const i of insps) {
    if (i.folder_id) {
      folderInspectionCount.set(
        i.folder_id,
        (folderInspectionCount.get(i.folder_id) ?? 0) + 1,
      );
    }
  }
  const totalInspections = insps.length;
  const inspectionsThisMonth = insps.filter(
    (i) => i.created_at >= thirtyDaysAgo,
  ).length;
  const inProgressList = insps.filter((i) => i.status === "in_progress");
  const inProgressCount = inProgressList.length;
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

  // Build the interleaved activity feed once; we cap it at 12 items.
  type ActivityItem = {
    kind: "inspection" | "finding";
    at: string;
    href: string;
    primary: string;
    secondary: string;
    actor: string;
    severity?: Severity;
  };
  const activityItems: ActivityItem[] = [];
  for (const i of insps.slice(0, 8)) {
    activityItems.push({
      kind: "inspection",
      at: i.updated_at ?? i.created_at,
      href: `/inspections/${i.id}`,
      primary: i.facility_name,
      secondary: i.location || "New inspection",
      actor: memberNameById.get(i.created_by) ?? "—",
    });
  }
  for (const f of recentFindings) {
    activityItems.push({
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
  activityItems.sort((a, b) => (a.at < b.at ? 1 : -1));
  const activityCapped = activityItems.slice(0, 12);

  return (
    <AppShell user={userShell}>
      <div className="flex flex-col gap-6">
        {/* ============== Header: org name + tabs + primary action ============== */}
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
                Team workspace
              </p>
              <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-[var(--fg)] sm:text-2xl md:text-3xl">
                {org.name}
              </h1>
              <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                {memberCount} {memberCount === 1 ? "member" : "members"} · you
                are an{" "}
                <span className="font-medium text-[var(--fg)]">{org.role}</span>
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {allOrgs.length > 1 ? (
                <form action={switchCurrentOrg}>
                  <select
                    name="organization_id"
                    defaultValue={org.id}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                    className="cl-input py-1.5 text-xs"
                  >
                    {allOrgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                    <option value="personal">Personal workspace</option>
                  </select>
                </form>
              ) : null}
              <Link href="/inspections/new" className="cl-btn-accent shrink-0">
                + New
              </Link>
            </div>
          </div>

          <TeamNav />
        </header>

        {/* ============== Summary tiles ============== */}
        <section aria-labelledby="summary-h">
          <h2
            id="summary-h"
            className="sr-only"
          >
            Summary
          </h2>
          <Card padded={false}>
            <div className="grid grid-cols-2 divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <SummaryTile
                icon={<InspectionsIcon />}
                label="Inspections"
                value={String(totalInspections)}
                sub={
                  inspectionsThisMonth > 0
                    ? `${inspectionsThisMonth} this month`
                    : "None this month"
                }
                href="/inspections/history"
              />
              <SummaryTile
                icon={<FindingsIconSm />}
                label="Findings"
                value={String(findingsTotal)}
                sub={
                  findingsTotal === 0 ? (
                    "None yet"
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {findingsHigh > 0 ? <SevPill tone="high">{findingsHigh}H</SevPill> : null}
                      {findingsMedium > 0 ? <SevPill tone="medium">{findingsMedium}M</SevPill> : null}
                      {findingsLow > 0 ? <SevPill tone="low">{findingsLow}L</SevPill> : null}
                    </span>
                  )
                }
                href="/findings"
              />
              <SummaryTile
                icon={<PunchListIcon />}
                label="Punch-list"
                value={String(openPunchListCount)}
                sub={
                  openPunchListCount === 0 ? (
                    <span style={{ color: "#607a3a" }}>All clear ✓</span>
                  ) : (
                    "items open"
                  )
                }
              />
              <SummaryTile
                icon={<CompletionIcon />}
                label="Completion"
                value={completionPct === null ? "—" : `${completionPct}%`}
                sub={`${completedCount} / ${totalInspections} done`}
              />
            </div>
          </Card>
        </section>

        {/* ============== In Progress (horizontal scroll) ============== */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              In progress
              <span className="ml-1.5 font-medium text-[var(--fg-subtle)]">
                · {inProgressCount}
              </span>
            </h2>
            {inProgressCount > 0 ? (
              <Link
                href="/inspections/history?status=in_progress"
                className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
              >
                See all
              </Link>
            ) : null}
          </div>
          {inProgressCount === 0 ? (
            <Card>
              <p className="text-center text-sm text-[var(--fg-muted)]">
                Nothing in progress.
              </p>
              <p className="mt-1 text-center text-xs text-[var(--fg-subtle)]">
                Start a new inspection from the button above.
              </p>
            </Card>
          ) : (
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
              {inProgressList.slice(0, 12).map((i) => (
                <Link
                  key={i.id}
                  href={`/inspections/${i.id}`}
                  className="block w-64 shrink-0 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3 transition hover:border-[var(--primary)]"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
                    Inspection
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-[var(--fg)]">
                    {i.facility_name}
                  </p>
                  {i.location ? (
                    <p className="mt-0.5 truncate text-[11px] text-[var(--fg-muted)]">
                      {i.location}
                    </p>
                  ) : null}
                  <p className="mt-3 text-[11px] text-[var(--fg-subtle)]">
                    Updated {fmtRelative(i.updated_at ?? i.created_at)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ============== Groups (horizontal scroll) ============== */}
        {folders.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                Groups
                <span className="ml-1.5 font-medium text-[var(--fg-subtle)]">
                  · {folders.length}
                </span>
              </h2>
              <Link
                href="/inspections/history"
                className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
              >
                Manage
              </Link>
            </div>
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
              {folders.map((f) => {
                const count = folderInspectionCount.get(f.id) ?? 0;
                return (
                  <Link
                    key={f.id}
                    href="/inspections/history"
                    className="flex w-52 shrink-0 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3 transition hover:border-[var(--primary)]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                        style={{
                          background: "rgba(200,155,60,0.12)",
                          color: "#b8902f",
                        }}
                      >
                        <FolderIconSm />
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                        Group
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--fg)]">
                      {f.name}
                    </p>
                    <p className="text-[11px] text-[var(--fg-subtle)]">
                      {count} {count === 1 ? "inspection" : "inspections"}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ============== Recent activity ============== */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Recent activity
            </h2>
            <Link
              href="/findings"
              className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
            >
              All findings
            </Link>
          </div>
          {activityCapped.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-[var(--fg-muted)]">
                No activity in this team yet.
              </p>
            </Card>
          ) : (
            <Card padded={false}>
              <ul className="divide-y divide-[var(--border)]">
                {activityCapped.map((it, idx) => (
                  <li key={`${it.kind}-${idx}`}>
                    <Link
                      href={it.href}
                      className="block px-4 py-2.5 transition hover:bg-white/[0.02]"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                          style={
                            it.kind === "inspection"
                              ? { background: "rgba(200,155,60,0.12)", color: "#b8902f" }
                              : { background: "rgba(140,106,178,0.12)", color: "#8c6ab2" }
                          }
                        >
                          {it.kind === "inspection" ? <InspectionsIcon /> : <FindingsIconSm />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-[var(--fg)]">
                              {it.primary}
                            </p>
                            {it.severity ? (
                              <SevPill tone={severityTone(it.severity)}>
                                {it.severity}
                              </SevPill>
                            ) : null}
                          </div>
                          <p className="truncate text-[11px] text-[var(--fg-subtle)]">
                            {it.secondary} · by {it.actor}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-[var(--fg-subtle)]">
                          {fmtRelative(it.at)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        {/* ============== Top facilities + contributors (compact, side by side) ============== */}
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
                      {c.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

/* ============================================================
 * Subcomponents
 * ============================================================ */

function SummaryTile({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: React.ReactNode;
  href?: string;
}) {
  const inner = (
    <div className="flex items-start gap-3 px-5 py-4">
      <span
        aria-hidden
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: "rgba(200,155,60,0.10)",
          color: "var(--primary)",
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
          {label}
        </span>
        <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-[var(--fg)]">
          {value}
        </div>
        <div className="mt-1.5 text-[11px] text-[var(--fg-muted)]">{sub}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block transition hover:bg-white/[0.02]"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

/* Icon helpers used in the summary tiles + activity feed.
 * 16px stroke-only line icons that pick up the text color of the
 * surrounding wrapper (so we can tint the wrapper per-tile). */
function InspectionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}
function FindingsIconSm() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 3 8v6c0 5 4 8 9 9 5-1 9-4 9-9V8l-9-5Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function PunchListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
function CompletionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}
function FolderIconSm() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
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
    high: { bg: "rgba(168,54,43,0.10)", fg: "#a8362b" },
    medium: { bg: "rgba(184,118,42,0.10)", fg: "#b8762a" },
    low: { bg: "rgba(148,163,184,0.12)", fg: "var(--slate)" },
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
