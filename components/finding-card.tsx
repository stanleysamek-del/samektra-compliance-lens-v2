"use client";

import { useState, useTransition } from "react";
import { LswLinks } from "@/components/lsw-links";
import {
  updateFinding,
  deleteFinding,
  rateFinding,
  type FindingPatch,
} from "@/app/inspections/[id]/photos/[photoId]/actions";
import { BboxPicker, type Bbox } from "@/components/bbox-picker";
import {
  ActionStrip,
  type ActionFields,
  type OrgMember,
} from "@/components/action-strip";
import { showToast } from "@/components/toaster";
import { severityColor } from "@/lib/severity";
import { PlaceOnPlanButton } from "@/components/plans/place-on-plan-button";

/** Everything "Place on plan" needs; the photo page passes it. */
export type FindingPlanContext = {
  facilityId: string | null;
  inspectionId: string;
  /** This finding's existing pin, when the page loaded one. */
  existingPin?: { id: string; planName: string } | null;
  readOnly?: boolean;
};

export type FindingRow = {
  id: string;
  inspection_id: string;
  title: string;
  category: string;
  code: string | null;
  severity: "Low" | "Medium" | "High";
  description: string | null;
  location: string | null;
  remediation: string | null;
  references: string[] | null;
  ai_confidence: number | null;
  edited: boolean;
  bbox_x1: number | null;
  bbox_y1: number | null;
  bbox_x2: number | null;
  bbox_y2: number | null;
  /** 1 = thumbs-up, -1 = thumbs-down, null = no feedback. */
  user_rating?: number | null;
  // Corrective-action fields (migration 0019). Optional so render sites
  // that don't select them keep compiling — the strip only shows when
  // the page passes `actionContext`.
  cap_status?: ActionFields["cap_status"];
  priority?: ActionFields["priority"];
  cap_target_date?: string | null;
  assigned_to?: string | null;
  assigned_email?: string | null;
  action_closed_at?: string | null;
  closure_note?: string | null;
  closure_photo_id?: string | null;
};

const CATEGORIES = [
  "Fire",
  "Electrical",
  "Egress",
  "ADA",
  "Hazmat",
  "InfectionControl",
  "Structural",
  "Other",
] as const;

const SEVERITIES = ["Low", "Medium", "High"] as const;

export function FindingCard({
  finding,
  index,
  photoUrl,
  actionContext,
  planContext,
}: {
  finding: FindingRow;
  index: number;
  /** If provided, edit mode shows a BboxPicker on the photo so the user can
   *  add/move/resize/clear the annotation for this finding. */
  photoUrl?: string | null;
  /** If provided, renders the corrective-action workflow strip
   *  (assign / due / status / close-out / comments) under the card. */
  actionContext?: {
    members: OrgMember[];
    currentUserId: string;
    readOnly?: boolean;
  };
  /** If provided, renders the "Place on plan" control (migration 0025). */
  planContext?: FindingPlanContext;
}) {
  const initialBbox: Bbox | null =
    finding.bbox_x1 != null &&
    finding.bbox_y1 != null &&
    finding.bbox_x2 != null &&
    finding.bbox_y2 != null
      ? {
          x1: Number(finding.bbox_x1),
          y1: Number(finding.bbox_y1),
          x2: Number(finding.bbox_x2),
          y2: Number(finding.bbox_y2),
        }
      : null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FindingPatch>({
    title: finding.title,
    category: finding.category,
    code: finding.code ?? "",
    severity: finding.severity,
    description: finding.description ?? "",
    location: finding.location ?? "",
    remediation: finding.remediation ?? "",
  });
  // Bbox draft: undefined means "no change", null means "clear", object means "new value".
  const [bboxDraft, setBboxDraft] = useState<Bbox | null | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  // Local optimistic copy of the rating so the buttons feel snappy. The
  // server is the source of truth on next page load.
  const [localRating, setLocalRating] = useState<number | null>(
    finding.user_rating ?? null,
  );

  function rate(next: 1 | -1) {
    // Toggling the same rating clears it.
    const previous = localRating;
    const target = previous === next ? null : next;
    setLocalRating(target);
    startTransition(async () => {
      const res = await rateFinding(finding.id, finding.inspection_id, target);
      if (!res.ok) {
        // Revert the optimistic flip so the UI never claims a rating the
        // server didn't record.
        setLocalRating(previous);
        showToast({ kind: "error", message: res.error });
      }
    });
  }

  function save() {
    if (!draft.title.trim()) {
      showToast({ kind: "error", message: "A finding needs a title." });
      return;
    }
    startTransition(async () => {
      const patch: FindingPatch = { ...draft };
      if (bboxDraft !== undefined) {
        patch.bbox = bboxDraft;
      }
      const res = await updateFinding(finding.id, finding.inspection_id, patch);
      if (!res.ok) {
        // Stay in edit mode — the draft + bbox draft are still in state.
        showToast({ kind: "error", message: res.error });
        return;
      }
      setBboxDraft(undefined);
      setEditing(false);
    });
  }

  function remove() {
    if (!confirm("Delete this finding? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await deleteFinding(finding.id, finding.inspection_id);
      if (!res.ok) showToast({ kind: "error", message: res.error });
    });
  }

  const sev = severityColor(finding.severity);

  return (
    <div className="cl-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
              style={{ background: "rgba(15,21,24,0.06)", color: "var(--slate)" }}
            >
              #{index + 1}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: sev.bg, color: sev.fg }}
            >
              {finding.severity}
            </span>
            <span className="text-[11px] font-medium text-[var(--fg-muted)]">
              {finding.category}
            </span>
            {finding.code ? (
              <span className="text-[11px] font-medium text-[var(--fg-muted)]">
                · {finding.code}
              </span>
            ) : null}
            {finding.edited ? (
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--primary)]">
                edited
              </span>
            ) : finding.ai_confidence != null ? (
              <span className="text-[10px] text-[var(--fg-subtle)]">
                AI · {Math.round((finding.ai_confidence ?? 0) * 100)}%
              </span>
            ) : null}
          </div>
          {!editing ? (
            <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--fg)]">
              {finding.title}
            </h3>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!editing ? (
            <>
              {/* Feedback buttons — feed the AI on the next Coach turn. */}
              <button
                type="button"
                title={
                  localRating === 1
                    ? "Remove thumbs-up"
                    : "Good call — AI will see this on the next Coach turn"
                }
                aria-label="Thumbs up"
                disabled={isPending}
                onClick={() => rate(1)}
                className={[
                  "flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md px-1.5 py-1 text-sm transition-all duration-150 active:scale-90 hover:bg-white/[0.06] sm:min-h-0 sm:min-w-0",
                  localRating === 1
                    ? "text-[#607a3a] scale-110"
                    : "text-[var(--fg-subtle)] hover:text-[var(--fg)]",
                ].join(" ")}
              >
                <ThumbsUpIcon filled={localRating === 1} />
              </button>
              <button
                type="button"
                title={
                  localRating === -1
                    ? "Remove thumbs-down"
                    : "Wrong call — AI will see this on the next Coach turn"
                }
                aria-label="Thumbs down"
                disabled={isPending}
                onClick={() => rate(-1)}
                className={[
                  "flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md px-1.5 py-1 text-sm transition-all duration-150 active:scale-90 hover:bg-white/[0.06] sm:min-h-0 sm:min-w-0",
                  localRating === -1
                    ? "text-[#a8362b] scale-110"
                    : "text-[var(--fg-subtle)] hover:text-[var(--fg)]",
                ].join(" ")}
              >
                <ThumbsDownIcon filled={localRating === -1} />
              </button>
              <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-h-[40px] rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.04] hover:text-[var(--fg)] sm:min-h-0"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={remove}
                className="min-h-[40px] rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.04] hover:text-[#a8362b] sm:min-h-0"
              >
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setEditing(false)}
                className="min-h-[40px] rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.04] hover:text-[var(--fg)] sm:min-h-0"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                aria-busy={isPending}
                onClick={save}
                className="min-h-[40px] rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Title">
            <input
              type="text"
              className="cl-input"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severity">
              <select
                className="cl-input"
                value={draft.severity}
                onChange={(e) =>
                  setDraft({ ...draft, severity: e.target.value as "Low" | "Medium" | "High" })
                }
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                className="cl-input"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Code">
            <input
              type="text"
              className="cl-input"
              placeholder="e.g., NFPA 101"
              value={draft.code ?? ""}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
          </Field>
          <Field label="Location">
            <input
              type="text"
              className="cl-input"
              value={draft.location ?? ""}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="cl-input min-h-[88px] py-2.5"
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
          <Field label="Remediation">
            <textarea
              className="cl-input min-h-[88px] py-2.5"
              value={draft.remediation ?? ""}
              onChange={(e) => setDraft({ ...draft, remediation: e.target.value })}
            />
          </Field>

          {/* Bbox editor: lets the inspector add, move, resize, or clear the
              red box drawn on the photo for this finding. */}
          {photoUrl ? (
            <Field label="Mark on photo">
              <div className="flex flex-col gap-2">
                <BboxPicker
                  src={photoUrl}
                  initial={
                    bboxDraft === undefined ? initialBbox : bboxDraft
                  }
                  onChange={(b) => setBboxDraft(b)}
                />
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--fg-subtle)]">
                    {bboxDraft === undefined
                      ? initialBbox
                        ? "Drag inside to move, corners to resize. Changes save with the rest of the form."
                        : "No box yet — click and drag on the photo to add one."
                      : bboxDraft === null
                        ? "Box will be cleared on save."
                        : "Box will be updated on save."}
                  </span>
                  {(() => {
                    const effective = bboxDraft === undefined ? initialBbox : bboxDraft;
                    return effective ? (
                      <button
                        type="button"
                        onClick={() => setBboxDraft(null)}
                        className="rounded-full px-2 py-0.5 text-[var(--fg-muted)] underline-offset-2 hover:text-[#a8362b] hover:underline"
                      >
                        Remove box
                      </button>
                    ) : null;
                  })()}
                </div>
              </div>
            </Field>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2 text-sm">
          {finding.description ? (
            <p className="leading-relaxed text-[var(--fg-muted)]">
              {finding.description}
            </p>
          ) : null}
          {finding.location ? (
            <p className="text-xs text-[var(--fg-subtle)]">
              <span className="font-medium uppercase tracking-wider">Location · </span>
              {finding.location}
            </p>
          ) : null}
          {finding.remediation ? (
            <div className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--primary)]">
                Remediation
              </p>
              <p className="mt-1 leading-relaxed text-[var(--fg-muted)]">
                {finding.remediation}
              </p>
            </div>
          ) : null}
          {finding.references && finding.references.length > 0 ? (
            <p className="text-xs text-[var(--fg-subtle)]">
              <span className="font-medium uppercase tracking-wider">References · </span>
              {finding.references.join(", ")}
            </p>
          ) : null}
          <LswLinks code={finding.code} />
          {planContext ? (
            <div className="mt-1">
              <PlaceOnPlanButton
                facilityId={planContext.facilityId}
                inspectionId={planContext.inspectionId}
                kind="finding"
                findingId={finding.id}
                label={finding.title}
                existingPin={planContext.existingPin ?? null}
                readOnly={planContext.readOnly}
                compact
              />
            </div>
          ) : null}
        </div>
      )}

      {actionContext ? (
        <ActionStrip
          findingId={finding.id}
          inspectionId={finding.inspection_id}
          action={{
            cap_status: finding.cap_status ?? "open",
            priority: finding.priority ?? "medium",
            cap_target_date: finding.cap_target_date ?? null,
            assigned_to: finding.assigned_to ?? null,
            assigned_email: finding.assigned_email ?? null,
            action_closed_at: finding.action_closed_at ?? null,
            closure_note: finding.closure_note ?? null,
            closure_photo_id: finding.closure_photo_id ?? null,
          }}
          members={actionContext.members}
          currentUserId={actionContext.currentUserId}
          readOnly={actionContext.readOnly}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col">
      <span className="cl-label">{label}</span>
      {children}
    </label>
  );
}

function ThumbsUpIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Z" />
      <path d="M7 11 11 3a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17.5 19H7" />
    </svg>
  );
}

function ThumbsDownIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3Z" />
      <path d="M17 13 13 21a2 2 0 0 1-2-2v-4H5.5a2 2 0 0 1-2-2.3l1-6A2 2 0 0 1 6.5 5H17" />
    </svg>
  );
}
