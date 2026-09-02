import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";

export const dynamic = "force-dynamic";

/**
 * Admin · Members directory. Every account on the platform with activity
 * counts, linking into the per-user oversight page. Data comes from the
 * admin_user_directory() RPC (migration 0021) — auth emails + last
 * sign-in aren't client-readable any other way.
 */

type DirectoryRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  organization: string | null;
  title: string | null;
  is_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AdminUsersPage() {
  const { user, profile } = await requireAdmin();
  const supabase = await createClient();

  const { data: rows, error: dirError } = await supabase.rpc(
    "admin_user_directory",
  );
  const users: DirectoryRow[] = (rows as DirectoryRow[]) ?? [];

  // Activity counts (admin-readable since 0004/0003). Aggregated in JS —
  // fine at support-tool scale, no extra RPCs to maintain.
  const [inspectionsRes, callsRes] = await Promise.all([
    supabase.from("inspections").select("created_by, status").limit(5000),
    supabase.from("ai_calls").select("user_id, cost_usd, status").limit(10000),
  ]);

  const inspCount = new Map<string, number>();
  for (const i of inspectionsRes.data ?? []) {
    const k = i.created_by as string;
    inspCount.set(k, (inspCount.get(k) ?? 0) + 1);
  }
  const spend = new Map<string, number>();
  const aiErrors = new Map<string, number>();
  for (const c of callsRes.data ?? []) {
    const k = c.user_id as string;
    spend.set(k, (spend.get(k) ?? 0) + Number(c.cost_usd ?? 0));
    if (c.status === "error") aiErrors.set(k, (aiErrors.get(k) ?? 0) + 1);
  }

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--accent)]">
              Admin · Members
            </span>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Members directory
            </h1>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              {users.length} account{users.length === 1 ? "" : "s"}. Open one
              to see their inspections, findings, and AI activity — read-only
              support access.
            </p>
          </div>
          <Link href="/admin/stats" className="cl-btn-outline">
            AI cost dashboard
          </Link>
        </div>

        {dirError ? (
          <Card>
            <p className="text-sm text-red-700">
              Couldn&apos;t load the directory: {dirError.message}. Has
              migration 0021_admin_oversight.sql been applied?
            </p>
          </Card>
        ) : (
          <Card padded={false} className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Organization</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Last sign-in</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Inspections
                  </th>
                  <th className="px-4 py-3 text-right font-medium">AI spend</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const errs = aiErrors.get(u.user_id) ?? 0;
                  return (
                    <tr
                      key={u.user_id}
                      className="border-b border-[var(--border)] last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--fg)]">
                          {u.full_name ?? "(no profile yet)"}
                          {u.is_admin ? (
                            <span className="ml-2 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                              Admin
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-[var(--fg-muted)]">
                          {u.email ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--fg-muted)]">
                        {u.organization ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--fg-muted)]">
                        {fmtDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3 text-[var(--fg-muted)]">
                        {fmtDate(u.last_sign_in_at)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--fg)]">
                        {inspCount.get(u.user_id) ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--fg)]">
                        ${(spend.get(u.user_id) ?? 0).toFixed(2)}
                        {errs > 0 ? (
                          <span className="ml-1.5 text-xs font-medium text-red-700">
                            {errs} err
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/users/${u.user_id}`}
                          className="text-sm font-medium text-[var(--accent)] hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]"
                    >
                      No accounts yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
