import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle } from "@/components/card";

export const dynamic = "force-dynamic";

/**
 * Admin · one member's account, read-only. Everything here rides the
 * platform-admin SELECT policies from migrations 0003/0004/0021 — the
 * admin sees the member's real rows, and the inspection links open the
 * member's ACTUAL inspection pages (also admin-readable, photos included
 * via the 0021 storage policy). Writes stay RLS-blocked: support access
 * never acts AS the member, so signatures/findings remain attributable
 * to the real inspector.
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

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, profile } = await requireAdmin();
  const supabase = await createClient();

  const { data: dirRows } = await supabase.rpc("admin_user_directory");
  const member = ((dirRows as DirectoryRow[]) ?? []).find(
    (r) => r.user_id === id,
  );
  if (!member) notFound();

  const [inspectionsRes, callsRes, membershipsRes] = await Promise.all([
    supabase
      .from("inspections")
      .select("id, facility_name, location, status, created_at, updated_at")
      .eq("created_by", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("ai_calls")
      .select(
        "id, model, provider, cost_usd, duration_ms, status, error_message, created_at",
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("organization_members")
      .select("role, created_at, organizations(name)")
      .eq("user_id", id),
  ]);

  const inspections = inspectionsRes.data ?? [];
  const calls = callsRes.data ?? [];
  const memberships = membershipsRes.data ?? [];

  const totalSpend = calls.reduce((s, c) => s + Number(c.cost_usd ?? 0), 0);
  const errorCalls = calls.filter((c) => c.status === "error");

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
          <Link
            href="/admin/users"
            className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            ← Members directory
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            {member.full_name ?? member.email ?? "Member"}
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Read-only support view. Inspection links below open their real
            pages — you see exactly what they see.
          </p>
        </div>

        {/* Profile summary */}
        <Card>
          <CardTitle>Account</CardTitle>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {(
              [
                ["Email", member.email ?? "—"],
                ["Organization", member.organization ?? "—"],
                ["Title", member.title ?? "—"],
                ["Joined", fmt(member.created_at)],
                ["Last sign-in", fmt(member.last_sign_in_at)],
                [
                  "Teams",
                  memberships.length
                    ? memberships
                        .map((m) => {
                          const org = m.organizations as unknown as {
                            name: string;
                          } | null;
                          return `${org?.name ?? "?"} (${m.role})`;
                        })
                        .join(", ")
                    : "None",
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-[var(--fg-muted)]">{label}</dt>
                <dd className="text-right text-[var(--fg)]">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Inspections */}
        <Card padded={false} className="overflow-x-auto">
          <div className="px-5 pt-5 sm:px-6">
            <CardTitle>
              Inspections ({inspections.length}
              {inspections.length === 100 ? "+" : ""})
            </CardTitle>
          </div>
          <table className="mt-3 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-[0.12em] text-[var(--fg-muted)]">
                <th className="px-5 py-2 font-medium sm:px-6">Facility</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {inspections.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-[var(--border)] last:border-b-0"
                >
                  <td className="px-5 py-2.5 sm:px-6">
                    <div className="font-medium text-[var(--fg)]">
                      {i.facility_name || "Untitled"}
                    </div>
                    {i.location ? (
                      <div className="text-xs text-[var(--fg-muted)]">
                        {i.location}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--fg-muted)]">
                    {i.status}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--fg-muted)]">
                    {fmt(i.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/inspections/${i.id}`}
                      className="text-sm font-medium text-[var(--accent)] hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
              {inspections.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-6 text-center text-sm text-[var(--fg-muted)] sm:px-6"
                  >
                    No inspections yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>

        {/* AI activity — the "where are the issues" panel */}
        <Card>
          <CardTitle>
            Recent AI activity · ${totalSpend.toFixed(2)} across last{" "}
            {calls.length} calls
            {errorCalls.length > 0 ? (
              <span className="ml-2 text-sm font-medium text-red-700">
                {errorCalls.length} failed
              </span>
            ) : null}
          </CardTitle>
          <div className="mt-3 flex flex-col gap-2">
            {calls.map((c) => (
              <div
                key={c.id}
                className={`rounded border px-3 py-2 text-sm ${
                  c.status === "error"
                    ? "border-red-300 bg-red-50"
                    : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--fg)]">
                    {c.model}
                  </span>
                  <span className="text-xs text-[var(--fg-muted)]">
                    {fmt(c.created_at)} · ${Number(c.cost_usd).toFixed(4)} ·{" "}
                    {c.duration_ms}ms
                  </span>
                </div>
                {c.status === "error" ? (
                  <p className="mt-1 text-xs text-red-700">
                    {c.error_message ?? "Unknown error"}
                  </p>
                ) : null}
              </div>
            ))}
            {calls.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">
                No AI calls yet.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
