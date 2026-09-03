import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle } from "@/components/card";
import { formatDate } from "@/lib/format-date";
import { PlanUploader } from "@/components/plans/plan-uploader";
import { PLAN_SELECT, type PlanRow } from "@/components/plans/types";
import { FacilityEditor } from "./facility-editor";
import { PlanCardActions } from "./plan-card-actions";

export const dynamic = "force-dynamic";

/**
 * Facility detail: header (inline edit / delete), its plans with
 * thumbnails + the uploader, and the inspections that happened here.
 */
export default async function FacilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/facilities/${id}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const userShell = {
    fullName: profile.full_name,
    organization: profile.organization,
    email: user.email ?? null,
  };

  const { data: facility, error: facErr } = await supabase
    .from("facilities")
    .select("id, name, address, occupancy, organization_id, created_by, created_at")
    .eq("id", id)
    .maybeSingle();

  if (facErr) {
    return (
      <AppShell user={userShell}>
        <Card>
          <p className="text-sm" style={{ color: "#a8362b" }}>
            Facilities aren&apos;t available on this workspace yet.
          </p>
          <p className="mt-1 text-xs text-[var(--fg-subtle)]">
            Database migration 0025 has not been applied. {facErr.message}
          </p>
        </Card>
      </AppShell>
    );
  }
  if (!facility) notFound();

  // Can this user change the facility? Mirrors can_write_facility.
  let canWrite = facility.created_by === user.id;
  if (!canWrite && facility.organization_id) {
    const { data: me } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", facility.organization_id as string)
      .eq("user_id", user.id)
      .maybeSingle();
    canWrite = me?.role === "admin" || me?.role === "member";
  }

  const [{ data: planRows }, { data: inspections }, { data: pinRows }] =
    await Promise.all([
      supabase
        .from("facility_plans")
        .select(PLAN_SELECT)
        .eq("facility_id", id)
        .order("sort", { ascending: true })
        .order("page", { ascending: true }),
      supabase
        .from("inspections")
        .select("id, facility_name, location, status, date_of_inspection, created_at")
        .eq("facility_id", id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase.from("plan_pins").select("plan_id").eq("facility_id", id),
    ]);

  const plans = (planRows ?? []) as PlanRow[];
  const pinCountByPlan = new Map<string, number>();
  for (const p of pinRows ?? []) {
    const pid = p.plan_id as string;
    pinCountByPlan.set(pid, (pinCountByPlan.get(pid) ?? 0) + 1);
  }

  const thumbs: Array<{ plan: PlanRow; url: string | null }> = [];
  for (const p of plans) {
    const { data: signed } = await supabase.storage
      .from("drawings")
      .createSignedUrl(p.storage_path, 60 * 60);
    thumbs.push({ plan: p, url: signed?.signedUrl ?? null });
  }

  return (
    <AppShell user={userShell}>
      <div className="flex flex-col gap-5">
        <div>
          <Link
            href="/facilities"
            className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          >
            ← Facilities
          </Link>
        </div>

        <Card variant="tinted-teal">
          <FacilityEditor
            facility={{
              id: facility.id as string,
              name: facility.name as string,
              address: (facility.address as string | null) ?? null,
              occupancy: (facility.occupancy as string | null) ?? null,
              isTeam: Boolean(facility.organization_id),
            }}
            canWrite={canWrite}
            planCount={plans.length}
            inspectionCount={(inspections ?? []).length}
          />
        </Card>

        {/* Plans */}
        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2 px-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Life-safety plans · {plans.length}
            </h2>
          </div>

          {thumbs.length > 0 ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {thumbs.map(({ plan, url }) => (
                <li key={plan.id}>
                  <Card padded={false} className="overflow-hidden">
                    <a
                      href={`/api/plans/${plan.id}/image`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                      title="Open full size"
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={plan.name}
                          className="aspect-[4/3] w-full object-contain"
                          style={{ background: "#ffffff" }}
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex aspect-[4/3] items-center justify-center text-xs text-[var(--fg-subtle)]">
                          Preview unavailable
                        </div>
                      )}
                    </a>
                    <div className="flex items-start justify-between gap-2 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--fg)]">
                          {plan.name}
                        </p>
                        <p className="text-xs text-[var(--fg-subtle)]">
                          {plan.width && plan.height ? `${plan.width}×${plan.height} · ` : ""}
                          {pinCountByPlan.get(plan.id) ?? 0} pin
                          {(pinCountByPlan.get(plan.id) ?? 0) === 1 ? "" : "s"}
                          {plan.source_path ? " · from PDF" : ""}
                        </p>
                      </div>
                      {canWrite ? (
                        <PlanCardActions planId={plan.id} name={plan.name} />
                      ) : null}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card>
              <p className="text-sm font-medium text-[var(--fg)]">No plans yet.</p>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                Upload the life-safety plan or an architectural drawing (PDF or
                image). Inspectors can then tap &ldquo;Place on plan&rdquo; on
                any finding to mark exactly where it is.
              </p>
            </Card>
          )}

          {canWrite ? (
            <Card>
              <CardTitle>Add a plan</CardTitle>
              <div className="mt-3">
                <PlanUploader facilityId={facility.id as string} />
              </div>
            </Card>
          ) : null}
        </section>

        {/* Inspections at this facility */}
        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2 px-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Inspections here · {(inspections ?? []).length}
            </h2>
            <Link href="/inspections/new" className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline">
              New inspection →
            </Link>
          </div>
          {inspections && inspections.length > 0 ? (
            <Card padded={false}>
              <ul className="divide-y divide-[var(--border)]">
                {inspections.map((i) => (
                  <li key={i.id as string}>
                    <Link
                      href={`/inspections/${i.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm no-underline transition hover:bg-black/[0.03]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--fg)]">
                          {(i.location as string | null) || (i.facility_name as string)}
                        </p>
                        <p className="text-xs text-[var(--fg-subtle)]">
                          {formatDate((i.date_of_inspection as string | null) ?? (i.created_at as string))}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background:
                            i.status === "completed"
                              ? "rgba(96,122,58,0.12)"
                              : "rgba(184,118,42,0.12)",
                          color: i.status === "completed" ? "#607a3a" : "#b8762a",
                        }}
                      >
                        {i.status === "completed" ? "Completed" : "In progress"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-[var(--fg-muted)]">
                No inspections linked yet. Pick this facility under
                &ldquo;Facility&rdquo; when you start one.
              </p>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
