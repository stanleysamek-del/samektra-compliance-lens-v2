import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { updateInspection } from "../actions";

export default async function EditInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

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

  const { data: inspection } = await supabase
    .from("inspections")
    .select(
      "id, facility_name, facility_address, location, inspector_name, manager_assigned, manager_assigned_email, date_of_inspection, date_assigned, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (!inspection) notFound();

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
            href={`/inspections/${id}`}
            className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          >
            ← Back to inspection
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            Edit inspection
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Update facility, location, inspector, or schedule. Photos and
            findings are kept.
          </p>
        </div>

        <Card>
          <form action={updateInspection} className="flex flex-col gap-4">
            <input type="hidden" name="inspection_id" value={inspection.id} />

            <div className="flex flex-col">
              <label htmlFor="facility_name" className="cl-label">
                Facility name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="facility_name"
                name="facility_name"
                type="text"
                required
                defaultValue={inspection.facility_name ?? ""}
                className="cl-input"
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="facility_address" className="cl-label">
                Facility address
              </label>
              <input
                id="facility_address"
                name="facility_address"
                type="text"
                defaultValue={inspection.facility_address ?? ""}
                className="cl-input"
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="location" className="cl-label">
                Location
              </label>
              <input
                id="location"
                name="location"
                type="text"
                defaultValue={inspection.location ?? ""}
                className="cl-input"
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="inspector_name" className="cl-label">
                Inspector name
              </label>
              <input
                id="inspector_name"
                name="inspector_name"
                type="text"
                defaultValue={inspection.inspector_name ?? ""}
                className="cl-input"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label htmlFor="manager_assigned" className="cl-label">
                  Assigned manager
                </label>
                <input
                  id="manager_assigned"
                  name="manager_assigned"
                  type="text"
                  defaultValue={inspection.manager_assigned ?? ""}
                  className="cl-input"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="manager_assigned_email" className="cl-label">
                  Manager email
                </label>
                <input
                  id="manager_assigned_email"
                  name="manager_assigned_email"
                  type="email"
                  defaultValue={inspection.manager_assigned_email ?? ""}
                  className="cl-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label htmlFor="date_of_inspection" className="cl-label">
                  Date of inspection
                </label>
                <input
                  id="date_of_inspection"
                  name="date_of_inspection"
                  type="date"
                  defaultValue={inspection.date_of_inspection ?? ""}
                  className="cl-input"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="date_assigned" className="cl-label">
                  Date assigned (manager)
                </label>
                <input
                  id="date_assigned"
                  name="date_assigned"
                  type="date"
                  defaultValue={inspection.date_assigned ?? ""}
                  className="cl-input"
                />
              </div>
            </div>

            {error ? (
              <p
                className="rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: "rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.08)",
                  color: "#fca5a5",
                }}
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <button type="submit" className="cl-btn-primary w-full sm:w-auto sm:flex-1">
                Save changes
              </button>
              <Link
                href={`/inspections/${inspection.id}`}
                className="cl-btn-outline w-full sm:w-auto"
              >
                Cancel
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
