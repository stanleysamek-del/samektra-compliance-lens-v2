import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org/current";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle } from "@/components/card";
import { NewFacilityToggle } from "./new-facility-toggle";

export const dynamic = "force-dynamic";

/**
 * Facilities — the buildings that outlive an inspection. Each one owns its
 * life-safety plans; every inspection linked to it can mark findings on
 * those plans. RLS scopes the list (own + team facilities).
 */
export default async function FacilitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/facilities");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const currentOrg = await getCurrentOrg();

  const [{ data: facilities, error: facErr }, plansRes, inspRes] =
    await Promise.all([
      supabase
        .from("facilities")
        .select("id, name, address, occupancy, organization_id, created_at")
        .order("name", { ascending: true }),
      supabase.from("facility_plans").select("facility_id"),
      supabase
        .from("inspections")
        .select("facility_id")
        .not("facility_id", "is", null),
    ]);

  const planCount = new Map<string, number>();
  for (const p of plansRes.data ?? []) {
    const id = p.facility_id as string;
    planCount.set(id, (planCount.get(id) ?? 0) + 1);
  }
  const inspectionCount = new Map<string, number>();
  for (const i of inspRes.data ?? []) {
    const id = i.facility_id as string;
    inspectionCount.set(id, (inspectionCount.get(id) ?? 0) + 1);
  }

  const list = facilities ?? [];

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
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Facilities
            </h1>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              A facility keeps its <strong>life-safety plans</strong> so every
              inspection there can mark exactly where a finding is. Upload the
              plan once; pin findings on every walk.
            </p>
          </div>
          <NewFacilityToggle orgName={currentOrg?.name ?? null} />
        </div>

        {facErr ? (
          <Card>
            <p className="text-sm" style={{ color: "#a8362b" }}>
              Facilities aren&apos;t available on this workspace yet.
            </p>
            <p className="mt-1 text-xs text-[var(--fg-subtle)]">
              Database migration 0025 (facilities, plans, pins) has not been
              applied. {facErr.message}
            </p>
          </Card>
        ) : list.length === 0 ? (
          <Card>
            <p className="text-sm font-medium text-[var(--fg)]">No facilities yet.</p>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              Create one above, then upload its life-safety plan. New
              inspections can pick the facility from a list so the plan is
              ready before the first photo.
            </p>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((f) => {
              const plans = planCount.get(f.id as string) ?? 0;
              const insp = inspectionCount.get(f.id as string) ?? 0;
              return (
                <li key={f.id as string}>
                  <Link href={`/facilities/${f.id}`} className="block no-underline">
                    <Card className="h-full transition hover:border-[var(--gold)]">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle>{f.name as string}</CardTitle>
                        {f.organization_id ? (
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Team
                          </span>
                        ) : null}
                      </div>
                      {f.address ? (
                        <p className="mt-1 text-sm text-[var(--fg-muted)]">{f.address as string}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-[var(--fg-subtle)]">
                        {plans} plan{plans === 1 ? "" : "s"} · {insp} inspection
                        {insp === 1 ? "" : "s"}
                        {f.occupancy ? ` · ${f.occupancy as string}` : ""}
                      </p>
                      {plans === 0 ? (
                        <p className="mt-2 text-xs font-medium" style={{ color: "#b8762a" }}>
                          No plan uploaded yet →
                        </p>
                      ) : null}
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
