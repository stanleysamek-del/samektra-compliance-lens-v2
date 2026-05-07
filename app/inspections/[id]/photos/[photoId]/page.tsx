import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { FindingCard, type FindingRow } from "@/components/finding-card";
import { PhotoEditor } from "@/components/photo-editor";
import { DeepReanalyzeFlow } from "@/components/deep-reanalyze-flow";
import { AddFindingForm } from "@/components/add-finding-form";
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

  const { data: photo } = await supabase
    .from("photos")
    .select("id, storage_path, width, height, photo_location, raw_analysis, analyzed_at, annotations")
    .eq("id", photoId)
    .eq("inspection_id", inspectionId)
    .maybeSingle();
  if (!photo) notFound();

  const { data: findings } = await supabase
    .from("findings")
    .select(
      "id, inspection_id, title, category, code, severity, description, location, remediation, references, ai_confidence, edited, bbox_x1, bbox_y1, bbox_x2, bbox_y2, bbox_stroke_width, bbox_color",
    )
    .eq("photo_id", photoId)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: true });

  const sortedFindings = (findings ?? []).slice().sort((a, b) => {
    const order = { High: 0, Medium: 1, Low: 2 } as const;
    return (
      (order[a.severity as keyof typeof order] ?? 3) -
      (order[b.severity as keyof typeof order] ?? 3)
    );
  });

  const { data: wtlf } = await supabase
    .from("what_to_look_for")
    .select("id, item, details")
    .eq("photo_id", photoId);

  const { data: notVisible } = await supabase
    .from("not_visible")
    .select("id, item, reason, resolved")
    .eq("photo_id", photoId);

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

        {/* Not visible */}
        {notVisible && notVisible.length > 0 ? (
          <Card>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--warning)]">
              Not visible — re-photograph
            </h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {notVisible.map((n) => (
                <li key={n.id}>
                  <p className="font-medium text-[var(--fg)]">{n.item}</p>
                  {n.reason ? (
                    <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                      Reason: {n.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

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
