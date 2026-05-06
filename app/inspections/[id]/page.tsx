import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { PhotoUploader } from "@/components/photo-uploader";

export default async function InspectionDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  // ---- Step 0: prove we got into the page at all ----
  let stage = "init";

  try {
    stage = "await-params";
    const { id } = await props.params;

    stage = "create-supabase";
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

    stage = "inspection";
    const { data: inspection, error: inspectionErr } = await supabase
      .from("inspections")
      .select(
        "id, facility_name, facility_address, location, inspector_name, manager_assigned, date_of_inspection, status",
      )
      .eq("id", id)
      .maybeSingle();

    if (inspectionErr) {
      return (
        <DiagShell
          fullName={profile.full_name}
          email={user.email}
          stage={stage}
          message={`Supabase error: ${inspectionErr.message} (code ${inspectionErr.code})`}
        />
      );
    }
    if (!inspection) {
      return (
        <DiagShell
          fullName={profile.full_name}
          email={user.email}
          stage={stage}
          message={`No inspection row returned for id=${id}. Most likely an RLS policy issue: created_by may not match auth.uid().`}
        />
      );
    }

    stage = "photos";
    const { data: photos } = await supabase
      .from("photos")
      .select("id, storage_path, photo_location, analyzed_at")
      .eq("inspection_id", id)
      .order("created_at", { ascending: false });

    stage = "render";
    return (
      <AppShell
        user={{
          fullName: profile.full_name,
          organization: profile.organization,
          email: user.email ?? null,
        }}
      >
        <div className="flex flex-col gap-5">
          <Card variant="tinted-orange">
            <Link
              href="/inspections"
              className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
            >
              ← All inspections
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
          </Card>

          <PhotoUploader inspectionId={inspection.id} />

          <section className="flex flex-col gap-3">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Photos {photos?.length ? `· ${photos.length}` : ""}
            </h2>
            {!photos || photos.length === 0 ? (
              <Card>
                <p className="text-center text-sm font-medium text-[var(--fg-muted)]">
                  No photos yet
                </p>
                <p className="mt-1 text-center text-xs text-[var(--fg-subtle)]">
                  Add a photo to start the AI analysis.
                </p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {photos.map((p) => (
                  <li key={p.id}>
                    <Card padded={false}>
                      <Link
                        href={`/inspections/${inspection.id}/photos/${p.id}`}
                        className="block px-5 py-4 text-sm text-[var(--fg)]"
                      >
                        {p.photo_location || p.storage_path}
                        {p.analyzed_at ? "" : " · analyzing…"}
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </AppShell>
    );
  } catch (err) {
    // Last-resort fallback so we never return 400 from this route again.
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return (
      <DiagShell
        fullName="—"
        email={null}
        stage={stage}
        message={message}
      />
    );
  }
}

function DiagShell({
  fullName,
  email,
  stage,
  message,
}: {
  fullName: string;
  email: string | null | undefined;
  stage: string;
  message: string;
}) {
  return (
    <AppShell
      user={{ fullName, organization: null, email: email ?? null }}
    >
      <Card>
        <h2 className="font-semibold text-[var(--danger)]">
          Could not render inspection
        </h2>
        <p className="mt-2 text-sm text-[var(--fg-muted)]">
          Stage that failed: <code className="text-[var(--fg)]">{stage}</code>
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
