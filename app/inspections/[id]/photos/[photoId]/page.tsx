import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { formatDuration, shortModelName } from "@/lib/format-duration";
import { FindingCard, type FindingRow } from "@/components/finding-card";
import { PhotoEditor } from "@/components/photo-editor";
import { DeepReanalyzeFlow } from "@/components/deep-reanalyze-flow";
import { CoachTheAI } from "@/components/coach-the-ai";
import { AddFindingForm } from "@/components/add-finding-form";
import { PhotoCardNotVisible } from "@/components/photo-card-not-visible";
import type { NotVisibleItem } from "@/components/not-visible-checklist";
import type { Annotation } from "@/app/inspections/[id]/photos/[photoId]/actions";
import { deletePhoto } from "./actions";

export default async function PhotoDetailPage({
  params,
}: {
  params: Promise<{ id: string; photoId: string }>;
}) {
  const { id: inspectionId, photoId } = await params;

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

  // Parallelize all the independent reads — these don't depend on each
  // other, so issuing them concurrently shaves ~300-600ms off the page
  // load compared to the previous serial pattern. The 5 queries previously
  // ran one-after-another with each round-trip waiting on the previous.
  const [
    { data: photo },
    { data: findings },
    { data: wtlf },
    { data: parentInspection },
    nvFull,
    { data: aiCallRows },
  ] = await Promise.all([
    supabase
      .from("photos")
      .select(
        "id, storage_path, width, height, photo_location, raw_analysis, analyzed_at, annotations",
      )
      .eq("id", photoId)
      .eq("inspection_id", inspectionId)
      .maybeSingle(),
    supabase
      .from("findings")
      .select(
        "id, inspection_id, title, category, code, severity, description, location, remediation, references, ai_confidence, edited, bbox_x1, bbox_y1, bbox_x2, bbox_y2, bbox_stroke_width, bbox_color, bbox_fill, user_rating",
      )
      .eq("photo_id", photoId)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("what_to_look_for")
      .select("id, item, details")
      .eq("photo_id", photoId),
    supabase
      .from("inspections")
      .select("status")
      .eq("id", inspectionId)
      .maybeSingle(),
    // Defensive: not_visible may not have the extra columns if migration
    // 0012/0013 hasn't been run. We try the full select here and fall back
    // to a legacy select below if it errors.
    supabase
      .from("not_visible")
      .select(
        "id, item, reason, resolved, resolved_note, skipped, skipped_reason",
      )
      .eq("photo_id", photoId),
    // AI call history for this photo — used to surface analysis duration
    // (latest successful call) in the summary line. Bounded to recent
    // entries so we don't pull a long history on hot photos.
    supabase
      .from("ai_calls")
      .select("duration_ms, model, created_at, status")
      .eq("photo_id", photoId)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Latest successful AI duration + model for this photo, for the
  // header summary line. `aiCallRows` is sorted desc so [0] is most recent.
  const latestAiCall = (aiCallRows ?? [])[0];
  const latestAiDurationMs = latestAiCall
    ? Number(latestAiCall.duration_ms ?? 0)
    : 0;
  const latestAiModel = latestAiCall?.model ?? null;
  // Cumulative across every successful run on this photo (initial + re-analyses + coach turns).
  const cumulativeAiMs = (aiCallRows ?? []).reduce(
    (sum, c) => sum + Number(c.duration_ms ?? 0),
    0,
  );
  const totalAiRuns = (aiCallRows ?? []).length;

  if (!photo) notFound();

  const sortedFindings = (findings ?? []).slice().sort((a, b) => {
    const order = { High: 0, Medium: 1, Low: 2 } as const;
    return (
      (order[a.severity as keyof typeof order] ?? 3) -
      (order[b.severity as keyof typeof order] ?? 3)
    );
  });

  const isInspectionCompleted = parentInspection?.status === "completed";

  // Process the not_visible result from the Promise.all above. If the
  // full select errored (migration 0012/0013 not yet run on this env),
  // fall back to a legacy select. This second query only runs when the
  // first one failed, so the common case stays parallel.
  type NvRow = {
    id: string;
    item: string;
    reason: string | null;
    resolved: boolean | null;
    resolved_note?: string | null;
    skipped?: boolean | null;
    skipped_reason?: string | null;
  };
  let notVisible: NvRow[] | null = null;
  if (nvFull.error) {
    console.warn(
      "[photo] not_visible full select failed — falling back to legacy. " +
        "Likely cause: migration 0012/0013 not yet run. Error:",
      nvFull.error.message,
    );
    const nvLegacy = await supabase
      .from("not_visible")
      .select("id, item, reason, resolved")
      .eq("photo_id", photoId);
    notVisible = (nvLegacy.data as NvRow[] | null) ?? null;
  } else {
    notVisible = nvFull.data as NvRow[] | null;
  }

  // Shape into NotVisibleItem for the shared dropdown component.
  const notVisibleAsItems: NotVisibleItem[] = (notVisible ?? []).map((n) => ({
    id: n.id,
    item: n.item ?? "",
    reason: n.reason ?? null,
    resolved: Boolean(n.resolved),
    resolved_note: n.resolved_note ?? null,
    resolved_at: null,
    skipped: Boolean(n.skipped),
    skipped_reason: n.skipped_reason ?? null,
    skipped_at: null,
    photo_id: photoId,
    photo_location: photo.photo_location ?? null,
    section_name: null,
  }));

  const { data: signed } = await supabase.storage
    .from("photos")
    .createSignedUrl(photo.storage_path, 60 * 60);
  const photoUrl = signed?.signedUrl ?? "";

  const summary = (photo.raw_analysis as { summary?: { text?: string; confidence?: number; imageQuality?: string } } | null)?.summary;

  const bboxes = sortedFindings
    .filter(
      (f) =>
        f.bbox_x1 != null &&
        f.bbox_y1 != null &&
        f.bbox_x2 != null &&
        f.bbox_y2 != null,
    )
    .map((f, idx) => ({
      id: f.id,
      x1: Number(f.bbox_x1),
      y1: Number(f.bbox_y1),
      x2: Number(f.bbox_x2),
      y2: Number(f.bbox_y2),
      index: idx,
      severity: f.severity as "Low" | "Medium" | "High",
      title: f.title,
      strokeWidth:
        typeof (f as { bbox_stroke_width?: number }).bbox_stroke_width === "number"
          ? Number((f as { bbox_stroke_width?: number }).bbox_stroke_width)
          : 2,
      color:
        typeof (f as { bbox_color?: string | null }).bbox_color === "string"
          ? ((f as { bbox_color?: string | null }).bbox_color as string)
          : undefined,
      fill:
        typeof (f as { bbox_fill?: string | null }).bbox_fill === "string"
          ? ((f as { bbox_fill?: string | null }).bbox_fill as string)
          : undefined,
    }));

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-5">
        {/* Back link + summary */}
        <div>
          <Link
            href={`/inspections/${inspectionId}`}
            className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          >
            ← Inspection
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            {photo.photo_location || "Photo"}
          </h1>
          {summary?.text ? (
            <p className="mt-1 text-sm leading-relaxed text-[var(--fg-muted)]">
              {summary.text}
            </p>
          ) : null}
          {summary ? (
            <p className="mt-1 text-xs text-[var(--fg-subtle)]">
              Image quality: {summary.imageQuality ?? "—"}
              {typeof summary.confidence === "number"
                ? ` · AI confidence ${Math.round(summary.confidence * 100)}%`
                : ""}
              {latestAiDurationMs > 0
                ? ` · analyzed in ${formatDuration(latestAiDurationMs)}`
                : ""}
              {totalAiRuns > 1
                ? ` · ${totalAiRuns} runs (${formatDuration(cumulativeAiMs)} total)`
                : ""}
              {latestAiModel ? ` · ${shortModelName(latestAiModel)}` : ""}
            </p>
          ) : null}
        </div>

        {/* Unified photo viewer + annotation editor. The "Annotate" button
            below the photo enters edit mode in place: every shape — AI bboxes
            and inspector annotations — becomes movable/resizable, and new
            shapes (rect/circle/arrow/text) can be drawn with the toolbar.
            Save persists annotations + per-finding bbox updates atomically. */}
        {photoUrl ? (
          <PhotoEditor
            src={photoUrl}
            inspectionId={inspectionId}
            photoId={photo.id}
            bboxes={bboxes}
            annotations={(photo.annotations ?? []) as Annotation[]}
          />
        ) : (
          <Card>
            <p className="text-center text-sm text-[var(--fg-muted)]">
              Photo URL unavailable
            </p>
          </Card>
        )}

        {/* Per-photo "Not visible" dropdown — sits directly under the
            photo viewer for quick reference. Collapsed by default; expand
            to see each item and resolve/skip/reopen inline. Renders nothing
            when Chip flagged nothing as not-visible on this photo. */}
        {notVisibleAsItems.length > 0 ? (
          <Card padded={false}>
            <PhotoCardNotVisible
              inspectionId={inspectionId}
              photoId={photo.id}
              items={notVisibleAsItems}
              readOnly={isInspectionCompleted}
            />
          </Card>
        ) : null}

        {/* Deep re-analyze (Sonnet, with optional clarifying questions) */}
        <Card variant="tinted-teal">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-medium text-[var(--fg)]">
                Not seeing what you expected?
              </p>
              <p className="mt-1 text-xs text-[var(--fg-muted)]">
                Run a deeper analysis. &ldquo;Deep analyze&rdquo; first asks you a
                few clarifying questions (occupancy, sprinkler status, fire-rated
                doors, egress role) so the AI can apply the right code section —
                recommended when the call could swing on context. &ldquo;Skip
                questions&rdquo; just re-runs the deeper model against the photo
                alone. Your custom findings and any edits you&apos;ve made to AI
                findings are preserved across re-analysis.
              </p>
            </div>
            <DeepReanalyzeFlow photoId={photo.id} />
          </div>
        </Card>

        {/* Coach the AI — back-and-forth hint thread. The inspector tells
            the AI what to look at, AI re-analyzes with the whole thread as
            authoritative context, and the conversation persists per photo.
            Annotations the inspector drew on the photo are passed in so
            they can attach a region to a specific hint. */}
        <Card variant="tinted-teal">
          <CoachTheAI
            photoId={photo.id}
            annotations={(photo.annotations ?? []) as Annotation[]}
          />
        </Card>

        {/* Findings */}
        <section className="flex flex-col gap-3">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Findings · {sortedFindings.length}
          </h2>
          {sortedFindings.length === 0 ? (
            <Card>
              <p className="text-center text-sm font-medium text-[var(--fg-muted)]">
                No violations detected.
              </p>
              <p className="mt-1 text-center text-xs text-[var(--fg-subtle)]">
                Review the &ldquo;What to look for&rdquo; checklist below before clearing.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {sortedFindings.map((f, idx) => (
                <li key={f.id} id={`finding-${f.id}`}>
                  <FindingCard
                    finding={f as unknown as FindingRow}
                    index={idx}
                    photoUrl={photoUrl || null}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Inspector-authored finding (AI missed something, or you want
              to override the AI's call). */}
          <div className="mt-1">
            <AddFindingForm
              inspectionId={inspectionId}
              photoId={photo.id}
              photoUrl={photoUrl || null}
            />
          </div>
        </section>

        {/* What to look for */}
        {wtlf && wtlf.length > 0 ? (
          <Card variant="tinted-teal">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
              What to look for (on-site)
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm">
              {wtlf.map((w) => (
                <li key={w.id}>
                  <p className="font-medium text-[var(--fg)]">{w.item}</p>
                  {w.details ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-muted)]">
                      {w.details}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Note: the "Not visible" card used to live here at the bottom
            of the page as a read-only summary. It's been moved up to
            sit directly under the photo viewer as an interactive
            dropdown — see <PhotoCardNotVisible> above. */}

        {/* Delete photo */}
        <Card>
          <form
            action={deletePhoto.bind(
              null,
              photo.id,
              photo.storage_path,
              inspectionId,
            )}
            className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-[var(--fg)]">Remove this photo</p>
              <p className="mt-1 text-sm text-[var(--fg-muted)]">
                Deletes the photo and all associated findings.
                </p>
            </div>
            <button type="submit" className="cl-btn-outline">
              Delete photo
            </button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
