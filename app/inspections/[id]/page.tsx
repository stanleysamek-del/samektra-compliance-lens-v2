import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { PhotoUploader } from "@/components/photo-uploader";
import { finalizeInspection } from "./actions";

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
        <Diag user={userShell} stage={stage} message={`No inspection with id=${id} (RLS may be hiding it).`} />
      );
    }

    stage = "photos";
    const { data: photos, error: photosErr } = await supabase
      .from("photos")
      .select("id, storage_path, photo_location, analyzed_at, created_at")
      .eq("inspection_id", id)
      .order("created_at", { ascending: false });
    if (photosErr) {
      return <Diag user={userShell} stage={stage} message={photosErr.message} />;
    }
    const photosList = photos ?? [];

    stage = "findings";
    const photoIds = photosList.map((p) => p.id);
    let findingsByPhoto: Record<string, { total: number; high: number }> = {};
    if (photoIds.length > 0) {
      try {
        const { data: findings } = await supabase
          .from("findings")
          .select("photo_id, severity")
          .in("photo_id", photoIds);
        findingsByPhoto = (findings ?? []).reduce<typeof findingsByPhoto>(
          (acc, f) => {
            const pid = f.photo_id as string | null;
            if (!pid) return acc;
            const bucket = (acc[pid] ??= { total: 0, high: 0 });
            bucket.total += 1;
            if (f.severity === "High") bucket.high += 1;
            return acc;
          },
          {},
        );
      } catch (err) {
        console.error("[inspection] findings query", err);
      }
    }

    stage = "signed-urls";
    const photoUrls: Record<string, string> = {};
    for (const p of photosList) {
      try {
        const { data, error } = await supabase.storage
          .from("photos")
          .createSignedUrl(p.storage_path, 60 * 60);
        if (error) throw error;
        if (data?.signedUrl) photoUrls[p.id] = data.signedUrl;
      } catch (err) {
        console.error("[inspection] signed url for", p.id, err);
        // continue — we'll just show "loading…" for that thumbnail
      }
    }

    const isCompleted = inspection.status === "completed";

    stage = "render";
    return (
      <AppShell user={userShell}>
        <div className="flex flex-col gap-5">
          {/* Header */}
          <Card variant={isCompleted ? "tinted-teal" : "tinted-orange"}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
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
              </div>
              <StatusPill status={inspection.status} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="Inspector" value={inspection.inspector_name} />
              <Field label="Date" value={inspection.date_of_inspection} />
              <Field label="Manager" value={inspection.manager_assigned} />
              <Field label="Address" value={inspection.facility_address} />
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/inspections/${inspection.id}/edit`}
                className="cl-btn-outline"
              >
                Edit details
              </Link>
            </div>
          </Card>

          {/* Photo uploader */}
          {!isCompleted ? <PhotoUploader inspectionId={inspection.id} /> : null}

          {/* Photos */}
          <section className="flex flex-col gap-3">
            <h2 className="px-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Photos {photosList.length ? `· ${photosList.length}` : ""}
            </h2>
            {photosList.length === 0 ? (
              <Card>
                <p className="text-center text-sm font-medium text-[var(--fg-muted)]">
                  No photos yet
                </p>
                <p className="mt-1 text-center text-xs text-[var(--fg-subtle)]">
                  Add a photo to start the AI analysis.
                </p>
              </Card>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {photosList.map((p) => {
                  const counts = findingsByPhoto[p.id] ?? { total: 0, high: 0 };
                  const url = photoUrls[p.id];
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/inspections/${inspection.id}/photos/${p.id}`}
                        className="block"
                      >
                        <Card padded={false} className="overflow-hidden">
                          <div
                            className="relative aspect-video w-full"
                            style={{ background: "#0a0d12" }}
                          >
                            {url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-[var(--fg-subtle)]">
                                loading…
                              </div>
                            )}
                            {p.analyzed_at ? null : (
                              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
                                Analyzing…
                              </span>
                            )}
                          </div>
                          <div className="p-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-[var(--fg)]">
                                {counts.total} finding{counts.total === 1 ? "" : "s"}
                              </span>
                              {counts.high > 0 ? (
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                  style={{
                                    background: "rgba(239,68,68,0.12)",
                                    color: "#fca5a5",
                                  }}
                                >
                                  {counts.high} high
                                </span>
                              ) : null}
                            </div>
                            {p.photo_location ? (
                              <p className="mt-1 truncate text-xs text-[var(--fg-muted)]">
                                {p.photo_location}
                              </p>
                            ) : null}
                          </div>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Finalize / Reopen */}
          <Card>
            {isCompleted ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-[var(--fg)]">Inspection finalized</p>
                  <p className="mt-1 text-sm text-[var(--fg-muted)]">
                    CAP / LSRA / ILSM / PDF export ships in the next iteration.
                  </p>
                </div>
                <form action={finalizeInspection}>
                  <input type="hidden" name="inspection_id" value={inspection.id} />
                  <input type="hidden" name="status" value="in_progress" />
                  <button type="submit" className="cl-btn-outline">Reopen</button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-[var(--fg)]">Done capturing photos?</p>
                  <p className="mt-1 text-sm text-[var(--fg-muted)]">
                    Finalize to lock the inspection. You can still reopen it later.
                  </p>
                </div>
                <form action={finalizeInspection}>
                  <input type="hidden" name="inspection_id" value={inspection.id} />
                  <input type="hidden" name="status" value="completed" />
                  <button type="submit" className="cl-btn-primary">Finalize inspection</button>
                </form>
              </div>
            )}
          </Card>
        </div>
      </AppShell>
    );
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
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
        <h2 className="font-semibold text-[var(--danger)]">Could not render inspection</h2>
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    in_progress: { label: "In progress", bg: "rgba(245,158,11,0.12)", fg: "#fbbf24" },
    completed: { label: "Completed", bg: "rgba(34,197,94,0.12)", fg: "#86efac" },
    archived: { label: "Archived", bg: "rgba(148,163,184,0.12)", fg: "#cbd5e1" },
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

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-[var(--fg)]">{value || "—"}</dd>
    </div>
  );
}
