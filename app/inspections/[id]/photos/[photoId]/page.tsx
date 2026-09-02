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
import { LswLearnMore } from "@/components/lsw-learn-more";
import { HelpTip } from "@/components/help-tip";
import { DeletePhotoButton } from "@/components/delete-photo-button";
import { PhotoBackLink } from "@/components/photo-back-link";

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
    findingsFull,
    { data: wtlf },
    { data: parentInspection },
    nvFull,
    { data: aiCallRows },
  ] = await Promise.all([
    supabase
      .from("photos")
      .select(
        "id, storage_path, original_storage_path, width, height, photo_location, raw_analysis, analyzed_at, annotations",
      )
      .eq("id", photoId)
      .eq("inspection_id", inspectionId)
      .maybeSingle(),
    // Full select includes the 0019 action columns. If that migration
    // isn't applied yet, this errors — a legacy fallback below re-selects
    // without them (same defensive pattern as not_visible/0012 here).
    supabase
      .from("findings")
      .select(
        "id, inspection_id, title, category, code, severity, description, location, remediation, references, ai_confidence, edited, bbox_x1, bbox_y1, bbox_x2, bbox_y2, bbox_stroke_width, bbox_color, bbox_fill, user_rating, cap_status, priority, cap_target_date, assigned_to, assigned_email, action_closed_at, closure_note, closure_photo_id",
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
      .select("status, organization_id")
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

  // Findings fallback for pre-0019 databases (see comment on the select).
  // The legacy rows lack the action columns; FindingRow marks them all
  // optional, so the narrower shape is safe to treat as the full one.
  let findings = findingsFull.data;
  if (findingsFull.error) {
    console.warn(
      "[photo] findings full select failed — falling back to legacy. " +
        "Likely cause: migration 0019 not yet run. Error:",
      findingsFull.error.message,
    );
    const legacy = await supabase
      .from("findings")
      .select(
        "id, inspection_id, title, category, code, severity, description, location, remediation, references, ai_confidence, edited, bbox_x1, bbox_y1, bbox_x2, bbox_y2, bbox_stroke_width, bbox_color, bbox_fill, user_rating, cap_status, cap_target_date",
      )
      .eq("photo_id", photoId)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: true });
    findings = legacy.data as unknown as typeof findings;
  }
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

  // Corrective-action context: the org member directory feeds the
  // assignee dropdown; the caller's role decides whether the strip is
  // read-only (viewers). Personal-workspace inspections get an empty
  // directory — assignment falls back to the by-email field.
  const orgId =
    (parentInspection as { organization_id?: string | null } | null)
      ?.organization_id ?? null;
  let actionMembers: Array<{ user_id: string; full_name: string; email: string }> = [];
  let isViewer = false;
  if (orgId) {
    const [{ data: directory }, { data: myMembership }] = await Promise.all([
      supabase.rpc("org_member_directory", { _org_id: orgId }),
      supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    actionMembers = (directory ?? []) as typeof actionMembers;
    isViewer = myMembership?.role === "viewer";
  }
  const actionContext = {
    members: actionMembers,
    currentUserId: user.id,
    readOnly: isViewer,
  };

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

  // Full-resolution original (migration 0023) — nullable: older photos and
  // any upload where the best-effort original save failed have none. Mint
  // its own signed URL only when a path exists.
  const originalStoragePath = (photo as { original_storage_path?: string | null }).original_storage_path ?? null;
  let originalPhotoUrl: string | null = null;
  if (originalStoragePath) {
    const { data: signedOriginal } = await supabase.storage
      .from("photos")
      .createSignedUrl(originalStoragePath, 60 * 60);
    originalPhotoUrl = signedOriginal?.signedUrl ?? null;
  }

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
          {/* Shows "← Back to my actions" when the visitor arrived from an
              assignment email (#finding-…) or the Actions board. */}
          <PhotoBackLink />
          <div>
            <Link
              href={`/inspections/${inspectionId}`}
              className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
            >
              ← Inspection
            </Link>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            {photo.photo_location || "Photo"}
          </h1>
          {summary?.text ? (
            <p className="mt-1 text-sm leading-relaxed text-[var(--fg-muted)]">
              {summary.text}
            </p>
          ) : null}
          {summary ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-[var(--fg-subtle)]">
              <span>Image quality: {summary.imageQuality ?? "—"}</span>
              {typeof summary.confidence === "number" ? (
                <span className="inline-flex items-center gap-1">
                  · AI confidence {Math.round(summary.confidence * 100)}%
                  <HelpTip title="AI confidence" side="bottom">
                    How sure the AI is about what it SAW, not about the code.
                    Under ~70%, look again in person: re-shoot closer and
                    straight-on, or tell it what&apos;s actually there.
                  </HelpTip>
                </span>
              ) : null}
              {latestAiDurationMs > 0 ? (
                <span>· analyzed in {formatDuration(latestAiDurationMs)}</span>
              ) : null}
              {totalAiRuns > 1 ? (
                <span>
                  · {totalAiRuns} runs ({formatDuration(cumulativeAiMs)} total)
                </span>
              ) : null}
              {latestAiModel ? <span>· {shortModelName(latestAiModel)}</span> : null}
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

        {/* Full-resolution original (migration 0023). The viewer above shows
            the 1024px analysis copy; this opens the untouched camera file in
            a new tab, where the browser's native pinch/scroll zoom does the
            rest. Absent on older photos and on uploads where the best-effort
            original save failed. */}
        {originalPhotoUrl ? (
          <p className="flex items-center gap-1.5 px-1 text-xs text-[var(--fg-muted)]">
            <a
              href={originalPhotoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--accent)] underline"
            >
              View full-resolution original ↗
            </a>
            <HelpTip title="Original photo">
              The image above is the 1024px copy Chip analyzed. This opens the
              untouched file from the camera, so a surveyor or insurer can zoom
              into fine detail — a gauge needle, a label, a hairline crack. The
              photo&apos;s SHA-256 fingerprint on record was taken from this
              exact file, so it doubles as proof it hasn&apos;t been altered
              since capture.
            </HelpTip>
          </p>
        ) : null}

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

        {/* Findings — FIRST after the photo. This is what the inspector
            (and the manager arriving from an assignment email) came for. */}
        <section className="flex flex-col gap-3">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Findings · {sortedFindings.length}
          </h2>
          {sortedFindings.length === 0 ? (
            <Card>
              <p className="text-center text-sm font-medium text-[var(--fg-muted)]">
                No findings on this photo.
              </p>
              <p className="mt-1 text-center text-xs text-[var(--fg-subtle)]">
                Review the &ldquo;What to look for&rdquo; list below before
                clearing it — or add a finding yourself if Chip missed one.
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
                    actionContext={actionContext}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* LifeSafetyWiki: decoded sections + articles behind these
              findings. Async server component; renders nothing if LSW is
              unreachable or has nothing indexed for them. */}
          {sortedFindings.length > 0 ? (
            <LswLearnMore
              findings={sortedFindings.map((f) => ({
                title: (f.title as string | null) ?? null,
                code: (f.code as string | null) ?? null,
              }))}
            />
          ) : null}

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

        {/* AI tuning — Coach + Deep analyze — behind ONE disclosure below
            the findings. Both re-run Chip; neither is part of the normal
            loop, so they shouldn't sit between the photo and its findings. */}
        <details className="cl-card group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="font-medium text-[var(--fg)]">
                Not what you expected? Coach Chip or re-analyze
              </span>
              <HelpTip title="Not what you expected?" side="bottom">
                Deep analyze re-runs a stronger model after asking a few
                questions that change which code applies. Coach is a
                conversation — you say what to look at. Findings you wrote or
                edited are always preserved.
              </HelpTip>
            </span>
            <span
              aria-hidden
              className="shrink-0 text-[var(--fg-subtle)] transition group-open:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-[var(--border)] px-5 pb-5 pt-4 sm:px-6">
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

            {/* Deep re-analyze (stronger model, with optional clarifying questions) */}
            <Card variant="tinted-teal">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="font-medium text-[var(--fg)]">Deep analyze</p>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    &ldquo;Deep analyze&rdquo; first asks a few clarifying
                    questions (occupancy, sprinkler status, fire-rated doors,
                    egress role) so Chip can apply the right code section —
                    recommended when the call could swing on context.
                    &ldquo;Skip questions&rdquo; re-runs the stronger model
                    against the photo alone. Findings you wrote or edited are
                    preserved.
                  </p>
                </div>
                <DeepReanalyzeFlow photoId={photo.id} />
              </div>
            </Card>
          </div>
        </details>

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

        {/* Delete photo — confirm names the finding count; errors toast. */}
        {!isInspectionCompleted ? (
          <Card>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-[var(--fg)]">Remove this photo</p>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  Deletes the photo and{" "}
                  {sortedFindings.length === 0
                    ? "anything Chip noted on it"
                    : `its ${sortedFindings.length} finding${sortedFindings.length === 1 ? "" : "s"}`}
                  . This cannot be undone.
                </p>
              </div>
              <DeletePhotoButton
                photoId={photo.id}
                inspectionId={inspectionId}
                findingsCount={sortedFindings.length}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
