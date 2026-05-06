import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";

export const dynamic = "force-dynamic";

type AICall = {
  id: string;
  user_id: string;
  inspection_id: string | null;
  photo_id: string | null;
  provider: "anthropic" | "openai";
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  status: "success" | "error";
  error_message: string | null;
  created_at: string;
};

type CompactFinding = {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
};

type PhotoMeta = {
  inspectionId: string | null;
  facility: string | null;
  location: string | null;
};

export default async function AdminStatsPage() {
  const { user, profile } = await requireAdmin();
  const supabase = await createClient();

  const { data: callsRaw } = await supabase
    .from("ai_calls")
    .select(
      "id, user_id, inspection_id, photo_id, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, status, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const calls = (callsRaw ?? []) as AICall[];

  // Lookups so the breakdowns can show readable names.
  const userIds = Array.from(new Set(calls.map((c) => c.user_id)));
  const usersById: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);
    (profiles ?? []).forEach((p) => {
      usersById[p.user_id] = p.full_name ?? p.user_id.slice(0, 8);
    });
  }

  // Photo + inspection metadata for each call (for the expandable detail row).
  const photoIds = Array.from(
    new Set(calls.map((c) => c.photo_id).filter((id): id is string => !!id)),
  );
  const photoMetaById: Record<string, PhotoMeta> = {};
  const findingsByPhoto: Record<string, CompactFinding[]> = {};

  if (photoIds.length > 0) {
    const { data: photos } = await supabase
      .from("photos")
      .select("id, inspection_id, photo_location")
      .in("id", photoIds);

    const inspectionIds = Array.from(
      new Set(
        (photos ?? [])
          .map((p) => p.inspection_id as string | null)
          .filter((id): id is string => !!id),
      ),
    );
    const facilityById: Record<string, string> = {};
    if (inspectionIds.length > 0) {
      const { data: inspections } = await supabase
        .from("inspections")
        .select("id, facility_name")
        .in("id", inspectionIds);
      (inspections ?? []).forEach((i) => {
        facilityById[i.id as string] = (i.facility_name as string) ?? "—";
      });
    }
    (photos ?? []).forEach((p) => {
      const inspId = p.inspection_id as string | null;
      photoMetaById[p.id as string] = {
        inspectionId: inspId,
        facility: inspId ? facilityById[inspId] ?? null : null,
        location: (p.photo_location as string | null) ?? null,
      };
    });

    const { data: findings } = await supabase
      .from("findings")
      .select("id, photo_id, title, severity")
      .in("photo_id", photoIds);

    (findings ?? []).forEach((f) => {
      const pid = f.photo_id as string;
      const list = (findingsByPhoto[pid] ??= []);
      list.push({
        id: f.id as string,
        title: (f.title as string) ?? "Untitled",
        severity: f.severity as "Low" | "Medium" | "High",
      });
    });
    // Sort each photo's findings High → Medium → Low.
    const order = { High: 0, Medium: 1, Low: 2 } as const;
    Object.values(findingsByPhoto).forEach((arr) =>
      arr.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3)),
    );
  }

  // ---- Aggregations ----
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const totals = sumWindow(calls, 0);
  const today = sumWindow(calls, now - day);
  const week = sumWindow(calls, now - 7 * day);
  const month = sumWindow(calls, now - 30 * day);

  const byProvider = aggregate(calls, (c) => c.provider);
  const byUser = aggregate(calls, (c) => c.user_id);
  const byModel = aggregate(calls, (c) => c.model);
  const byProviderModel = aggregate(
    calls,
    (c) => `${c.provider} · ${c.model}`,
  );

  const errors = calls.filter((c) => c.status === "error");
  const errorRate = calls.length > 0 ? errors.length / calls.length : 0;
  const avgLatencyMs =
    calls.length > 0
      ? calls.reduce((s, c) => s + c.duration_ms, 0) / calls.length
      : 0;

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-5">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--accent)]">
            Admin · Cost dashboard
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            AI usage &amp; spend
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Every Claude/OpenAI call across all users. Last {calls.length} calls
            shown.
          </p>
        </div>

        {/* ---- Total cards ---- */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SpendCard label="Today" value={today.cost} count={today.count} />
          <SpendCard label="Last 7 days" value={week.cost} count={week.count} />
          <SpendCard label="Last 30 days" value={month.cost} count={month.count} />
          <SpendCard label="All time" value={totals.cost} count={totals.count} />
        </section>

        {/* ---- Health metrics ---- */}
        <section className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg latency"
            value={`${(avgLatencyMs / 1000).toFixed(1)}s`}
          />
          <MetricCard
            label="Error rate"
            value={`${(errorRate * 100).toFixed(1)}%`}
            tone={errorRate > 0.05 ? "warning" : "default"}
          />
          <MetricCard
            label="Errors (recent)"
            value={String(errors.length)}
            tone={errors.length > 0 ? "warning" : "default"}
          />
        </section>

        {/* ---- By provider · model (most precise breakdown) ---- */}
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            By model
          </h2>
          <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">
            Provider × model — the row that tells you exactly which model is
            burning your budget.
          </p>
          <BreakdownTable
            rows={byProviderModel.map(
              ({ key, cost, count, inputTokens, outputTokens }) => ({
                label: prettyProviderModel(key),
                cost,
                count,
                extra: `${formatTokens(inputTokens)} in · ${formatTokens(outputTokens)} out`,
              }),
            )}
            emptyText="No calls yet."
          />
        </Card>

        {/* ---- By provider (rolled up) ---- */}
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            By provider
          </h2>
          <BreakdownTable
            rows={byProvider.map(({ key, cost, count, inputTokens, outputTokens }) => ({
              label: key,
              cost,
              count,
              extra: `${formatTokens(inputTokens)} in · ${formatTokens(outputTokens)} out`,
            }))}
            emptyText="No calls yet."
          />
        </Card>

        {/* ---- By model only (no provider prefix) ---- */}
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            By model (raw model id)
          </h2>
          <BreakdownTable
            rows={byModel.map(({ key, cost, count }) => ({
              label: key,
              cost,
              count,
            }))}
            emptyText="No calls yet."
          />
        </Card>

        {/* ---- By user ---- */}
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            By user
          </h2>
          <BreakdownTable
            rows={byUser.map(({ key, cost, count }) => ({
              label: usersById[key] ?? key.slice(0, 8),
              cost,
              count,
            }))}
            emptyText="No calls yet."
          />
        </Card>

        {/* ---- Recent calls — each row is expandable to show what was detected ---- */}
        <Card padded={false}>
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Recent calls
            </h2>
            <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">
              Click a row to expand and see what the AI detected on that photo.
              Findings reflect the photo&apos;s current state — if a photo was
              re-analyzed later, only the latest run&apos;s findings remain.
            </p>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {calls.slice(0, 50).map((c) => {
              const meta = c.photo_id ? photoMetaById[c.photo_id] : null;
              const findings = c.photo_id
                ? findingsByPhoto[c.photo_id] ?? []
                : [];
              return (
                <li key={c.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer flex-col gap-1 px-5 py-3 text-sm transition hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                            style={
                              c.status === "success"
                                ? { background: "rgba(34,197,94,0.12)", color: "#86efac" }
                                : { background: "rgba(239,68,68,0.12)", color: "#fca5a5" }
                            }
                          >
                            {c.status}
                          </span>
                          <span className="rounded-full border border-[var(--border-strong)] bg-[var(--bg-input)] px-2 py-0.5 text-[10px] font-medium text-[var(--fg)]">
                            {prettyModel(c.provider, c.model)}
                          </span>
                          <span className="text-[var(--fg-subtle)]">·</span>
                          <span className="truncate text-[var(--fg-muted)]">
                            {usersById[c.user_id] ?? c.user_id.slice(0, 8)}
                          </span>
                          {meta?.facility ? (
                            <>
                              <span className="text-[var(--fg-subtle)]">·</span>
                              <span className="truncate text-[var(--fg-muted)]">
                                {meta.facility}
                                {meta.location ? ` / ${meta.location}` : ""}
                              </span>
                            </>
                          ) : null}
                          <span className="ml-auto text-[10px] text-[var(--fg-subtle)] transition group-open:rotate-180">
                            ▾
                          </span>
                        </div>
                        {c.error_message ? (
                          <p className="mt-0.5 truncate text-xs text-[#fca5a5]">
                            {c.error_message}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
                            {formatTokens(c.input_tokens)} in ·{" "}
                            {formatTokens(c.output_tokens)} out ·{" "}
                            {(c.duration_ms / 1000).toFixed(1)}s ·{" "}
                            {findings.length > 0
                              ? `${findings.length} finding${findings.length === 1 ? "" : "s"} on photo`
                              : c.photo_id
                                ? "no findings on photo"
                                : "no photo linked"}
                          </p>
                        )}
                      </div>
                      <div className="text-right sm:ml-4">
                        <p className="font-mono text-sm tabular-nums text-[var(--fg)]">
                          ${c.cost_usd.toFixed(4)}
                        </p>
                        <p className="text-[10px] text-[var(--fg-subtle)]">
                          {new Date(c.created_at).toLocaleString()}
                        </p>
                      </div>
                    </summary>

                    {/* Expanded detail panel */}
                    <div className="border-t border-[var(--border)] bg-[var(--bg-input)]/40 px-5 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                            Call details
                          </p>
                          <dl className="mt-1.5 space-y-0.5 text-xs text-[var(--fg-muted)]">
                            <div className="flex gap-2">
                              <dt className="w-24 shrink-0 text-[var(--fg-subtle)]">Model</dt>
                              <dd className="text-[var(--fg)]">{c.model}</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="w-24 shrink-0 text-[var(--fg-subtle)]">Input</dt>
                              <dd>{c.input_tokens.toLocaleString()} tokens</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="w-24 shrink-0 text-[var(--fg-subtle)]">Output</dt>
                              <dd>{c.output_tokens.toLocaleString()} tokens</dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="w-24 shrink-0 text-[var(--fg-subtle)]">Cost</dt>
                              <dd className="font-mono tabular-nums">
                                ${c.cost_usd.toFixed(4)}
                              </dd>
                            </div>
                            <div className="flex gap-2">
                              <dt className="w-24 shrink-0 text-[var(--fg-subtle)]">Latency</dt>
                              <dd>{(c.duration_ms / 1000).toFixed(2)}s</dd>
                            </div>
                            {meta?.inspectionId && c.photo_id ? (
                              <div className="flex gap-2 pt-1">
                                <dt className="w-24 shrink-0 text-[var(--fg-subtle)]">Photo</dt>
                                <dd>
                                  <Link
                                    href={`/inspections/${meta.inspectionId}/photos/${c.photo_id}`}
                                    className="text-[var(--primary)] hover:text-[var(--primary-hover)]"
                                  >
                                    Open photo →
                                  </Link>
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                        </div>

                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                            Detected on this photo
                          </p>
                          {findings.length === 0 ? (
                            <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
                              {c.photo_id
                                ? "No findings on this photo (either AI returned none, or the photo was deleted/re-analyzed)."
                                : "Call had no associated photo."}
                            </p>
                          ) : (
                            <ul className="mt-1.5 space-y-1">
                              {findings.map((f, idx) => (
                                <li
                                  key={f.id}
                                  className="flex items-start gap-2 text-xs"
                                >
                                  <SeverityDot severity={f.severity} />
                                  <span className="text-[var(--fg-subtle)]">
                                    #{idx + 1}
                                  </span>
                                  <span className="flex-1 text-[var(--fg)]">
                                    {f.title}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
            {calls.length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-[var(--fg-muted)]">
                No calls yet. Run an inspection to populate this dashboard.
              </li>
            ) : null}
          </ul>
        </Card>

        <p className="px-1 text-center text-[11px] text-[var(--fg-subtle)] sm:text-left">
          Pricing: Claude Haiku 4.5 $1/M in · $5/M out · Claude Sonnet 4.5 $3/M
          in · $15/M out · GPT-4o $2.50/M in · $10/M out. Costs computed at
          call time.{" "}
          <Link
            href="/inspections"
            className="text-[var(--primary)] hover:text-[var(--primary-hover)]"
          >
            Back to inspections
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

/* --------------------------------------------------------------------- */

type Aggregate = {
  key: string;
  cost: number;
  count: number;
  inputTokens: number;
  outputTokens: number;
};

function aggregate(calls: AICall[], keyFn: (c: AICall) => string): Aggregate[] {
  const map = new Map<string, Aggregate>();
  for (const c of calls) {
    const key = keyFn(c);
    const a = map.get(key) ?? {
      key,
      cost: 0,
      count: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    a.cost += Number(c.cost_usd);
    a.count += 1;
    a.inputTokens += c.input_tokens;
    a.outputTokens += c.output_tokens;
    map.set(key, a);
  }
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

function sumWindow(calls: AICall[], sinceMs: number) {
  let cost = 0;
  let count = 0;
  for (const c of calls) {
    const t = new Date(c.created_at).getTime();
    if (t >= sinceMs) {
      cost += Number(c.cost_usd);
      count += 1;
    }
  }
  return { cost, count };
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Map raw model ids to human-readable names for the UI. */
function prettyModel(provider: string, model: string): string {
  if (model.includes("haiku-4-5")) return "Claude Haiku 4.5";
  if (model.includes("sonnet-4-5")) return "Claude Sonnet 4.5";
  if (model.includes("opus")) return "Claude Opus";
  if (model.includes("gpt-4o")) return "GPT-4o";
  return `${provider} · ${model}`;
}

function prettyProviderModel(key: string): string {
  // key is "<provider> · <model>" — produce "<Provider> · <PrettyModel>".
  const parts = key.split(" · ");
  if (parts.length !== 2) return key;
  const [provider, model] = parts;
  return `${provider} · ${prettyModel(provider, model)}`;
}

function SpendCard({
  label,
  value,
  count,
}: {
  label: string;
  value: number;
  count: number;
}) {
  return (
    <div className="cl-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--fg)]">
        ${value.toFixed(2)}
      </p>
      <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
        {count} call{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="cl-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
        {label}
      </p>
      <p
        className="mt-1 text-xl font-semibold tracking-tight"
        style={{ color: tone === "warning" ? "var(--warning)" : "var(--fg)" }}
      >
        {value}
      </p>
    </div>
  );
}

function SeverityDot({ severity }: { severity: "Low" | "Medium" | "High" }) {
  const map = {
    High: "#f87171",
    Medium: "#f87171",
    Low: "#34d399",
  } as const;
  return (
    <span
      className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: map[severity] }}
      title={severity}
    />
  );
}

function BreakdownTable({
  rows,
  emptyText,
}: {
  rows: Array<{ label: string; cost: number; count: number; extra?: string }>;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-3 text-sm text-[var(--fg-muted)]">{emptyText}</p>
    );
  }
  const total = rows.reduce((s, r) => s + r.cost, 0) || 1;
  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {rows.map((r) => {
        const pct = (r.cost / total) * 100;
        return (
          <li key={r.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-[var(--fg)]">{r.label}</span>
              <span className="font-mono tabular-nums text-[var(--fg)]">
                ${r.cost.toFixed(4)}
                <span className="ml-2 text-xs text-[var(--fg-subtle)]">
                  ({r.count})
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-input)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: "var(--primary)",
                }}
              />
            </div>
            {r.extra ? (
              <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">{r.extra}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
