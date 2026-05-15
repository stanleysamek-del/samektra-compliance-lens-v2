import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { InspectionRowMenu } from "@/components/inspection-row-menu";
import { FoldersManager, type FolderRow } from "@/components/folders-manager";
import { InspectionMoveMenu } from "@/components/inspection-move-menu";
import { getCurrentOrg } from "@/lib/org/current";

type Sort = "newest" | "oldest" | "name" | "facility-date";
type StatusFilter = "all" | "in_progress" | "completed" | "archived";

type SearchParams = {
  q?: string;
  sort?: Sort;
  status?: StatusFilter;
  /** Set by deleteInspection — surfaces a "Deleted X" banner. */
  deleted?: string;
  /** Generic error message bubbled up by deleteInspection on failure. */
  error?: string;
};

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const sort: Sort = (params.sort as Sort) ?? "newest";
  const status: StatusFilter = (params.status as StatusFilter) ?? "all";
  const deletedFacility = (params.deleted ?? "").trim();
  const errorMessage = (params.error ?? "").trim();

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

  // Look up team context. When in an org, the page renders folders.
  const currentOrg = await getCurrentOrg();

  // Build the query — also pull folder_id so we can group inspections.
  let query = supabase
    .from("inspections")
    .select(
      "id, facility_name, facility_address, location, status, date_of_inspection, created_at, updated_at, folder_id, organization_id",
    );

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (q) {
    // ilike across facility_name, location, facility_address.
    // Wraps in % so it's a substring match.
    const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(
      `facility_name.ilike.${pattern},location.ilike.${pattern},facility_address.ilike.${pattern}`,
    );
  }

  switch (sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "name":
      query = query.order("facility_name", { ascending: true });
      break;
    case "facility-date":
      query = query
        .order("date_of_inspection", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
    case "newest":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  const { data: inspections } = await query.limit(200);
  const inspectionList = inspections ?? [];

  // Per-inspection findings counts (total + High) so each row shows a
  // findings badge like SC's "Score" column. One IN query, in-memory aggregation.
  const findingsCountByInspection = new Map<
    string,
    { total: number; high: number }
  >();
  if (inspectionList.length > 0) {
    const ids = inspectionList.map((i) => i.id);
    const { data: fRows } = await supabase
      .from("findings")
      .select("inspection_id, severity")
      .in("inspection_id", ids);
    for (const f of fRows ?? []) {
      const bucket = findingsCountByInspection.get(f.inspection_id as string) ?? {
        total: 0,
        high: 0,
      };
      bucket.total += 1;
      if (f.severity === "High") bucket.high += 1;
      findingsCountByInspection.set(f.inspection_id as string, bucket);
    }
  }

  // Fetch folders for the current org so we can render the manager
  // + group inspections by folder. Personal workspace has no folders.
  let folders: Array<{
    id: string;
    name: string;
    sort_order: number;
    color: string | null;
  }> = [];
  if (currentOrg) {
    const { data: folderRows } = await supabase
      .from("inspection_folders")
      .select("id, name, sort_order, color")
      .eq("organization_id", currentOrg.id)
      .order("sort_order", { ascending: true });
    folders = (folderRows ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      sort_order: f.sort_order,
      color: (f.color as string | null) ?? null,
    }));
  }

  const inspectionCountByFolder = new Map<string, number>();
  for (const row of inspectionList) {
    if (row.folder_id) {
      inspectionCountByFolder.set(
        row.folder_id,
        (inspectionCountByFolder.get(row.folder_id) ?? 0) + 1,
      );
    }
  }
  const foldersWithCounts: FolderRow[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    sort_order: f.sort_order,
    color: f.color,
    inspectionCount: inspectionCountByFolder.get(f.id) ?? 0,
  }));
  const folderOptions = folders.map((f) => ({ id: f.id, name: f.name }));

  // Counts for the filter pills (run once with no filter so the counts always
  // reflect the user's full library, not the current view).
  const { data: allRows } = await supabase
    .from("inspections")
    .select("status");
  const totals = (allRows ?? []).reduce(
    (acc, r) => {
      const s = (r.status as keyof typeof acc) ?? "all";
      acc.all += 1;
      if (s in acc) acc[s] += 1;
      return acc;
    },
    { all: 0, in_progress: 0, completed: 0, archived: 0 },
  );

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-5">
        {deletedFacility ? (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "rgba(34,197,94,0.3)",
              background: "rgba(34,197,94,0.08)",
              color: "#86efac",
            }}
          >
            <span>
              Deleted <strong className="font-semibold">{deletedFacility}</strong>{" "}
              and all of its photos and findings.
            </span>
            <Link
              href="/inspections/history"
              className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
            >
              Dismiss
            </Link>
          </div>
        ) : null}
        {errorMessage ? (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.08)",
              color: "#fca5a5",
            }}
          >
            <span>{errorMessage}</span>
            <Link
              href="/inspections/history"
              className="shrink-0 text-xs font-medium underline-offset-2 hover:underline"
            >
              Dismiss
            </Link>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Inspections
            </h1>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              {totals.all} total · {totals.in_progress} in progress
            </p>
          </div>
          <Link href="/inspections/new" className="cl-btn-accent">
            New
          </Link>
        </div>

        {/* Search + Sort */}
        <Card padded={false}>
          <form action="/inspections/history" method="get" className="px-4 py-3">
            <input type="hidden" name="status" value={status} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </span>
                <input
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="Search by facility, address, or location"
                  className="cl-input pl-9"
                />
              </div>
              <select
                name="sort"
                defaultValue={sort}
                className="cl-input sm:w-44"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">A → Z (facility)</option>
                <option value="facility-date">Inspection date</option>
              </select>
              <button type="submit" className="cl-btn-primary sm:w-auto">
                Apply
              </button>
            </div>
          </form>

          {/* Status filter pills */}
          <div className="flex gap-2 overflow-x-auto border-t border-[var(--border)] px-4 py-3">
            <FilterPill
              label="All"
              count={totals.all}
              active={status === "all"}
              q={q}
              sort={sort}
              status="all"
            />
            <FilterPill
              label="In progress"
              count={totals.in_progress}
              active={status === "in_progress"}
              q={q}
              sort={sort}
              status="in_progress"
              tone="warning"
            />
            <FilterPill
              label="Completed"
              count={totals.completed}
              active={status === "completed"}
              q={q}
              sort={sort}
              status="completed"
              tone="success"
            />
            <FilterPill
              label="Archived"
              count={totals.archived}
              active={status === "archived"}
              q={q}
              sort={sort}
              status="archived"
            />
          </div>
        </Card>

        {/* Active search summary */}
        {q ? (
          <p className="px-1 text-xs text-[var(--fg-muted)]">
            Filtering by{" "}
            <span className="font-medium text-[var(--fg)]">
              &ldquo;{q}&rdquo;
            </span>
            {" · "}
            <Link
              href={`/inspections/history?status=${status}&sort=${sort}`}
              className="text-[var(--primary)] hover:text-[var(--primary-hover)]"
            >
              clear search
            </Link>
          </p>
        ) : null}

        {/* Folder manager — only shown when in a team workspace. Personal
            workspaces don't have folders since they can't be shared. */}
        {currentOrg ? (
          <FoldersManager
            organizationId={currentOrg.id}
            folders={foldersWithCounts}
          />
        ) : null}

        {/* Results */}
        {inspectionList.length > 0 ? (
          currentOrg ? (
            // Team workspace — group inspections by folder.
            <>
              {(() => {
                const grouped: Array<{
                  key: string;
                  label: string | null;
                  rows: typeof inspectionList;
                }> = [];

                const unfiled = inspectionList.filter((r) => !r.folder_id);
                if (unfiled.length > 0 || folders.length === 0) {
                  grouped.push({
                    key: "unfiled",
                    label: folders.length > 0 ? "Unfiled" : null,
                    rows: unfiled,
                  });
                }
                for (const f of folders) {
                  grouped.push({
                    key: f.id,
                    label: f.name,
                    rows: inspectionList.filter((r) => r.folder_id === f.id),
                  });
                }

                return grouped.map((g) => {
                  const folderColor =
                    g.key !== "unfiled"
                      ? folders.find((f) => f.id === g.key)?.color ?? null
                      : null;
                  return (
                  <div key={g.key} className="flex flex-col gap-2">
                    {g.label ? (
                      <h3
                        className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.14em]"
                        style={{ color: folderColor ?? "var(--accent)" }}
                      >
                        {folderColor ? (
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: folderColor }}
                          />
                        ) : null}
                        {g.label}
                        <span className="ml-1.5 font-medium text-[var(--fg-subtle)]">
                          · {g.rows.length}{" "}
                          {g.rows.length === 1 ? "inspection" : "inspections"}
                        </span>
                      </h3>
                    ) : null}
                    {g.rows.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-[11px] text-[var(--fg-subtle)]">
                        No inspections in this group yet. Use the &ldquo;Move
                        to&rdquo; menu on any inspection below.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {g.rows.map((row) => (
                          <InspectionListRow
                            key={row.id}
                            row={row}
                            folderOptions={folderOptions}
                            counts={findingsCountByInspection.get(row.id)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                  );
                });
              })()}
            </>
          ) : (
            // Personal workspace — flat list, no folder grouping.
            <ul className="flex flex-col gap-2">
              {inspectionList.map((row) => (
                <InspectionListRow
                  key={row.id}
                  row={row}
                  folderOptions={[]}
                  counts={findingsCountByInspection.get(row.id)}
                />
              ))}
            </ul>
          )
        ) : (
          <Card>
            <p className="text-center text-sm font-medium text-[var(--fg-muted)]">
              {q || status !== "all" ? "No matching inspections" : totals.all === 0 ? "No inspections yet" : "No inspections in this view"}
            </p>
            <p className="mt-1 text-center text-xs text-[var(--fg-subtle)]">
              {q || status !== "all"
                ? "Try clearing filters or searching for something else."
                : totals.all === 0
                  ? "Tap the New button above to start your first inspection."
                  : "Tap the New button above to start a new inspection."}
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

/**
 * Single inspection card row. Extracted so we can render the same shape
 * inside folder-group lists AND in the flat personal-workspace list.
 */
function InspectionListRow({
  row,
  folderOptions,
  counts,
}: {
  row: {
    id: string;
    facility_name: string;
    facility_address: string | null;
    location: string | null;
    status: string;
    date_of_inspection: string | null;
    folder_id: string | null;
  };
  folderOptions: Array<{ id: string; name: string }>;
  counts?: { total: number; high: number };
}) {
  return (
    <li>
      <Card padded={false}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href={`/inspections/${row.id}`}
            className="flex min-w-0 flex-1 flex-col gap-1"
          >
            <div className="flex items-center gap-2">
              <p className="truncate font-medium text-[var(--fg)]">
                {row.facility_name}
              </p>
              <StatusPill status={row.status} />
            </div>
            <p className="truncate text-xs text-[var(--fg-muted)]">
              {[row.location, row.facility_address, row.date_of_inspection]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </Link>
          {/* Findings count badge — same spot SC puts the score column. */}
          {counts && counts.total > 0 ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
              title={`${counts.total} findings · ${counts.high} High`}
              style={
                counts.high > 0
                  ? { background: "rgba(239,68,68,0.12)", color: "#fca5a5" }
                  : { background: "rgba(20,184,166,0.10)", color: "#5eead4" }
              }
            >
              {counts.high > 0 ? `${counts.high}H · ` : ""}
              {counts.total}
            </span>
          ) : null}
          {folderOptions.length > 0 ? (
            <InspectionMoveMenu
              inspectionId={row.id}
              currentFolderId={row.folder_id ?? null}
              folders={folderOptions}
            />
          ) : null}
          <InspectionRowMenu
            inspectionId={row.id}
            facilityName={row.facility_name}
          />
        </div>
      </Card>
    </li>
  );
}

function FilterPill({
  label,
  count,
  active,
  q,
  sort,
  status,
  tone = "default",
}: {
  label: string;
  count: number;
  active: boolean;
  q: string;
  sort: Sort;
  status: StatusFilter;
  tone?: "default" | "warning" | "success";
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort !== "newest") params.set("sort", sort);
  if (status !== "all") params.set("status", status);
  const href = `/inspections/history${params.toString() ? `?${params}` : ""}`;

  const accent =
    tone === "success"
      ? "var(--success)"
      : tone === "warning"
        ? "var(--warning)"
        : "var(--primary)";

  return (
    <Link
      href={href}
      className={[
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "text-[var(--fg)]"
          : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
      ].join(" ")}
      style={{
        background: active ? `color-mix(in oklab, ${accent} 14%, transparent)` : "transparent",
        borderColor: active ? `color-mix(in oklab, ${accent} 35%, transparent)` : "var(--border)",
      }}
    >
      {label}
      <span className="ml-1.5 text-[var(--fg-subtle)]">{count}</span>
    </Link>
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
