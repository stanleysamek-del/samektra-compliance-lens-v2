"use client";

import { useState, useTransition } from "react";
import { createLearnedRule } from "@/app/team/rules/actions";

type Props = {
  /** Suggested rule text to pre-fill the textarea. Usually the
   *  inspector's hint that triggered the correction. */
  suggestion?: string;
  /** Optional source IDs to attach to the saved rule for traceability. */
  sourcePhotoId?: string;
  sourceFindingId?: string;
};

/**
 * Inline "Teach Chip this" affordance rendered below an AI bubble in the
 * Coach thread. Click expands a small composer where the inspector can
 * edit the suggested rule text and save it as a permanent org-wide rule.
 *
 * Only meaningful inside a team workspace — when called from personal
 * workspace, the server action surfaces a clean error and we redirect
 * back. We don't hide the button preemptively because the page would
 * need an extra round-trip to detect the workspace context.
 */
export function TeachChipButton({
  suggestion = "",
  sourcePhotoId,
  sourceFindingId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(suggestion);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // Reset to the latest suggestion each open so a re-run after a
          // hint change picks up the new pre-fill.
          setText(suggestion);
        }}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition hover:bg-white/[0.05]"
        style={{
          borderColor: "var(--gold)",
          color: "var(--ink)",
          background: "rgba(200,155,60,0.10)",
        }}
        title="Save this correction as a permanent rule Chip will apply on every photo"
      >
        <BrainIcon /> Teach Chip this
      </button>
    );
  }

  return (
    <form
      action={(fd) => startTransition(() => createLearnedRule(fd))}
      className="mt-2 flex flex-col gap-2 rounded-lg border p-2.5"
      style={{
        borderColor: "var(--gold)",
        background: "rgba(200,155,60,0.06)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-medium uppercase tracking-[0.14em]"
          style={{
            fontFamily: "var(--font-jetbrains-mono)",
            color: "var(--slate)",
          }}
        >
          New rule for this team
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
        >
          Cancel
        </button>
      </div>
      <textarea
        name="rule_text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        required
        rows={3}
        placeholder="When you see X, always check for Y and emit a Medium NFPA …"
        className="cl-input resize-y py-1.5 text-xs"
        autoFocus
      />
      {sourcePhotoId ? (
        <input type="hidden" name="source_photo_id" value={sourcePhotoId} />
      ) : null}
      {sourceFindingId ? (
        <input
          type="hidden"
          name="source_finding_id"
          value={sourceFindingId}
        />
      ) : null}
      <p className="text-[10px] leading-snug text-[var(--fg-muted)]">
        Saved rules apply to every photo your team analyzes after this.
        Admins can edit or archive them at{" "}
        <span className="font-medium text-[var(--fg)]">
          Team &middot; Chip&apos;s rules
        </span>
        .
      </p>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || text.trim().length === 0}
          className="rounded px-3 py-1 text-[11px] font-semibold transition disabled:opacity-40"
          style={{
            background: "var(--gold)",
            color: "var(--ink)",
          }}
        >
          {pending ? "Saving…" : "Save rule"}
        </button>
      </div>
    </form>
  );
}

function BrainIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4a4 4 0 0 0-4 4v.5a3.5 3.5 0 0 0-2 6.25V18a2 2 0 0 0 2 2h2v-3" />
      <path d="M12 4a4 4 0 0 1 4 4v.5a3.5 3.5 0 0 1 2 6.25V18a2 2 0 0 1-2 2h-2v-3" />
      <path d="M12 4v12" />
    </svg>
  );
}
