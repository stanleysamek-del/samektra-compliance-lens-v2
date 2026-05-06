import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";

export default async function HistoryPage() {
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

  // Pull recent inspections (table exists; inspection-creation flow ships next).
  const { data: inspections } = await supabase
    .from("inspections")
    .select("id, facility_name, location, status, date_of_inspection, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              History
            </h1>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              Past inspections you&apos;ve created.
            </p>
          </div>
          <Link href="/inspections/new" className="cl-btn-accent">
            New
          </Link>
        </div>

        {inspections && inspections.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {inspections.map((row) => (
              <li key={row.id}>
                <Card padded={false}>
                  <Link
                    href={`/inspections/${row.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--fg)]">
                        {row.facility_name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--fg-muted)]">
                        {row.location ?? "—"} ·{" "}
                        {row.date_of_inspection ?? "no date"}
                      </p>
                    </div>
                    <StatusPill status={row.status} />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card>
            <p className="text-center text-sm font-medium text-[var(--fg-muted)]">
              No inspections yet
            </p>
            <p className="mt-1.5 text-center text-xs text-[var(--fg-subtle)]">
              When you finish your first inspection, it&apos;ll show up here.
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    in_progress: {
      label: "In progress",
      bg: "rgba(245,158,11,0.12)",
      fg: "#fbbf24",
    },
    completed: {
      label: "Completed",
      bg: "rgba(34,197,94,0.12)",
      fg: "#86efac",
    },
    archived: {
      label: "Archived",
      bg: "rgba(148,163,184,0.12)",
      fg: "#cbd5e1",
    },
  };
  const m = map[status] ?? map.archived;
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}
