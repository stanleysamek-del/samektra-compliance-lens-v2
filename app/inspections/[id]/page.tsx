import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { PhotoUploader } from "@/components/photo-uploader";
import { formatDuration } from "@/lib/format-duration";
import {
  PhotoCardFindings,
  type CompactFinding,
} from "@/components/photo-card-findings";
import { SectionsManager, type SectionRow } from "@/components/sections-manager";
import { PhotoMoveMenu } from "@/components/photo-move-menu";
import {
  NotVisibleChecklist,
  type NotVisibleItem,
} from "@/components/not-visible-checklist";
import { PhotoCardNotVisible } from "@/components/photo-card-not-visible";
import { InspectionSummary } from "@/components/inspection-summary";
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
        "id, facility_name, facility_address, location, inspector_name, manager_assigned, date_of_inspection, status, created_at, updated_at, inspector_signed_at, manager_signed_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (inspectionErr) {
      return <Diag user={userShell} stage={stage} message={inspectionErr.message} />;
    }
    if (!inspection) {
      return <Diag user={userShell} stage={stage} message={`No inspection with id=${id}.`} />;
    }

    stage = "photos";
    const { data: photos } = await supabase
      .from("photos")
      .select(
        "id, storage_path, photo_location, analyzed_at, created_at, section_id, sort_order",
      )
      .eq("inspection_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    const photosList = photos ?? [];
    // Hoisted so sections / not-visible / findings stages can all reference
    // it without re-declaring (which would also be a temporal-dead-zone error).
    const photoIds = photosList.map((p) => p.id);

    stage = "sections";
    const { data: sectionsData } = await supabase
      .from("inspection_sections")
      .select("id, name, sort_order")
      .eq("inspection_id", id)
      .order("sort_order", { ascending: true });
    const sectionsList = sectionsData ?? [];

    // Count photos per section so the manager UI can display "· N photos".
    const photoCountBySection = new Map<string, number>();
    for (const p of photosList) {
      if (p.section_id) {
        photoCountBySection.set(
          p.section_id,
          (photoCountBySection.get(p.section_id) ?? 0) + 1,
        );
      }
    }
    const sectionsWithCounts: SectionRow[] = sectionsList.map((s) => ({
      id: s.id,
      name: s.name,
      sort_order: s.sort_order,
      photoCount: photoCountBySection.get(s.id) ?? 0,
    }));
    const sectionOptions = sectionsList.map((s) => ({ id: s.id, name: s.name }));

    // Aggregate "not visible" items across every photo in the inspection
    // for the re-photograph punch-list. Joined with photo metadata so each
    // row can render its source photo location + section context inline.
    stage = "not-visible";
    const photoMetaById = new Map<
      string,
      { photo_location: string | null; section_id: string | null }
    >();
    for (const p of photosList) {
      photoMetaById.set(p.id, {
        photo_location: p.photo_location ?? null,
        section_id: p.section_id ?? null,
      });
    }
    const sectionNameById = new Map<string, string>(
      sectionsList.map((s) => [s.id, s.name]),
    );

    let notVisibleItems: NotVisibleItem[] = [];
    if (photoIds.length > 0) {
      // Try the full select first (includes Phase 2 skip columns).
      // If migration 0012 or 0013 hasn't been run yet, the columns
      // won't exist and PostgREST returns an error — we catch it and
      // retry with just the legacy columns so at least the items
      // render with Resolve/Skip disabled rather than silently
      // disappearing. The error message is logged so it shows up in
      // Vercel function logs.
      type NvRow = {
        id: string;
        item: string;
        reason: string | null;
        resolved: boolean | null;
        resolved_note?: string | null;
        resolved_at?: string | null;
        skipped?: boolean | null;
        skipped_reason?: string | null;
        skipped_at?: string | null;
        photo_id: string;
      };

      let nvRows: NvRow[] | null = null;
      const fullSelect = await supabase
        .from("not_visible")
        .select(
          "id, item, reason, resolved, resolved_note, resolved_at, skipped, skipped_reason, skipped_at, photo_id, created_at",
        )
        .in("photo_id", photoIds)
        .order("resolved", { ascending: true })
        .order("created_at", { ascending: true });

      if (fullSelect.error) {
        console.warn(
          "[inspection] not_visible full select failed — falling back to legacy. " +
            "Most likely cause: migration 0012 and/or 0013 hasn't been run yet. Error:",
          fullSelect.error.message,
        );
        const legacy = await supabase
          .from("not_visible")
          .select("id, item, reason, resolved, photo_id, created_at")
          .in("photo_id", photoIds)
          .order("created_at", { ascending: true });
        if (legacy.error) {
          console.error(
            "[inspection] not_visible legacy select ALSO failed:",
            legacy.error.message,
          );
        } else {
          nvRows = legacy.data as NvRow[] | null;
        }
      } else {
        nvRows = fullSelect.data as NvRow[] | null;
      }

      console.log(
        `[inspection ${id}] not_visible rows: ${nvRows?.length ?? 0}`,
      );

      notVisibleItems = (nvRows ?? []).map((r) => {
        const meta = photoMetaById.get(r.photo_id) ?? {
          photo_location: null,
          section_id: null,
        };
        return {
          id: r.id,
          item: r.item ?? "",
          reason: r.reason ?? null,
          resolved: Boolean(r.resolved),
          resolved_note: r.resolved_note ?? null,
          resolved_at: r.resolved_at ?? null,
          skipped: Boolean(r.skipped),
          skipped_reason: r.skipped_reason ?? null,
          skipped_at: r.skipped_at ?? null,
          photo_id: r.photo_id,
          photo_location: meta.photo_location,
          section_name: meta.section_id
            ? sectionNameById.get(meta.section_id) ?? null
            : null,
        };
      });
    }
    // Open = not yet resolved AND not skipped. This is what drives the
    // header "needs re-photograph" pill.
    const unresolvedNotVisibleCount = notVisibleItems.filter(
      (n) => !n.resolved && !n.skipped,
    ).length;

    // Group items by their source photo so each photo card can render its
    // own collapsible dropdown of items inline.
    const notVisibleByPhoto = new Map<string, NotVisibleItem[]>();
    for (const it of notVisibleItems) {
      const arr = notVisibleByPhoto.get(it.photo_id) ?? [];
      arr.push(it);
      notVisibleByPhoto.set(it.photo_id, arr);
    }

    stage = "findings-counts";
    // photoIds was hoisted to the photos stage above.
    let findingsByPhoto: Record<
      string,
      { total: number; high: number; items: CompactFinding[] }
    > = {};
    // Roll-up counters for the summary card. Same loop as the per-photo
    // breakdown, just kept at inspection-scope so we don't iterate twice.
    let totalFindings = 0;
    let highFindings = 0;
    let mediumFindings = 0;
    let lowFindings = 0;
    let thumbsUp = 0;
    let thumbsDown = 0;

    // Per-photo AI analysis duration. We pick the LATEST successful
    // ai_call per photo so re-analyses (Coach, deep re-run) overwrite
    // the original upload's number. The map is consumed by photo cards
    // to render a small "Analyzed in X.Xs" badge.
    const aiDurationByPhoto = new Map<string, number>();
    let totalAiDurationMs = 0;

    if (photoIds.length > 0) {
      // Fetch findings + ai_calls in parallel — they're both keyed on
      // photoIds and independent of each other.
      const [findingsResult, aiCallsResult] = await Promise.all([
        supabase
          .from("findings")
          .select("id, photo_id, title, severity, user_rating, created_at")
          .in("photo_id", photoIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("ai_calls")
          .select("photo_id, duration_ms, created_at, status")
          .in("photo_id", photoIds)
          .eq("status", "success")
          .order("created_at", { ascending: false }),
      ]);

      // Build the per-photo latest-duration map. Because ai_calls is
      // sorted desc by created_at, the FIRST hit per photo_id is the
      // most recent successful call.
      for (const call of aiCallsResult.data ?? []) {
        const pid = call.photo_id as string | null;
        if (!pid) continue;
        const dur = Number(call.duration_ms ?? 0);
        if (!aiDurationByPhoto.has(pid)) {
          aiDurationByPhoto.set(pid, dur);
          totalAiDurationMs += dur;
        }
      }

      try {
        const findings = findingsResult.data;
        findingsByPhoto = (findings ?? []).reduce<typeof findingsByPhoto>(
          (acc, f) => {
            const pid = f.photo_id as string | null;
            totalFindings += 1;
            if (f.severity === "High") highFindings += 1;
            else if (f.severity === "Medium") mediumFindings += 1;
            else if (f.severity === "Low") lowFindings += 1;
            if (f.user_rating === 1) thumbsUp += 1;
            else if (f.user_rating === -1) thumbsDown += 1;

            if (!pid) return acc;
            const bucket = (acc[pid] ??= { total: 0, high: 0, items: [] });
            bucket.total += 1;
            if (f.severity === "High") bucket.high += 1;
            bucket.items.push({
              id: f.id as string,
              title: (f.title as string) ?? "Untitled finding",
              severity: f.severity as "Low" | "Medium" | "High",
            });
            return acc;
          },
          {},
        );
      } catch (err) {
        console.error("[inspection] findings query", err);
      }
    }

    // Same lifecycle counts the punch-list pill uses, exposed for the
    // summary card too.
    const resolvedNotVisibleCount = notVisibleItems.filter(
      (n) => n.resolved,
    ).length;
    const skippedNotVisibleCount = notVisibleItems.filter(
      (n) => n.skipped && !n.resolved,
    ).length;

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
                  href="/inspections/history"
                  className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
                >
                  ← History
                </Link>
                <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-[var(--fg)] sm:text-2xl">
                  {inspection.facility_name}
                </h1>
                {inspection.location ? (
                  <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{inspection.location}</p>
                ) : null}
              </div>
              <StatusPill status={inspection.status} />
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Field label="Inspector" value={inspection.inspector_name} />
              <Field label="Date" value={inspection.date_of_inspection} />
              <Field label="Manager" value={inspection.manager_assigned} />
              <Field label="Address" value={inspection.facility_address} />
            </dl>

            {unresolvedNotVisibleCount > 0 ? (
              <div
                className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-medium"
                style={{
                  borderColor: "rgba(184,118,42,0.4)",
                  background: "rgba(184,118,42,0.08)",
                  color: "#b8762a",
                }}
                title="Items Chip flagged as 'not visible' from current photos — bring this list on your next site visit"
              >
                ⚠ {unresolvedNotVisibleCount} item
                {unresolvedNotVisibleCount === 1 ? "" : "s"} need re-photograph
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/inspections/${inspection.id}/edit`} className="cl-btn-outline">
                Edit details
              </Link>
            </div>
          </Card>

          {/* Stat-grid summary — photos, findings by severity, punch-list
              progress, feedback ratings, and a compact timeline strip. */}
          <InspectionSummary
            photoCount={photosList.length}
            findings={{
              total: totalFindings,
              high: highFindings,
              medium: mediumFindings,
              low: lowFindings,
            }}
            punchList={{
              open: unresolvedNotVisibleCount,
              resolved: resolvedNotVisibleCount,
              skipped: skippedNotVisibleCount,
            }}
            ratings={{ thumbsUp, thumbsDown }}
            status={inspection.status}
            createdAt={inspection.created_at}
            updatedAt={inspection.updated_at}
            finalizedAt={
              inspection.status === "completed"
                ? inspection.inspector_signed_at ?? inspection.updated_at
                : null
            }
          />

          {/* Aggregate AI-time footnote — sum of the latest successful
              analysis duration across every photo on this inspection.
              Renders nothing if no photos have been analyzed yet. */}
          {totalAiDurationMs > 0 ? (
            <p
              className="px-1 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              title="Total time the AI spent analyzing photos on this inspection (most recent run per photo)"
            >
              ⏱ Total AI analysis time · {formatDuration(totalAiDurationMs)}
              {aiDurationByPhoto.size > 0
                ? ` · avg ${formatDuration(totalAiDurationMs / aiDurationByPhoto.size)} per photo`
                : ""}
            </p>
          ) : null}

          {!isCompleted ? <PhotoUploader inspectionId={inspection.id} /> : null}

          {/* Photo-organization manager — sits above the photo grid so it's
              easy to add sections before/while shooting. Empty state nudges
              the inspector to organize as photos come in. */}
          <SectionsManager
            inspectionId={inspection.id}
            sections={sectionsWithCounts}
            readOnly={isCompleted}
          />

          <section className="flex flex-col gap-4">
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
              <>
                {/* Group photos by section. Unassigned first (always shown if
                    there are any orphans). Then each section in sort_order.
                    Empty sections render a small placeholder so users see
                    that the section exists and can drop photos into it. */}
                {(() => {
                  const grouped: Array<{
                    key: string;
                    label: string | null;
                    photos: typeof photosList;
                  }> = [];

                  const unassigned = photosList.filter((p) => !p.section_id);
                  if (unassigned.length > 0 || sectionsList.length === 0) {
                    grouped.push({
                      key: "unassigned",
                      label: sectionsList.length > 0 ? "Unassigned" : null,
                      photos: unassigned,
                    });
                  }

                  for (const s of sectionsList) {
                    grouped.push({
                      key: s.id,
                      label: s.name,
                      photos: photosList.filter((p) => p.section_id === s.id),
                    });
                  }

                  return grouped.map((g) => (
                    <div key={g.key} className="flex flex-col gap-2.5">
                      {g.label ? (
                        <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                          {g.label}
                          <span className="ml-1.5 font-medium text-[var(--fg-subtle)]">
                            · {g.photos.length} photo{g.photos.length === 1 ? "" : "s"}
                          </span>
                        </h3>
                      ) : null}
                      {g.photos.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-center text-[11px] text-[var(--fg-subtle)]">
                          No photos in this section yet — use the &ldquo;Move
                          to&rdquo; menu on any photo card below to add it
                          here.
                        </p>
                      ) : (
                        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {g.photos.map((p) => {
                            const counts =
                              findingsByPhoto[p.id] ?? { total: 0, high: 0, items: [] };
                            const url = photoUrls[p.id];
                            return (
                              <li key={p.id}>
                                <Card padded={false} className="overflow-hidden">
                                  <Link
                                    href={`/inspections/${inspection.id}/photos/${p.id}`}
                                    className="block"
                                  >
                                    <div
                                      className="relative aspect-video w-full"
                                      style={{ background: "#0a0d12" }}
                                    >
                                      {url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={url} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="flex h-full items-center justify-center text-xs text-[var(--fg-subtle)]">
                                          loading…
                                        </div>
                                      )}
                                    </div>
                                    <div className="px-4 pb-2 pt-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium text-[var(--fg)]">
                                          {counts.total} finding{counts.total === 1 ? "" : "s"}
                                        </span>
                                        {counts.high > 0 ? (
                                          <span
                                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                            style={{ background: "rgba(168,54,43,0.10)", color: "#a8362b" }}
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
                                      {/* AI analysis time — small mono caption so the user can
                                          see how long each examination took. Reads the latest
                                          successful ai_calls.duration_ms for this photo. */}
                                      {aiDurationByPhoto.get(p.id) ? (
                                        <p
                                          className="mt-1 text-[10px] uppercase tracking-[0.14em]"
                                          style={{
                                            fontFamily: "var(--font-jetbrains-mono)",
                                            color: "var(--fg-subtle)",
                                          }}
                                          title="Time the AI spent analyzing this photo (most recent run)"
                                        >
                                          ⏱ {formatDuration(aiDurationByPhoto.get(p.id)!)}
                                        </p>
                                      ) : null}
                                    </div>
                                  </Link>

                                  {/* Move-to-section menu lives BETWEEN the
                                      link and the findings list so the click
                                      target on the card stays intact while
                                      this control is independently
                                      interactive. Hidden when finalized. */}
                                  {!isCompleted ? (
                                    <div className="flex justify-end px-4 pb-2">
                                      <PhotoMoveMenu
                                        photoId={p.id}
                                        inspectionId={inspection.id}
                                        currentSectionId={p.section_id ?? null}
                                        sections={sectionOptions}
                                      />
                                    </div>
                                  ) : null}

                                  <PhotoCardFindings
                                    inspectionId={inspection.id}
                                    photoId={p.id}
                                    findings={counts.items}
                                  />

                                  {/* Per-photo "Not visible" dropdown —
                                      collapsed by default, click to expand.
                                      Items have Resolve / Skip / Reopen
                                      controls inline. Hidden when the photo
                                      had no not-visible items at all. */}
                                  <PhotoCardNotVisible
                                    inspectionId={inspection.id}
                                    photoId={p.id}
                                    items={notVisibleByPhoto.get(p.id) ?? []}
                                    readOnly={isCompleted}
                                  />
                                </Card>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ));
                })()}
              </>
            )}
          </section>

          {/* Re-photograph punch-list — every "not visible" item Chip
              flagged across all photos. Inspector resolves them as they
              come back with better shots. Print button opens the browser
              print dialog so the list can be taken to the site. The
              #punch-list anchor is linked from each photo's per-photo
              not-visible card. */}
          <div id="punch-list" className="scroll-mt-20">
            <NotVisibleChecklist
              inspectionId={inspection.id}
              items={notVisibleItems}
              readOnly={isCompleted}
            />
          </div>

          <Card>
            {isCompleted ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-[var(--fg)]">Inspection finalized</p>
                    <p className="mt-1 text-sm text-[var(--fg-muted)]">
                      Download the report below or reopen to make changes.
                    </p>
                  </div>
                  <form action={finalizeInspection}>
                    <input type="hidden" name="inspection_id" value={inspection.id} />
                    <input type="hidden" name="status" value="in_progress" />
                    <button type="submit" className="cl-btn-outline">Reopen</button>
                  </form>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <a
                    href={`/api/inspections/${inspection.id}/export/pdf`}
                    className="cl-btn-accent w-full text-center"
                  >
                    Download PDF
                  </a>
                  <a
                    href={`/api/inspections/${inspection.id}/export/cap`}
                    className="cl-btn-outline w-full text-center"
                    title="Corrective Action Plan (.xlsx)"
                  >
                    Download CAP
                  </a>
                  <a
                    href={`/api/inspections/${inspection.id}/export/lsra`}
                    className="cl-btn-outline w-full text-center"
                    title="Life Safety Risk Assessment (.xlsx)"
                  >
                    Download LSRA
                  </a>
                  <a
                    href={`/api/inspections/${inspection.id}/export/ilsm`}
                    title="Interim Life Safety Measures (.xlsx) — TJC LS.01.02.01 / CMS K-291"
                    className="cl-btn-outline w-full text-center"
                  >
                    Download ILSM
                  </a>
                </div>
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
    in_progress: { label: "In progress", bg: "rgba(184,118,42,0.10)", fg: "#b8762a" },
    completed: { label: "Completed", bg: "rgba(96,122,58,0.10)", fg: "#607a3a" },
    archived: { label: "Archived", bg: "rgba(148,163,184,0.12)", fg: "var(--slate)" },
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

// formatDuration moved to lib/format-duration.ts so the photo detail
// page and admin stats can share it.
