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

export default async function AdminStatsPage() {
  const { user, profile } = await requireAdmin();
  const supabase = await createClient();

  // Pull last 1000 calls (plenty for early-stage analytics).
  const { data: callsRaw } = await supabase
    .from("ai_calls")
    .select(
      "id, user_id, inspection_id, photo_id, provider, model, input_tokens, output_tokens, cost_usd, duration_ms, status, error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const calls = (callsRaw ?? []) as AICall[];

  // Build user lookup so the per-user breakdown can show names.
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

        {/* ---- By provider ---- */}
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

        {/* ---- By model ---- */}
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            By model
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

        {/* ---- Recent calls ---- */}
        <Card padded={false}>
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Recent calls
            </h2>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {calls.slice(0, 25).map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
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
                    <span className="text-[var(--fg)]">{c.provider}</span>
                    <span className="text-[var(--fg-subtle)]">·</span>
                    <span className="truncate text-[var(--fg-muted)]">
                      {usersById[c.user_id] ?? c.user_id.slice(0, 8)}
                    </span>
                  </div>
                  {c.error_message ? (
                    <p className="mt-0.5 truncate text-xs text-[#fca5a5]">
                      {c.error_message}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
                      {formatTokens(c.input_tokens)} in ·{" "}
                      {formatTokens(c.output_tokens)} out · {(c.duration_ms / 1000).toFixed(1)}s
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm tabular-nums text-[var(--fg)]">
                    ${c.cost_usd.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-[var(--fg-subtle)]">
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
            {calls.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[var(--fg-muted)]">
                No calls yet. Run an inspection to populate this dashboard.
              </p>
            ) : null}
          </div>
        </Card>

        <p className="px-1 text-center text-[11px] text-[var(--fg-subtle)] sm:text-left">
          Pricing: Claude Sonnet 4.5 $3/M in · $15/M out · GPT-4o $2.50/M in ·
          $10/M out. Costs computed at call time.{" "}
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
