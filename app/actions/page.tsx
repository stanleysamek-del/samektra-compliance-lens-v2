import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";

/**
 * Cross-inspection Actions board — every finding that has been assigned
 * or is still open, sorted so what needs attention first is on top:
 * overdue, then due-soonest, then priority. Filters live in the URL so
 * a filtered view is shareable ("here's everything overdue at Midtown").
 *
 * Rows deep-link to the finding on its photo page, where the ActionStrip
 * carries the actual workflow (assign / status / close-out / comments).
 */

type ActionStatus = "open" | "in_progress" | "done" | "verified" | "wont_fix";
type Priority = "low" | "medium" | "high";

const STATUSES: ActionStatus[] = ["open", "in_progress", "done", "verified", "wont_fix"];
const PRIORITIES: Priority[] = ["high", "medium", "low"];

type Filters = {
  status: ActionStatus | "active" | null; // "active" = open + in_progress + done
  priority: Priority | null;
  who: "me" | null;
  overdue: "1" | null;
};

function parseFilters(sp: {
  status?: string;
  priority?: string;
  who?: string;
  overdue?: string;
}): Filters {
  const status =
    sp.status === "active" || (STATUSES as readonly string[]).includes(sp.status ?? "")
      ? (sp.status as Filters["status"])
      : null;
  const priority = (PRIORITIES as readonly string[]).includes(sp.priority ?? "")
    ? (sp.priority as Priority)
    : null;
  return {
    status,
    priority,
    who: sp.who === "me" ? "me" : null,
    overdue: sp.overdue === "1" ? "1" : null,
  };
}

function buildUrl(f: Filters): string {
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.priority) params.set("priority", f.priority);
  if (f.who) params.set("who", f.who);
  if (f.overdue) params.set("overdue", f.overdue);
  const qs = params.toString();
  return qs ? `/actions?${qs}` : "/actions";
}

const STATUS_LABEL: Record<ActionStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done — verify",
  verified: "Verified",
  wont_fix: "Won't fix",
};

export default async function ActionsBoardPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    who?: string;
    overdue?: string;
  }>;
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

  const sp = await searchParams;
  const filters = parseFilters(sp);
  const today = new Date().toISOString().slice(0, 10);

  let q = supabase
    .from("findings")
    .select(
      "id, inspection_id, photo_id, title, category, code, severity, cap_status, priority, cap_target_date, assigned_to, assigned_email, action_closed_at, created_at, inspections!inner(facility_name)",
    )
    .limit(500);

  if (filters.status === "active") {
    q = q.in("cap_status", ["open", "in_progress", "done"]);
  } else if (filters.status) {
    q = q.eq("cap_status", filters.status);
  }
  if (filters.priority) q = q.eq("priority", filters.priority);
  if (filters.who === "me") q = q.eq("assigned_to", user.id);
  if (filters.overdue) {
    q = q
      .lt("cap_target_date", today)
      .in("cap_status", ["open", "in_progress"]);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[actions board] query failed:", error.message);
  }

  type Row = {
    id: string;
    inspection_id: string;
    photo_id: string | null;
    title: string;
    category: string;
    code: string | null;
    severity: "High" | "Medium" | "Low";
    cap_status: ActionStatus | null;
    priority: Priority | null;
    cap_target_date: string | null;
    assigned_to: string | null;
    assigned_email: string | null;
    action_closed_at: string | null;
    created_at: string;
    inspections: { facility_name: string } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    cap_status: r.cap_status ?? "open",
    priority: r.priority ?? "medium",
  }));

  const isOverdue = (r: (typeof rows)[number]) =>
    Boolean(
      r.cap_target_date &&
        r.cap_target_date < today &&
        (r.cap_status === "open" || r.cap_status === "in_progress"),
    );

  // Sort: overdue first, then due-soonest (undated last), then priority
  // high→low, then newest finding.
  const prioRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  rows.sort((a, b) => {
    const od = Number(isOverdue(b)) - Number(isOverdue(a));
    if (od !== 0) return od;
    const ad = a.cap_target_date ?? "9999-12-31";
    const bd = b.cap_target_date ?? "9999-12-31";
    if (ad !== bd) return ad < bd ? -1 : 1;
    const pr = prioRank[a.priority] - prioRank[b.priority];
    if (pr !== 0) return pr;
    return a.created_at < b.created_at ? 1 : -1;
  });

  // Summary tiles ignore the status filter's slicing so they always show
  // the true workload shape of the current result set.
  const counts = {
    open: rows.filter((r) => r.cap_status === "open").length,
    inProgress: rows.filter((r) => r.cap_status === "in_progress").length,
    awaitingVerify: rows.filter((r) => r.cap_status === "done").length,
    overdue: rows.filter(isOverdue).length,
  };

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-5">
        <div className="px-1">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
            Actions
          </h1>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            Every corrective action across every inspection — what&apos;s
            overdue floats to the top.
          </p>
        </div>

        <Card padded={false}>
          <div className="grid grid-cols-2 divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <Tile label="Open" value={counts.open} />
            <Tile label="In progress" value={counts.inProgress} tone="medium" />
            <Tile label="Awaiting verify" value={counts.awaitingVerify} tone="teal" />
            <Tile label="Overdue" value={counts.overdue} tone="high" />
          </div>
        </Card>

        {/* Filter chips */}
        <div className="flex flex-col gap-2.5 px-1">
          <FilterGroup
            label="Status"
            options={[
              { value: null, label: "All" },
              { value: "active", label: "Active" },
              ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
            ]}
            currentValue={filters.status}
            buildHref={(v) => buildUrl({ ...filters, status: v as Filters["status"] })}
          />
          <FilterGroup
            label="Priority"
            options={[
              { value: null, label: "Any" },
              { value: "high", label: "High" },
              { value: "medium", label: "Medium" },
              { value: "low", label: "Low" },
            ]}
            currentValue={filters.priority}
            buildHref={(v) => buildUrl({ ...filters, priority: v as Priority | null })}
          />
          <FilterGroup
            label="Show"
            options={[
              { value: null, label: "Everyone" },
              { value: "me", label: "Assigned to me" },
            ]}
            currentValue={filters.who}
            buildHref={(v) => buildUrl({ ...filters, who: v as "me" | null })}
          />
          <FilterGroup
            label="Due"
            options={[
              { value: null, label: "Any" },
              { value: "1", label: "Overdue only" },
            ]}
            currentValue={filters.overdue}
            buildHref={(v) => buildUrl({ ...filters, overdue: v as "1" | null })}
          />
        </div>

        {/* List */}
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            {rows.length === 0
              ? "Nothing matches the current filters"
              : `${rows.length} ${rows.length === 1 ? "action" : "actions"}`}
          </h2>
          {rows.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-[var(--fg-muted)]">
                Findings become actions when you assign them — open any
                finding and use the Action strip.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((r) => {
                const overdue = isOverdue(r);
                return (
                  <li key={r.id}>
                    <Link
                      href={
                        r.photo_id
                          ? `/inspections/${r.inspection_id}/photos/${r.photo_id}#finding-${r.id}`
                          : `/inspections/${r.inspection_id}`
                      }
                      className="block rounded-lg border bg-[var(--bg-elevated)] px-3 py-2.5 transition hover:border-[var(--primary)]"
                      style={{
                        borderColor: overdue ? "#a8362b" : "var(--border)",
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={r.cap_status} overdue={overdue} />
                        {r.priority === "high" ? (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "rgba(168,54,43,0.10)", color: "#a8362b" }}
                          >
                            High priority
                          </span>
                        ) : null}
                        <span className="text-[11px] font-medium text-[var(--fg-muted)]">
                          {r.severity} · {r.category}
                          {r.code ? ` · ${r.code}` : ""}
                        </span>
                        <span
                          className="ml-auto text-[10px] font-medium"
                          style={{ color: overdue ? "#a8362b" : "var(--fg-subtle)" }}
                        >
                          {r.cap_target_date
                            ? `${overdue ? "OVERDUE · " : "due "}${r.cap_target_date}`
                            : "no due date"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-[var(--fg)]">
                        {r.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">
                        {r.inspections?.facility_name ?? "—"}
                        {r.assigned_to || r.assigned_email ? (
                          <> · assigned{r.assigned_email ? ` to ${r.assigned_email}` : ""}</>
                        ) : (
                          <> · unassigned</>
                        )}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "high" | "medium" | "teal";
}) {
  const color =
    tone === "high"
      ? "#a8362b"
      : tone === "medium"
        ? "#b8762a"
        : tone === "teal"
          ? "#0f766e"
          : "var(--fg)";
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        {label}
      </span>
      <span
        className="text-2xl font-semibold leading-none tracking-tight"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({
  status,
  overdue,
}: {
  status: ActionStatus;
  overdue: boolean;
}) {
  const styles =
    overdue
      ? { bg: "rgba(168,54,43,0.12)", fg: "#a8362b" }
      : status === "in_progress"
        ? { bg: "rgba(184,118,42,0.12)", fg: "#b8762a" }
        : status === "done"
          ? { bg: "rgba(20,184,166,0.12)", fg: "#0f766e" }
          : status === "verified"
            ? { bg: "rgba(96,122,58,0.12)", fg: "#607a3a" }
            : { bg: "rgba(15,21,24,0.06)", fg: "var(--slate)" };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: styles.bg, color: styles.fg }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function FilterGroup({
  label,
  options,
  currentValue,
  buildHref,
}: {
  label: string;
  options: { value: string | null; label: string }[];
  currentValue: string | null;
  buildHref: (v: string | null) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        {label}
      </span>
      {options.map((opt) => {
        const selected = opt.value === currentValue;
        return (
          <Link
            key={opt.value ?? "__all__"}
            href={buildHref(selected ? null : opt.value)}
            className={[
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
              selected
                ? "border-[var(--primary)] bg-[var(--primary)] text-[#0a0d12]"
                : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/[0.04] hover:text-[var(--fg)]",
            ].join(" ")}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
