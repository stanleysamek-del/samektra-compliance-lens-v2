import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { EditInspectionForm } from "./edit-inspection-form";

export default async function EditInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
          <EditInspectionForm
            inspectionId={inspection.id}
            initial={{
              facility_name: inspection.facility_name ?? "",
              facility_address: inspection.facility_address ?? "",
              location: inspection.location ?? "",
              inspector_name: inspection.inspector_name ?? "",
              manager_assigned: inspection.manager_assigned ?? "",
              manager_assigned_email: inspection.manager_assigned_email ?? "",
              date_of_inspection: inspection.date_of_inspection ?? "",
              date_assigned: inspection.date_assigned ?? "",
            }}
          />
        </Card>
      </div>
    </AppShell>
  );
}
