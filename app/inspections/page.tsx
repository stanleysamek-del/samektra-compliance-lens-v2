import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { InspectionRowMenu } from "@/components/inspection-row-menu";
import { TeamTipBanner } from "@/components/team-tip-banner";
import { HelpTip } from "@/components/help-tip";
import { SeverityBadge } from "@/components/severity-badge";
import { SubmitButton } from "@/components/submit-button";
import { scoreItems } from "@/lib/checklists/engine";
import { formatDate } from "@/lib/format-date";
import { getCurrentOrg } from "@/lib/org/current";
import { scopeToWorkspace } from "@/lib/org/scope";
import { startSchedule } from "@/app/schedules/actions";

/**
 * Home — the field inspector's start screen, SafetyCulture-style:
 *
 *   Start          Start inspection + "start again" chips (recent type + facility)
 *   Needs attention scheduled inspections and equipment checks due within 7 days
 *   My actions     corrective actions assigned to me, overdue first
 *   Resume         in-progress inspections with % answered
 *   then this week's numbers, recent activity, the daily code insight.
 *
 * Everything follows the workspace switcher. Each query fails open: a
 * slow or missing table hides its section instead of breaking the page.
 */

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

/** ISO timestamp for "7 days ago" — computed once per request. */
function sevenDaysAgoIso(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/** YYYY-MM-DD (UTC) `days` from now — computed once per request. */
function dayIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** "today" / "in 3 days" / "2 days overdue" for a YYYY-MM-DD date. */
function dueLabel(dateIso: string, today: string): { text: string; overdue: boolean } {
  const days = Math.round(
    (Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, overdue: true };
  if (days === 0) return { text: "due today", overdue: false };
  if (days === 1) return { text: "due tomorrow", overdue: false };
  return { text: `due in ${days} days`, overdue: false };
}

const ASSET_LABEL: Record<string, string> = {
  extinguisher: "Extinguisher",
  emergency_light: "Emergency light",
  exit_sign: "Exit sign",
  fire_door: "Fire door",
  pull_station: "Pull station",
  smoke_detector: "Smoke detector",
  sprinkler_riser: "Sprinkler riser",
  fire_damper: "Fire damper",
  eyewash: "Eyewash",
  aed: "AED",
  other: "Equipment",
};

export default async function InspectionsPage() {
  const supabase = await createClient();
  const sevenDaysAgo = sevenDaysAgoIso();
  const today = dayIso(0);
  const inAWeek = dayIso(7);
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

  // Everything below follows the workspace switcher (team or personal),
  // matching History and the campus dashboard.
  const currentOrg = await getCurrentOrg();
  const orgId = currentOrg?.id ?? null;

  // Fire the rest of the queries in parallel and let any of them fail open.
  const [
    inProgressResult,
    recentResult,
    weeklyScansResult,
    weeklyHighFindingsResult,
    schedulesResult,
    assetsDueResult,
    myActionsResult,
  ] = await Promise.all([
    withQueryTimeout(
      scopeToWorkspace(
        supabase
          .from("inspections")
          .select("id, facility_name, location, date_of_inspection, updated_at", {
            count: "exact",
          }),
        orgId,
        user.id,
      )
        .eq("status", "in_progress")
        .order("updated_at", { ascending: false })
        .limit(5),
      4000,
      "in_progress",
    ),
    // 20 recent: 5 render as activity; all feed the quick-start chips.
    withQueryTimeout(
      scopeToWorkspace(
        supabase
          .from("inspections")
          .select("id, facility_id, facility_name, location, status, date_of_inspection, created_at"),
        orgId,
        user.id,
      )
        .order("created_at", { ascending: false })
        .limit(20),
      4000,
      "recent",
    ),
    withQueryTimeout(
      scopeToWorkspace(
        supabase
          .from("photos")
          .select("id, inspections!inner(organization_id, created_by)", {
            count: "exact",
            head: true,
          }),
        orgId,
        user.id,
        "inspections.",
      ).gte("created_at", sevenDaysAgo),
      4000,
      "weekly_scans",
    ),
    withQueryTimeout(
      scopeToWorkspace(
        supabase
          .from("findings")
          .select("id, inspections!inner(organization_id, created_by)", {
            count: "exact",
            head: true,
          }),
        orgId,
        user.id,
        "inspections.",
      )
        .eq("severity", "High")
        // "Open" means not yet fixed — done/verified/won't-fix drop out.
        .in("cap_status", ["open", "in_progress"])
        .gte("created_at", sevenDaysAgo),
      4000,
      "weekly_high_findings",
    ),
    // Scheduled inspections due within a week (overdue included).
    withQueryTimeout(
      scopeToWorkspace(
        supabase
          .from("inspection_schedules")
          .select("id, name, cadence, next_due, inspections!inner(facility_name, organization_id, created_by)"),
        orgId,
        user.id,
        "inspections.",
      )
        .eq("enabled", true)
        .lte("next_due", inAWeek)
        .order("next_due", { ascending: true })
        .limit(8),
      4000,
      "schedules_due",
    ),
    // Equipment checks due within a week (overdue included).
    withQueryTimeout(
      scopeToWorkspace(
        supabase
          .from("assets")
          .select("id, label, type, barcode, location_text, next_due_at, facilities!inner(name, organization_id, created_by)", {
            count: "exact",
          }),
        orgId,
        user.id,
        "facilities.",
      )
        .eq("status", "in_service")
        .lte("next_due_at", `${inAWeek}T23:59:59Z`)
        .order("next_due_at", { ascending: true })
        .limit(6),
      4000,
      "assets_due",
    ),
    // Corrective actions assigned to me, soonest due first.
    withQueryTimeout(
      scopeToWorkspace(
        supabase
          .from("findings")
          .select("id, title, severity, cap_status, cap_target_date, inspection_id, photo_id, inspections!inner(facility_name, organization_id, created_by)", {
            count: "exact",
          }),
        orgId,
        user.id,
        "inspections.",
      )
        .eq("assigned_to", user.id)
        .in("cap_status", ["open", "in_progress"])
        .order("cap_target_date", { ascending: true, nullsFirst: false })
        .limit(5),
      4000,
      "my_actions",
    ),
  ]);

  const inProgress = inProgressResult?.data ?? null;
  // Only 5 cards render; the header shows the real total.
  const inProgressTotal = inProgressResult?.count ?? inProgress?.length ?? 0;
  const recentAll = recentResult?.data ?? null;
  const recent = recentAll?.slice(0, 5) ?? null;
  const weeklyScans = weeklyScansResult?.count ?? null;
  const weeklyHighFindings = weeklyHighFindingsResult?.count ?? null;

  type ScheduleDue = {
    id: string;
    name: string;
    cadence: string;
    next_due: string;
    inspections: { facility_name: string | null } | null;
  };
  type AssetDue = {
    id: string;
    label: string | null;
    type: string;
    barcode: string | null;
    location_text: string | null;
    next_due_at: string;
    facilities: { name: string | null } | null;
  };
  type MyAction = {
    id: string;
    title: string | null;
    severity: "Low" | "Medium" | "High";
    cap_status: string | null;
    cap_target_date: string | null;
    inspection_id: string;
    photo_id: string | null;
    inspections: { facility_name: string | null } | null;
  };
  const schedulesDue = (schedulesResult?.data ?? []) as unknown as ScheduleDue[];
  const assetsDue = (assetsDueResult?.data ?? []) as unknown as AssetDue[];
  const assetsDueTotal = assetsDueResult?.count ?? assetsDue.length;
  const myActions = (myActionsResult?.data ?? []) as unknown as MyAction[];
  const myActionsTotal = myActionsResult?.count ?? myActions.length;
  const myOverdue = myActions.filter((a) => a.cap_target_date && a.cap_target_date < today).length;
  const attentionCount = schedulesDue.length + assetsDueTotal;

  // Checklist rows for the in-progress + recent inspections: progress bars,
  // the score tile, and (sort = 0 rows) each inspection's template for the
  // quick-start chips.
  const recentIds = Array.from(
    new Set([...(recent ?? []).map((r) => r.id), ...(inProgress ?? []).map((r) => r.id)]),
  );
  const allRecentIds = (recentAll ?? []).map((r) => r.id);
  let checklistAvgPct: number | null = null;
  let checklistScoredCount = 0;
  let recentHighFindings: number | null = null;
  const progressById = new Map<string, { answered: number; total: number }>();
  const templateByInspection = new Map<string, { ref: string; name: string }>();
  if (recentIds.length > 0 || allRecentIds.length > 0) {
    const [clResult, highResult, firstRowsResult] = await Promise.all([
      recentIds.length > 0
        ? withQueryTimeout(
            supabase
              .from("inspection_checklist_items")
              .select("inspection_id, answer")
              .in("inspection_id", recentIds),
            4000,
            "checklist_scores",
          )
        : Promise.resolve(null),
      recentIds.length > 0
        ? withQueryTimeout(
            supabase
              .from("findings")
              .select("id", { count: "exact", head: true })
              .eq("severity", "High")
              .in("inspection_id", recentIds),
            4000,
            "recent_high_findings",
          )
        : Promise.resolve(null),
      allRecentIds.length > 0
        ? withQueryTimeout(
            supabase
              .from("inspection_checklist_items")
              .select("inspection_id, template_ref, template_name")
              .in("inspection_id", allRecentIds)
              .eq("sort", 0),
            4000,
            "recent_templates",
          )
        : Promise.resolve(null),
    ]);
    const rows = (clResult?.data ?? []) as Array<{
      inspection_id: string;
      answer: "yes" | "no" | "na" | null;
    }>;
    const byInspection = new Map<string, Array<{ answer: "yes" | "no" | "na" | null }>>();
    for (const r of rows) {
      const arr = byInspection.get(r.inspection_id) ?? [];
      arr.push({ answer: r.answer });
      byInspection.set(r.inspection_id, arr);
    }
    const pcts: number[] = [];
    for (const [inspectionId, items] of byInspection) {
      const s = scoreItems(items);
      if (s.pct !== null) pcts.push(s.pct);
      progressById.set(inspectionId, { answered: items.length - s.unanswered, total: items.length });
    }
    if (pcts.length > 0) {
      checklistScoredCount = pcts.length;
      checklistAvgPct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    }
    recentHighFindings = highResult?.count ?? null;
    for (const r of (firstRowsResult?.data ?? []) as Array<{
      inspection_id: string;
      template_ref: string | null;
      template_name: string | null;
    }>) {
      if (r.template_ref) {
        templateByInspection.set(r.inspection_id, { ref: r.template_ref, name: r.template_name ?? "Checklist" });
      }
    }
  }

  // Quick start: the most recent distinct (inspection type, facility)
  // pairs — "do that round again" in one tap.
  const quickStarts: Array<{ key: string; href: string; template: string; facility: string }> = [];
  for (const r of recentAll ?? []) {
    const tpl = templateByInspection.get(r.id);
    if (!tpl) continue;
    const facilityId = (r as { facility_id?: string | null }).facility_id ?? null;
    const key = `${tpl.ref}|${facilityId ?? r.facility_name}`;
    if (quickStarts.some((q) => q.key === key)) continue;
    const qs = new URLSearchParams({ template: tpl.ref });
    if (facilityId) qs.set("facility", facilityId);
    quickStarts.push({ key, href: `/inspections/new?${qs.toString()}`, template: tpl.name, facility: r.facility_name });
    if (quickStarts.length === 3) break;
  }

  const hasAnyInspection = (recent?.length ?? 0) > 0 || (inProgress?.length ?? 0) > 0;
  // True when a core section couldn't load — surfaces a banner. (Optional
  // sections — schedules, equipment, my actions — just stay hidden.)
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
            className="flex items-start gap-2 rounded border px-3 py-2 text-xs"
            style={{ borderColor: "#8a5300", background: "#fdf3dc", color: "#8a5300" }}
          >
            <span aria-hidden>⚠</span>
            <span>
              Some sections couldn&apos;t load — we&apos;re showing what we
              have. Refresh to retry.
            </span>
          </div>
        ) : null}

        {/* ============== Start ============== */}
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl tracking-tight text-[var(--fg)] sm:text-3xl">
                {`Welcome back, ${displayProfile.full_name.split(" ")[0] || displayProfile.full_name}.`}
              </h1>
              <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
                {currentOrg ? currentOrg.name : "Personal workspace"}
                {attentionCount + myOverdue > 0
                  ? ` · ${attentionCount + myOverdue} thing${attentionCount + myOverdue === 1 ? "" : "s"} need${attentionCount + myOverdue === 1 ? "s" : ""} attention`
                  : ""}
              </p>
            </div>
            <Link href="/inspections/new" className="cl-btn-accent">
              + Start inspection
            </Link>
          </div>
          {quickStarts.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--fg-muted)]">Start again</span>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {quickStarts.map((q) => (
                  <Link
                    key={q.key}
                    href={q.href}
                    className="flex min-h-11 shrink-0 flex-col justify-center rounded border border-[var(--rule-strong)] bg-[var(--paper-2)] px-3 py-1.5 transition hover:border-[var(--ink)]"
                  >
                    <span className="max-w-[16rem] truncate text-sm font-medium text-[var(--ink)]">{q.template}</span>
                    <span className="max-w-[16rem] truncate text-xs text-[var(--fg-muted)]">{q.facility}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </header>

        {/* One-time, dismissible nudge — only shows for users not in a
            team yet. Renders nothing once dismissed (localStorage). */}
        <TeamTipBanner />

        {/* ============== Needs attention ============== */}
        {schedulesDue.length > 0 || assetsDue.length > 0 ? (
          <section className="flex flex-col gap-3" aria-labelledby="attention-heading">
            <SectionHeading id="attention-heading" count={attentionCount}>
              Due this week
            </SectionHeading>
            <Card padded={false}>
              <ul className="divide-y divide-[var(--border)]">
                {schedulesDue.map((s) => {
                  const due = dueLabel(s.next_due, today);
                  const startable = s.next_due <= today;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <KindTag>Inspection</KindTag>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ink)]">{s.name}</p>
                        <p className="truncate text-xs text-[var(--fg-muted)]">
                          {s.inspections?.facility_name ?? "—"} · {s.cadence} ·{" "}
                          <span className={due.overdue ? "font-semibold text-[var(--danger)]" : ""}>{due.text}</span>
                        </p>
                      </div>
                      {startable ? (
                        <form action={startSchedule}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="due" value={s.next_due} />
                          <SubmitButton className="cl-btn-primary cl-btn-sm" pendingLabel="Starting…">
                            Start
                          </SubmitButton>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
                {assetsDue.map((a) => {
                  const due = dueLabel(a.next_due_at, today);
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/assets/${a.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--paper-3)]"
                      >
                        <KindTag>Equipment</KindTag>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--ink)]">
                            {a.label ?? a.barcode ?? ASSET_LABEL[a.type] ?? "Equipment"}
                            <span className="font-normal text-[var(--fg-muted)]"> · {ASSET_LABEL[a.type] ?? a.type}</span>
                          </p>
                          <p className="truncate text-xs text-[var(--fg-muted)]">
                            {a.facilities?.name ?? "—"}
                            {a.location_text ? ` · ${a.location_text}` : ""} ·{" "}
                            <span className={due.overdue ? "font-semibold text-[var(--danger)]" : ""}>{due.text}</span>
                          </p>
                        </div>
                        <span aria-hidden className="text-[var(--fg-subtle)]">→</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {assetsDueTotal > assetsDue.length ? (
                <Link
                  href="/assets"
                  className="block border-t border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper-3)]"
                >
                  All {assetsDueTotal} equipment checks due →
                </Link>
              ) : null}
            </Card>
          </section>
        ) : null}

        {/* ============== My actions ============== */}
        {myActions.length > 0 ? (
          <section className="flex flex-col gap-3" aria-labelledby="my-actions-heading">
            <SectionHeading id="my-actions-heading" count={myActionsTotal} href="/actions" linkLabel="All my actions">
              My actions
              {myOverdue > 0 ? (
                <span className="ml-2 rounded-full bg-[#fdecea] px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-[var(--danger)]">
                  {myOverdue} overdue
                </span>
              ) : null}
            </SectionHeading>
            <Card padded={false}>
              <ul className="divide-y divide-[var(--border)]">
                {myActions.map((a) => {
                  const due = a.cap_target_date ? dueLabel(a.cap_target_date, today) : null;
                  const href = a.photo_id
                    ? `/inspections/${a.inspection_id}/photos/${a.photo_id}#finding-${a.id}`
                    : `/inspections/${a.inspection_id}?step=audit`;
                  return (
                    <li key={a.id}>
                      <Link href={href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--paper-3)]">
                        <SeverityBadge severity={a.severity} size="sm" compact />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--ink)]">{a.title ?? "Untitled finding"}</p>
                          <p className="truncate text-xs text-[var(--fg-muted)]">
                            {a.inspections?.facility_name ?? "—"}
                            {due ? (
                              <>
                                {" · "}
                                <span className={due.overdue ? "font-semibold text-[var(--danger)]" : ""}>{due.text}</span>
                              </>
                            ) : (
                              " · no due date"
                            )}
                          </p>
                        </div>
                        <span aria-hidden className="text-[var(--fg-subtle)]">→</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ) : null}

        {/* ============== Resume ============== */}
        {inProgress && inProgress.length > 0 ? (
          <section className="flex flex-col gap-3" aria-labelledby="resume-heading">
            <SectionHeading
              id="resume-heading"
              count={inProgressTotal}
              href="/inspections/history?status=in_progress"
              linkLabel="See all"
            >
              Resume
            </SectionHeading>
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
              {inProgress.map((row) => {
                const prog = progressById.get(row.id);
                const pct = prog && prog.total > 0 ? Math.round((prog.answered / prog.total) * 100) : null;
                return (
                  <Link
                    key={row.id}
                    href={`/inspections/${row.id}`}
                    className="flex w-64 shrink-0 flex-col rounded border border-[var(--border)] bg-[var(--paper-2)] px-3.5 py-3 transition hover:border-[var(--ink)]"
                  >
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--ink)]">{row.facility_name}</p>
                    {row.location ? (
                      <p className="mt-0.5 truncate text-xs text-[var(--fg-muted)]">{row.location}</p>
                    ) : null}
                    {pct !== null ? (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--paper-3)]" aria-hidden>
                          <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs tabular-nums text-[var(--fg-muted)]">
                          {prog!.answered}/{prog!.total} answered · {pct}%
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-[var(--fg-muted)]">Photo walk</p>
                    )}
                    <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                      {row.date_of_inspection ? formatDate(row.date_of_inspection) : "No date"}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ============== This week ============== */}
        {hasAnyInspection ? (
          <Card padded={false}>
            <div className="grid grid-cols-3 divide-x divide-[var(--border)]">
              <HomeStat label="Photos" value={String(weeklyScans ?? 0)} sub="last 7 days" />
              <HomeStat
                label="High-severity"
                value={String(weeklyHighFindings ?? 0)}
                sub={
                  (weeklyHighFindings ?? 0) === 0 ? (
                    <span style={{ color: "#2f6b2f" }}>None open this week</span>
                  ) : (
                    "still open · last 7 days"
                  )
                }
                tone="warning"
              />
              {checklistAvgPct !== null ? (
                <HomeStat
                  label={
                    <span className="inline-flex items-center gap-1">
                      Checklist score
                      <HelpTip title="Checklist score" side="bottom">
                        Score = Yes ÷ (Yes + No). N.A. (&ldquo;not applicable —
                        this building doesn&apos;t have that system&rdquo;) is
                        removed from the math, so it never hurts your score.
                        Unanswered questions aren&apos;t counted but show as
                        gaps on the report.
                      </HelpTip>
                    </span>
                  }
                  value={`${checklistAvgPct}%`}
                  sub={`avg of ${checklistScoredCount} recent inspection${checklistScoredCount === 1 ? "" : "s"}`}
                  tone="primary"
                />
              ) : (
                <HomeStat
                  label="High-severity findings"
                  value={recentHighFindings === null ? "—" : String(recentHighFindings)}
                  sub={
                    recentIds.length === 0
                      ? "no inspections yet"
                      : `across ${recentIds.length} recent inspection${recentIds.length === 1 ? "" : "s"}`
                  }
                  tone="primary"
                />
              )}
            </div>
          </Card>
        ) : null}

        {/* ============== Recent activity (ledger) ============== */}
        <section className="flex flex-col gap-3" aria-labelledby="recent-heading">
          <SectionHeading id="recent-heading" href="/inspections/history" linkLabel="See all">
            Recent activity
          </SectionHeading>
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
                        <p className="truncate text-xs text-[var(--fg-subtle)]">
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
                    <strong className="font-semibold text-[var(--fg)]">
                      Chip is the AI that reads your photos.
                    </strong>{" "}
                    Snap a photo of equipment, an exit, a panel — Chip drafts
                    the finding with the code citation. You confirm or
                    correct, assign the fix, sign, and export the report.
                  </p>
                </div>
                <ol className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
                  <EmptyStep n={1} title="Create" body="Pick an inspection type and a facility — under a minute." />
                  <EmptyStep n={2} title="Walk" body="Answer the checklist; add a photo, note or action right on any question that fails." />
                  <EmptyStep n={3} title="Sign & export" body="Review, sign, finalize. PDF, CAP, LSRA, ILSM — generated for you." />
                </ol>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
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

function SectionHeading({
  id,
  children,
  count,
  href,
  linkLabel,
}: {
  id: string;
  children: React.ReactNode;
  count?: number;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 id={id} className="flex items-center text-base font-semibold text-[var(--ink)]">
        {children}
        {count !== undefined && count > 0 ? (
          <span className="ml-1.5 text-sm font-normal tabular-nums text-[var(--fg-muted)]">· {count}</span>
        ) : null}
      </h2>
      {href ? (
        <Link href={href} className="text-sm font-medium text-[var(--ink)] underline-offset-2 hover:underline">
          {linkLabel ?? "See all"}
        </Link>
      ) : null}
    </div>
  );
}

function KindTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="hidden w-24 shrink-0 text-xs font-medium uppercase tracking-[0.06em] text-[var(--fg-subtle)] sm:inline">
      {children}
    </span>
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
            background: "rgba(200,155,60,0.18)",
            color: "#b8902f",
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
  label: React.ReactNode;
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
    <div className="flex flex-col gap-1 px-3 py-3 sm:px-5 sm:py-4">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        {label}
      </span>
      <span
        className="text-xl font-semibold leading-none tracking-tight sm:text-2xl"
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
    in_progress: { label: "In progress", bg: "rgba(184,118,42,0.10)", fg: "#8a5300" },
    completed: { label: "Completed", bg: "rgba(96,122,58,0.10)", fg: "#2f6b2f" },
    archived: { label: "Archived", bg: "rgba(15,21,24,0.06)", fg: "var(--slate)" },
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
