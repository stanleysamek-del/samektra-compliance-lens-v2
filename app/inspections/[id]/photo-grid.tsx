import Link from "next/link";
import { BarcodeScanner } from "@/components/assets/barcode-scanner";
import { Card } from "@/components/card";
import { formatDuration } from "@/lib/format-duration";
import { PhotoCardFindings, type CompactFinding } from "@/components/photo-card-findings";
import { PhotoMoveMenu } from "@/components/photo-move-menu";
import type { NotVisibleItem } from "@/components/not-visible-checklist";
import { PhotoCardNotVisible } from "@/components/photo-card-not-visible";
import { SeverityBadge } from "@/components/severity-badge";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Photos grouped by section (Unassigned first), each card with its
 * analysis state, findings, move-to-section menu, barcode scan and
 * not-visible follow-ups. Rendered on the Photos & Plans step.
 */

export type GridPhoto = {
  id: string;
  photo_location: string | null;
  section_id: string | null;
  analysis_status: "queued" | "analyzing" | "done" | "failed";
  analysis_error: string | null;
};

export function PhotoGrid({
  inspectionId,
  photosList,
  sectionsList,
  sectionOptions,
  findingsByPhoto,
  photoUrls,
  barcodePhotoUrls,
  aiDurationByPhoto,
  notVisibleByPhoto,
  isCompleted,
}: {
  inspectionId: string;
  photosList: GridPhoto[];
  sectionsList: Array<{ id: string; name: string }>;
  sectionOptions: Array<{ id: string; name: string }>;
  findingsByPhoto: Record<string, { total: number; high: number; items: CompactFinding[] }>;
  photoUrls: Record<string, string>;
  barcodePhotoUrls: Record<string, string>;
  aiDurationByPhoto: Record<string, number>;
  notVisibleByPhoto: Record<string, NotVisibleItem[]>;
  isCompleted: boolean;
}) {
  return (
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
            Add a photo above — Chip reads it and drafts the findings.
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
                  <EmptyState compact title="No photos in this section yet">
                    Use the &ldquo;Move to&rdquo; menu on any photo card
                    below to add it here.
                  </EmptyState>
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
                              href={`/inspections/${inspectionId}/photos/${p.id}`}
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
                                  // No signed URL came back (storage hiccup or a
                                  // missing object). Say so — a permanent
                                  // "loading…" is a lie. The card is a link, so a
                                  // tap opens the photo page, which retries.
                                  <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-xs text-[var(--fg-subtle)]">
                                    <span>Photo unavailable</span>
                                    <span className="text-[10px]">tap to retry</span>
                                  </div>
                                )}
                              </div>
                              <div className="px-4 pb-2 pt-3">
                                <div className="flex items-center justify-between gap-2">
                                  {p.analysis_status !== "done" ? (
                                    <span
                                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                                      style={
                                        p.analysis_status === "failed"
                                          ? { background: "rgba(168,54,43,0.10)", color: "#b42318" }
                                          : p.analysis_status === "analyzing"
                                            ? { background: "rgba(184,118,42,0.12)", color: "#8a5300" }
                                            : { background: "rgba(15,21,24,0.06)", color: "var(--fg-muted)" }
                                      }
                                      title={
                                        p.analysis_status === "failed"
                                          ? p.analysis_error ?? "Analysis failed — open the photo to retry."
                                          : p.analysis_status === "analyzing"
                                            ? "Chip is reading this photo now."
                                            : "Waiting for Chip — analysis starts as soon as there is room in line."
                                      }
                                    >
                                      {p.analysis_status === "analyzing" ? (
                                        <span
                                          aria-hidden
                                          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                                          style={{ background: "#8a5300" }}
                                        />
                                      ) : null}
                                      {p.analysis_status === "failed"
                                        ? "Failed"
                                        : p.analysis_status === "analyzing"
                                          ? "Analyzing…"
                                          : "Queued"}
                                    </span>
                                  ) : (
                                    <span className="text-sm font-medium text-[var(--fg)]">
                                      {counts.total} finding{counts.total === 1 ? "" : "s"}
                                    </span>
                                  )}
                                  {counts.high > 0 ? (
                                    <SeverityBadge severity="High" size="sm">
                                      {counts.high} high
                                    </SeverityBadge>
                                  ) : null}
                                </div>
                                {p.photo_location ? (
                                  <p className="mt-1 truncate text-xs text-[var(--fg-muted)]">
                                    {p.photo_location}
                                  </p>
                                ) : null}
                                {p.analysis_status === "failed" && p.analysis_error ? (
                                  <p className="mt-1 text-[11px] leading-snug" style={{ color: "#b42318" }}>
                                    {p.analysis_error}
                                  </p>
                                ) : null}
                                {/* AI analysis time — small mono caption so the user can
                                    see how long each examination took. Reads the latest
                                    successful ai_calls.duration_ms for this photo. */}
                                {aiDurationByPhoto[p.id] ? (
                                  <p
                                    className="mt-1 text-[10px] uppercase tracking-[0.14em]"
                                    style={{
                                      fontFamily: "var(--font-jetbrains-mono)",
                                      color: "var(--fg-subtle)",
                                    }}
                                    title="Time the AI spent analyzing this photo (most recent run)"
                                  >
                                    ⏱ {formatDuration(aiDurationByPhoto[p.id])}
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
                                  inspectionId={inspectionId}
                                  currentSectionId={p.section_id ?? null}
                                  sections={sectionOptions}
                                />
                              </div>
                            ) : null}

                            <PhotoCardFindings
                              inspectionId={inspectionId}
                              photoId={p.id}
                              findings={counts.items}
                              analysisStatus={p.analysis_status}
                            />

                            {url && <BarcodeScanner compact facilities={[]} sourceImageUrl={barcodePhotoUrls[p.id] || url} />}

                            {/* Per-photo "Not visible" dropdown —
                                collapsed by default, click to expand.
                                Items have Resolve / Skip / Reopen
                                controls inline. Hidden when the photo
                                had no not-visible items at all. */}
                            <PhotoCardNotVisible
                              inspectionId={inspectionId}
                              photoId={p.id}
                              items={notVisibleByPhoto[p.id] ?? []}
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
  );
}
