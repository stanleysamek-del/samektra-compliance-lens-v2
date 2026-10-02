"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChecklistItemRow } from "@/lib/checklists/engine";
import { lswLinksForCitation } from "@/lib/lsw-links";
import { HelpTip } from "@/components/help-tip";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/severity-badge";
import { severityColor } from "@/lib/severity";
import { ActionStrip, type ActionFields, type OrgMember } from "@/components/action-strip";
import { showToast } from "@/components/toaster";
import { uploadInspectionPhoto } from "@/lib/upload-inspection-photo";
import { createChecklistFinding, linkChecklistPhoto } from "@/app/actions/checklist";

/**
 * One checklist question, SafetyCulture-style: the answer, then the
 * evidence for it in the same place — photo, note, and a corrective
 * action with owner and due date. Answering "No" opens the note right
 * away and lists what's still missing (describe · photo · action), so a
 * deficiency is fully recorded without leaving the question.
 */

export type LinkedFinding = {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
  action: ActionFields;
};

export type ActionContext = {
  members: OrgMember[];
  currentUserId: string;
  /** Viewers: actions render read-only. */
  readOnly: boolean;
};

const ANSWER_LABELS: Array<{ value: "yes" | "no" | "na"; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N.A." },
];

const SEVERITIES: Array<"High" | "Medium" | "Low"> = ["High", "Medium", "Low"];

/** First line of the note minus the "AI: " prefix — a sensible action title. */
function suggestedTitle(item: ChecklistItemRow): string {
  const fromNote = (item.note ?? "")
    .split("\n")
    .map((l) => l.replace(/^AI:\s*/, "").trim())
    .find(Boolean);
  return fromNote ?? `Not compliant: ${item.question}`;
}

export function ChecklistItemRowView({
  item,
  index,
  inspectionId,
  readOnly,
  photoUrl,
  linkedFinding,
  actionContext,
  onAnswer,
  onConfirm,
  onSaveNote,
  onPatch,
  onSaveValue,
}: {
  item: ChecklistItemRow;
  index: number;
  inspectionId: string;
  readOnly: boolean;
  photoUrl: string | null;
  linkedFinding: LinkedFinding | null;
  actionContext: ActionContext;
  onAnswer: (item: ChecklistItemRow, value: "yes" | "no" | "na") => void;
  onConfirm: (item: ChecklistItemRow) => void;
  onSaveNote: (note: string) => Promise<boolean>;
  /** Optimistic local patch (photo/finding links) until the refresh lands. */
  onPatch: (patch: Partial<ChecklistItemRow>) => void;
  /** Text / number answer (migration 0034 question types). */
  onSaveValue: (value: string) => Promise<boolean>;
}) {
  const router = useRouter();
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note ?? "");
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [photoStatus, setPhotoStatus] = useState<"idle" | "uploading" | "failed">("idle");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionTitle, setActionTitle] = useState("");
  const [actionSeverity, setActionSeverity] = useState<"High" | "Medium" | "Low">("Medium");
  const [creating, startCreate] = useTransition();
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const label = `${item.section_code}.${index}`;
  const aiPending = item.answered_by_ai && !item.ai_confirmed;
  const type = item.response_type ?? "yesno";
  const isNo = type === "yesno" && item.answer === "no";
  const hasNote = Boolean(item.note && item.note.trim());
  const hasPhoto = Boolean(item.photo_id || localPreview);
  const hasAction = Boolean(item.finding_id);
  const thumb = localPreview ?? photoUrl;

  function answer(value: "yes" | "no" | "na") {
    // Tapping No on a question with no note: open the note so the
    // inspector describes the problem while standing in front of it.
    if (value === "no" && item.answer !== "no" && !hasNote && !readOnly) {
      setNoteDraft("");
      setEditingNote(true);
    }
    onAnswer(item, value);
  }

  function saveNote() {
    setEditingNote(false);
    setNoteStatus("saving");
    const draft = noteDraft;
    startTransition(async () => {
      const ok = await onSaveNote(draft);
      if (ok) {
        setNoteStatus("saved");
      } else {
        // Keep what they typed — reopen the editor so nothing is lost.
        setNoteStatus("failed");
        setNoteDraft(draft);
        setEditingNote(true);
      }
    });
  }

  async function onPhotoPicked(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast({ kind: "error", message: "That file isn't a photo." });
      return;
    }
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setPhotoStatus("uploading");
    try {
      // Evidence photos are manual captures: no AI run, no credits.
      const { httpOk, status, json } = await uploadInspectionPhoto({
        file,
        inspectionId,
        useAi: false,
        photoLocation: `${label} ${item.section_title}`.slice(0, 200),
      });
      if (!httpOk || !json.ok || !json.photoId) {
        throw new Error(json.error ?? `Upload failed (HTTP ${status}).`);
      }
      const res = await linkChecklistPhoto({ itemId: item.id, inspectionId, photoId: json.photoId });
      if (!res.ok) throw new Error(res.error ?? "Photo saved, but it couldn't be linked to the question.");
      onPatch({ photo_id: json.photoId });
      setPhotoStatus("idle");
      showToast({ kind: "success", message: `Photo added to ${label}.` });
      router.refresh();
    } catch (err) {
      setPhotoStatus("failed");
      setLocalPreview(null);
      URL.revokeObjectURL(preview);
      showToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Couldn't upload the photo.",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function openActionForm() {
    setActionTitle(suggestedTitle(item));
    setActionSeverity("Medium");
    setActionOpen(true);
  }

  function createAction() {
    startCreate(async () => {
      try {
        const res = await createChecklistFinding({
          itemId: item.id,
          inspectionId,
          title: actionTitle,
          severity: actionSeverity,
          description: item.note,
        });
        if (!res.ok || !res.findingId) {
          showToast({ kind: "error", message: res.error ?? "Couldn't create the action." });
          return;
        }
        onPatch({ finding_id: res.findingId });
        setActionOpen(false);
        showToast({ kind: "success", message: "Action created — assign an owner and due date below." });
        router.refresh();
      } catch {
        showToast({ kind: "error", message: "Couldn't create the action — check your connection." });
      }
    });
  }

  return (
    <div
      id={`q-${item.id}`}
      tabIndex={-1}
      className={`scroll-mt-40 rounded border px-3 py-2.5 outline-none ${
        isNo ? "border-[var(--danger)] bg-[#fdecea]" : "border-[var(--border)] bg-[var(--paper-2)]"
      }`}
    >
      {/* Question + answer */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-[var(--fg)]">
          <span className="mr-1.5 text-xs tabular-nums text-[var(--fg-subtle)]">{label}</span>
          {item.question}
          {item.required ? (
            <span className="ml-1.5 whitespace-nowrap text-xs font-semibold text-[var(--danger)]">
              <span aria-hidden>* </span>Required
            </span>
          ) : null}
          {item.code_ref ? <CodeRef codeRef={item.code_ref} /> : null}
        </p>
        {type !== "yesno" ? (
          <ValueAnswer item={item} label={label} readOnly={readOnly} onSave={onSaveValue} />
        ) : (
        <div
          role="group"
          aria-label={`Answer for ${label}`}
          className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto sm:shrink-0"
        >
          {ANSWER_LABELS.map(({ value, label: text }) => {
            const active = item.answer === value;
            return (
              <button
                key={value}
                type="button"
                disabled={readOnly}
                aria-pressed={active}
                onClick={() => answer(value)}
                className={`min-h-11 rounded border px-3 text-sm font-semibold transition sm:min-w-[56px] ${
                  active
                    ? value === "yes"
                      ? "border-[var(--success)] bg-[var(--success)] text-white"
                      : value === "no"
                        ? "border-[var(--danger)] bg-[var(--danger)] text-white"
                        : "border-[var(--slate)] bg-[var(--slate)] text-white"
                    : "border-[var(--rule-strong)] bg-[var(--paper-2)] text-[var(--ink)] hover:bg-[var(--paper-3)]"
                } ${readOnly ? "cursor-default opacity-60" : ""}`}
              >
                {active && value === "yes" ? "✓ " : active && value === "no" ? "✕ " : ""}
                {text}
              </button>
            );
          })}
        </div>
        )}
      </div>

      {aiPending ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-[var(--accent)]/10 px-2.5 py-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
            ✦ AI flagged
            <HelpTip title="AI flagged" side="bottom">
              A photo you uploaded matched this question, so the AI answered
              it. Nothing is final until you confirm — tap Confirm to agree,
              or Yes / No / N.A. to overrule. The report marks unconfirmed
              answers as AI-answered.
            </HelpTip>
          </span>
          {!readOnly ? (
            <Button variant="outline" size="sm" onClick={() => onConfirm(item)}>
              Confirm
            </Button>
          ) : null}
          <span className="text-[11px] text-[var(--fg-muted)]">or change the answer above</span>
        </div>
      ) : null}

      {/* "No" checklist: what a complete deficiency record still needs. */}
      {isNo && !readOnly && !(hasNote && hasPhoto && hasAction) ? (
        <p className="mt-2 text-xs font-medium text-[var(--danger)]">
          Record the deficiency:{" "}
          <Need done={hasNote}>describe</Need> · <Need done={hasPhoto}>photo</Need> ·{" "}
          <Need done={hasAction}>action</Need>
        </p>
      ) : null}

      {/* Evidence: photo thumbnail + note */}
      {thumb || item.photo_id || hasNote || editingNote ? (
        <div className="mt-2 flex items-start gap-3">
          {thumb || item.photo_id ? (
            <Link
              href={item.photo_id ? `/inspections/${inspectionId}/photos/${item.photo_id}` : "#"}
              className="relative block h-16 w-20 shrink-0 overflow-hidden rounded border border-[var(--border)] bg-[#0a0d12]"
              aria-label={`Open the photo for ${label}`}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-[10px] text-white/80">Photo</span>
              )}
              {photoStatus === "uploading" ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] font-medium text-white">
                  Saving…
                </span>
              ) : null}
            </Link>
          ) : null}

          <div className="min-w-0 flex-1">
            {editingNote ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`note-${item.id}`} className="sr-only">
                  Note for {label}
                </label>
                <textarea
                  id={`note-${item.id}`}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  autoFocus
                  className="cl-input text-sm"
                  placeholder={isNo ? "What's wrong, and where? e.g. Door 5-112 doesn't latch" : "What you observed, room number, notes…"}
                />
                {noteStatus === "failed" ? (
                  <span className="text-[11px] text-red-700">Not saved yet — tap Save note to retry.</span>
                ) : null}
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={saveNote}>
                    Save note
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingNote(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : hasNote ? (
              <p className="whitespace-pre-wrap text-sm text-[var(--fg-muted)]">
                {item.note}
                {noteStatus === "saving" ? (
                  <span className="ml-2 text-[11px] text-[var(--fg-subtle)]">Saving…</span>
                ) : noteStatus === "saved" ? (
                  <span className="ml-2 text-[11px] text-[var(--success)]">Saved</span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Linked action (finding) with owner / due date / status */}
      {hasAction && linkedFinding ? (
        <div className="mt-2 rounded border border-[var(--border)] bg-[var(--paper-2)]">
          <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
            <SeverityBadge severity={linkedFinding.severity} size="sm" />
            <span className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">{linkedFinding.title}</span>
          </div>
          <ActionStrip
            findingId={linkedFinding.id}
            inspectionId={inspectionId}
            action={linkedFinding.action}
            members={actionContext.members}
            currentUserId={actionContext.currentUserId}
            readOnly={readOnly || actionContext.readOnly}
          />
        </div>
      ) : hasAction ? (
        <p className="mt-2 text-xs text-[var(--fg-muted)]">Action linked — loading…</p>
      ) : null}

      {/* New action form */}
      {actionOpen && !hasAction ? (
        <div className="mt-2 flex flex-col gap-2 rounded border border-[var(--ink)] bg-[var(--paper-2)] p-3">
          <label htmlFor={`action-${item.id}`} className="cl-label">
            Action — what needs fixing
          </label>
          <input
            id={`action-${item.id}`}
            className="cl-input"
            value={actionTitle}
            onChange={(e) => setActionTitle(e.target.value)}
            maxLength={300}
          />
          <div role="radiogroup" aria-label="Severity" className="flex flex-wrap gap-1.5">
            {SEVERITIES.map((s) => {
              const sev = severityColor(s);
              const selected = actionSeverity === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setActionSeverity(s)}
                  className="min-h-11 rounded-full border px-3 text-sm font-semibold transition"
                  style={
                    selected
                      ? { background: sev.solid, borderColor: sev.solid, color: sev.onSolid }
                      : { borderColor: "var(--rule-strong)", color: "var(--ink)" }
                  }
                >
                  <span aria-hidden className="mr-1">
                    {sev.glyph}
                  </span>
                  {s}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" loading={creating} loadingLabel="Creating…" onClick={createAction}>
              Create action
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setActionOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-[var(--fg-muted)]">
            You&apos;ll assign an owner and due date right after.
          </p>
        </div>
      ) : null}

      {/* Evidence toolbar — labelled when the answer is No (that's when
          evidence is expected), compact icons otherwise so a long
          checklist stays scannable. */}
      {!readOnly ? (
        <div className={`mt-2 flex flex-wrap gap-1.5 ${isNo ? "" : "justify-end"}`}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPhotoPicked(e.target.files?.[0])}
          />
          <EvidenceButton
            onClick={() => fileRef.current?.click()}
            disabled={photoStatus === "uploading"}
            done={hasPhoto}
            compact={!isNo}
            icon={<CameraGlyph />}
          >
            {photoStatus === "uploading" ? "Saving photo…" : hasPhoto ? "Replace photo" : "Photo"}
          </EvidenceButton>
          {!editingNote ? (
            <EvidenceButton
              onClick={() => {
                setNoteDraft(item.note ?? "");
                setEditingNote(true);
              }}
              done={hasNote}
              compact={!isNo}
              icon={<NoteGlyph />}
            >
              {hasNote ? "Edit note" : "Note"}
            </EvidenceButton>
          ) : null}
          {!hasAction && !actionOpen ? (
            <EvidenceButton
              onClick={openActionForm}
              done={false}
              compact={!isNo}
              icon={<FlagGlyph />}
              emphasize={isNo}
            >
              Action
            </EvidenceButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Text / number answer. Saves when the field loses focus (or Enter on a
 * number), with a visible saving / saved / not-saved state.
 */
function ValueAnswer({
  item,
  label,
  readOnly,
  onSave,
}: {
  item: ChecklistItemRow;
  label: string;
  readOnly: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const isNumber = item.response_type === "number";
  const saved =
    isNumber
      ? item.value_number === null || item.value_number === undefined
        ? ""
        : String(item.value_number)
      : (item.value_text ?? "");
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [, start] = useTransition();
  // Adopt a server value that changed underneath (another device, refresh).
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    if (status !== "saving") setDraft(saved);
  }

  function commit() {
    if (readOnly || draft.trim() === saved.trim()) return;
    setStatus("saving");
    const value = draft;
    start(async () => {
      const ok = await onSave(value);
      setStatus(ok ? "saved" : "failed");
    });
  }

  const id = `value-${item.id}`;
  return (
    <div className="flex w-full flex-col gap-1 sm:max-w-sm">
      <label htmlFor={id} className="sr-only">
        Answer for {label}
      </label>
      {isNumber ? (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={draft}
            disabled={readOnly}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            className="cl-input w-40"
            placeholder="0"
          />
          {item.unit ? <span className="text-sm text-[var(--fg-muted)]">{item.unit}</span> : null}
        </div>
      ) : (
        <textarea
          id={id}
          value={draft}
          disabled={readOnly}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={2}
          maxLength={4000}
          className="cl-input text-sm"
          placeholder="Type the answer"
        />
      )}
      <span aria-live="polite" className="min-h-4 text-xs">
        {status === "saving" ? (
          <span className="text-[var(--fg-subtle)]">Saving…</span>
        ) : status === "saved" ? (
          <span className="text-[var(--success)]">Saved</span>
        ) : status === "failed" ? (
          <span className="text-[var(--danger)]">Not saved — change it and try again.</span>
        ) : null}
      </span>
    </div>
  );
}

function EvidenceButton({
  children,
  onClick,
  disabled = false,
  done,
  icon,
  emphasize = false,
  compact = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  done: boolean;
  icon: React.ReactNode;
  emphasize?: boolean;
  /** Icon-only (label becomes the accessible name + tooltip). */
  compact?: boolean;
}) {
  const label = typeof children === "string" ? children : undefined;
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
        className={`inline-flex h-11 w-11 items-center justify-center rounded border transition disabled:opacity-60 sm:h-9 sm:w-9 ${
          done
            ? "border-[var(--success)] text-[var(--success)]"
            : "border-transparent text-[var(--fg-muted)] hover:border-[var(--rule-strong)] hover:text-[var(--ink)]"
        }`}
      >
        <span aria-hidden>{icon}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded border px-3 text-sm font-medium transition disabled:opacity-60 sm:min-h-9 ${
        emphasize
          ? "border-[var(--danger)] bg-[var(--paper-2)] text-[var(--danger)] hover:bg-[#fdecea]"
          : "border-[var(--rule-strong)] bg-[var(--paper-2)] text-[var(--ink)] hover:bg-[var(--paper-3)]"
      }`}
    >
      <span aria-hidden className={done ? "text-[var(--success)]" : ""}>
        {done ? "✓" : icon}
      </span>
      {children}
    </button>
  );
}

function Need({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <span className={done ? "text-[var(--success)] line-through decoration-1" : ""}>
      {done ? "✓ " : ""}
      {children}
    </span>
  );
}

function CodeRef({ codeRef }: { codeRef: string }) {
  const lsw = lswLinksForCitation(codeRef)[0];
  return lsw ? (
    <a
      href={lsw.url}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-1.5 whitespace-nowrap text-[11px] text-[var(--accent)] underline decoration-dotted underline-offset-2"
      title="Read this section on LifeSafetyWiki"
    >
      {codeRef} ↗
    </a>
  ) : (
    <span className="ml-1.5 whitespace-nowrap text-[11px] text-[var(--fg-subtle)]">{codeRef}</span>
  );
}

function CameraGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}
function NoteGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    </svg>
  );
}
function FlagGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4m0 0h11l-2 4 2 4H5" />
    </svg>
  );
}
