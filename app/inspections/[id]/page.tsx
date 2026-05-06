import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";

// NO server-action imports, NO PhotoUploader. Pure server component.
// If this page still 400s, the issue isn't the import chain.

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let stage = "params";
  try {
    const { id } = await params;

    stage = "supabase-client";
    const supabase = await createClient();

    stage = "auth";
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    stage = "profile";
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

    stage = "inspection";
    const { data: inspection, error: inspectionErr } = await supabase
      .from("inspections")
      .select(
        "id, facility_name, facility_address, location, inspector_name, manager_assigned, date_of_inspection, status, created_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (inspectionErr) {
      return (
        <Diag user={userShell} stage={stage} message={inspectionErr.message} />
      );
    }
    if (!inspection) {
      return (
        <Diag
          user={userShell}
          stage={stage}
          message={`No inspection with id=${id} (RLS may be hiding it).`}
        />
      );
    }

    stage = "render";
    return (
      <AppShell user={userShell}>
        <div className="flex flex-col gap-5">
          <Card variant="tinted-orange">
            <Link
              href="/inspections/history"
              className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
            >
              ← History
            </Link>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-[var(--fg)] sm:text-2xl">
              {inspection.facility_name}
            </h1>
            {inspection.location ? (
              <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
                {inspection.location}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-[var(--fg-subtle)]">
              Status: {inspection.status} · Inspector:{" "}
              {inspection.inspector_name ?? "—"} · Date:{" "}
              {inspection.date_of_inspection ?? "—"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/inspections/${inspection.id}/edit`}
                className="cl-btn-outline"
              >
                Edit details
              </Link>
            </div>
          </Card>

          <Card variant="tinted-teal">
            <p className="text-sm font-medium text-[var(--fg)]">
              Photo upload temporarily disabled
            </p>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              The page is in diagnostic mode. Once we confirm this baseline
              renders, we can re-enable the photo uploader.
            </p>
          </Card>
        </div>
      </AppShell>
    );
  } catch (err) {
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return (
      <Diag
        user={{ fullName: "—", organization: null, email: null }}
        stage={stage}
        message={message}
      />
    );
  }
}

function Diag({
  user,
  stage,
  message,
}: {
  user: { fullName: string; organization: string | null; email: string | null };
  stage: string;
  message: string;
}) {
  return (
    <AppShell user={user}>
      <Card>
        <h2 className="font-semibold text-[var(--danger)]">
          Could not render inspection
        </h2>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Failed at stage: <code className="text-[var(--fg)]">{stage}</code>
        </p>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Error: <code className="text-[var(--fg)]">{message}</code>
        </p>
        <Link
          href="/inspections"
          className="mt-4 inline-block text-sm font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
        >
          ← Back to inspections
        </Link>
      </Card>
    </AppShell>
  );
}
