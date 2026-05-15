import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";

type Severity = "High" | "Medium" | "Low";
const SEVERITIES: Severity[] = ["High", "Medium", "Low"];

const CATEGORIES = [
  "Fire",
  "Electrical",
  "Egress",
  "ADA",
  "Hazmat",
  "InfectionControl",
  "Structural",
  "Other",
] as const;

type Filters = {
  severity: Severity | null;
  category: string | null;
  rating: "up" | "down" | "unrated" | null;
};

function parseFilters(sp: {
  severity?: string;
  category?: string;
  rating?: string;
}): Filters {
  const severity = (SEVERITIES as readonly string[]).includes(sp.severity ?? "")
    ? (sp.severity as Severity)
    : null;
  const category = (CATEGORIES as readonly string[]).includes(sp.category ?? "")
    ? (sp.category as string)
    : null;
  const rating =
    sp.rating === "up" || sp.rating === "down" || sp.rating === "unrated"
      ? sp.rating
      : null;
  return { severity, category, rating };
}

/**
 * Cross-inspection findings dashboard. Server-rendered, filters live in
 * the URL via search params so they're shareable and survive refresh.
 *
 * Layout:
 *   1. Summary tiles (totals, severity split, thumbs split)
 *   2. Category breakdown — CSS bar chart, no JS chart lib needed
 *   3. Filter chips (Severity / Category / Rating)
 *   4. Findings list with deep-link to each finding's photo
 *
 * Skips: time-series, date-range filter, per-facility rollups, CSV export.
 * Those land in Phase 2 once we see how this gets used.
 */
export default async function FindingsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    severity?: string;
    category?: string;
    rating?: string;
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

  // Pull all findings for this user — joined with inspections for the
  // facility name. We grab a generous limit (500) so the page works
  // through the first year or so without pagination. Beyond that, we'll
  // add cursor pagination + an OLAP-style aggregate query.
  let q = supabase
    .from("findings")
    .select(
      "id, inspection_id, photo_id, title, category, code, severity, user_rating, created_at, inspections!inner(facility_name)",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.severity) q = q.eq("severity", filters.severity);
  if (filters.category) q = q.eq("category", filters.category);
  if (filters.rating === "up") q = q.eq("user_rating", 1);
  else if (filters.rating === "down") q = q.eq("user_rating", -1);
  else if (filters.rating === "unrated") q = q.is("user_rating", null);

  const { data: findings, error } = await q;
  if (error) {
    console.error("[findings dashboard] query failed:", error.message);
  }
  const rows = (findings ?? []) as unknown as Array<{
    id: string;
    inspection_id: string;
    photo_id: string | null;
    title: string;
    category: string;
    code: string | null;
    severity: Severity;
    user_rating: number | null;
    created_at: string;
    inspections: { facility_name: string } | null;
  }>;

  // Aggregate counts for the summary tiles + category bar chart.
  const totalCount = rows.length;
  const sevCounts: Record<Severity, number> = { High: 0, Medium: 0, Low: 0 };
  const catCounts = new Map<string, number>();
  let thumbsUp = 0;
  let thumbsDown = 0;
  let unrated = 0;
  for (const r of rows) {
    sevCounts[r.severity] = (sevCounts[r.severity] ?? 0) + 1;
    catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
    if (r.user_rating === 1) thumbsUp += 1;
    else if (r.user_rating === -1) thumbsDown += 1;
    else unrated += 1;
  }
  // Sort categories by count desc for the bar chart.
  const sortedCats = Array.from(catCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const maxCatCount = sortedCats[0]?.[1] ?? 1;

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
            Findings
          </h1>
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
            Every finding across every inspection in one place.
          </p>
        </div>

        {/* Summary tiles */}
        <Card padded={false}>
          <div className="grid grid-cols-2 divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <SummaryTile label="Total" value={String(totalCount)} sub="findings" />
            <SummaryTile
              label="High"
              value={String(sevCounts.High)}
              tone="high"
              sub={`${pct(sevCounts.High, totalCount)} of total`}
            />
            <SummaryTile
              label="Medium"
              value={String(sevCounts.Medium)}
              tone="medium"
              sub={`${pct(sevCounts.Medium, totalCount)} of total`}
            />
            <SummaryTile
              label="Low"
              value={String(sevCounts.Low)}
              tone="low"
              sub={`${pct(sevCounts.Low, totalCount)} of total`}
            />
          </div>
        </Card>

        {/* Feedback breakdown */}
        {totalCount > 0 ? (
          <Card>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                Feedback
              </span>
              <span style={{ color: "#5eead4" }}>
                👍 {thumbsUp}{" "}
                <span className="text-[var(--fg-subtle)]">
                  ({pct(thumbsUp, totalCount)})
                </span>
              </span>
              <span style={{ color: "#fca5a5" }}>
                👎 {thumbsDown}{" "}
                <span className="text-[var(--fg-subtle)]">
                  ({pct(thumbsDown, totalCount)})
                </span>
              </span>
              <span className="text-[var(--fg-muted)]">
                Unrated {unrated}{" "}
                <span className="text-[var(--fg-subtle)]">
                  ({pct(unrated, totalCount)})
                </span>
              </span>
            </div>
          </Card>
        ) : null}

        {/* Category breakdown — CSS bar chart, ordered desc by count. */}
        {sortedCats.length > 0 ? (
          <Card>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              By category
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {sortedCats.map(([cat, count]) => {
                const width = Math.max(2, Math.round((count / maxCatCount) * 100));
                return (
                  <li key={cat} className="flex items-center gap-3 text-xs">
                    <Link
                      href={catUrl(filters, cat)}
                      className="w-28 shrink-0 truncate font-medium text-[var(--fg)] transition hover:text-[var(--primary)]"
                    >
                      {cat}
                    </Link>
                    <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${width}%`,
                          background:
                            "linear-gradient(90deg, var(--primary), var(--accent))",
                        }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-[11px] text-[var(--fg-muted)]">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {/* Filter chips */}
        <div className="flex flex-col gap-2.5 px-1">
          <FilterGroup
            label="Severity"
            options={[
              { value: null, label: "All" },
              { value: "High", label: "High", tone: "high" },
              { value: "Medium", label: "Medium", tone: "medium" },
              { value: "Low", label: "Low", tone: "low" },
            ]}
            currentValue={filters.severity}
            buildHref={(v) => buildUrl({ ...filters, severity: v as Severity | null })}
          />
          <FilterGroup
            label="Category"
            options={[
              { value: null, label: "All" },
              ...CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
            currentValue={filters.category}
            buildHref={(v) => buildUrl({ ...filters, category: v })}
          />
          <FilterGroup
            label="Rating"
            options={[
              { value: null, label: "Any" },
              { value: "up", label: "👍 Liked" },
              { value: "down", label: "👎 Wrong call" },
              { value: "unrated", label: "Unrated" },
            ]}
            currentValue={filters.rating}
            buildHref={(v) =>
              buildUrl({
                ...filters,
                rating: v as "up" | "down" | "unrated" | null,
              })
            }
          />
        </div>

        {/* List */}
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            {rows.length === 0
              ? "No findings match the current filters"
              : `${rows.length} ${rows.length === 1 ? "finding" : "findings"}`}
          </h2>
          {rows.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-[var(--fg-muted)]">
                Try clearing a filter, or run an inspection to start collecting
                findings.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={
                      r.photo_id
                        ? `/inspections/${r.inspection_id}/photos/${r.photo_id}#finding-${r.id}`
                        : `/inspections/${r.inspection_id}`
                    }
                    className="block rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 transition hover:border-[var(--primary)]"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <SeverityPill severity={r.severity} />
                      <span className="text-[11px] font-medium text-[var(--fg-muted)]">
                        {r.category}
                        {r.code ? ` · ${r.code}` : ""}
                      </span>
                      {r.user_rating === 1 ? (
                        <span style={{ color: "#5eead4", fontSize: 11 }}>👍</span>
                      ) : r.user_rating === -1 ? (
                        <span style={{ color: "#fca5a5", fontSize: 11 }}>👎</span>
                      ) : null}
                      <span className="ml-auto text-[10px] text-[var(--fg-subtle)]">
                        {new Date(r.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-[var(--fg)]">
                      {r.title}
                    </p>
                    {r.inspections?.facility_name ? (
                      <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">
                        {r.inspections.facility_name}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function buildUrl(f: Filters): string {
  const params = new URLSearchParams();
  if (f.severity) params.set("severity", f.severity);
  if (f.category) params.set("category", f.category);
  if (f.rating) params.set("rating", f.rating);
  const qs = params.toString();
  return qs ? `/findings?${qs}` : "/findings";
}

function catUrl(currentFilters: Filters, category: string): string {
  // Clicking a category bar applies (or toggles off) that category filter.
  return buildUrl({
    ...currentFilters,
    category: currentFilters.category === category ? null : category,
  });
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "high" | "medium" | "low";
}) {
  const valueColor =
    tone === "high"
      ? "#fca5a5"
      : tone === "medium"
        ? "#fbbf24"
        : tone === "low"
          ? "#cbd5e1"
          : "var(--fg)";
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
        {label}
      </span>
      <span
        className="text-2xl font-semibold leading-none tracking-tight"
        style={{ color: valueColor }}
      >
        {value}
      </span>
      <span className="text-[11px] text-[var(--fg-muted)]">{sub}</span>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  currentValue,
  buildHref,
}: {
  label: string;
  options: { value: string | null; label: string; tone?: "high" | "medium" | "low" }[];
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
            href={buildHref(opt.value)}
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

function SeverityPill({ severity }: { severity: Severity }) {
  const styles =
    severity === "High"
      ? { bg: "rgba(239,68,68,0.12)", fg: "#fca5a5" }
      : severity === "Medium"
        ? { bg: "rgba(245,158,11,0.12)", fg: "#fbbf24" }
        : { bg: "rgba(148,163,184,0.12)", fg: "#cbd5e1" };
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: styles.bg, color: styles.fg }}
    >
      {severity}
    </span>
  );
}
