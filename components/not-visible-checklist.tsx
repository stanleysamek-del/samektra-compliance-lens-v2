"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  resolveNotVisible,
  unresolveNotVisible,
  skipNotVisible,
  unskipNotVisible,
} from "@/app/inspections/[id]/actions";

export type NotVisibleItem = {
  id: string;
  item: string;
  reason: string | null;
  resolved: boolean;
  resolved_note: string | null;
  resolved_at: string | null;
  skipped: boolean;
  skipped_reason: string | null;
  skipped_at: string | null;
  photo_id: string;
  photo_location: string | null;
  section_name: string | null;
};

type Props = {
  inspectionId: string;
  items: NotVisibleItem[];
  /** Hide all controls when the inspection is finalized. */
  readOnly?: boolean;
};

/**
 * Aggregated "punch-list" of items Chip flagged as not visible across every
 * photo in the inspection. Items have a three-state lifecycle:
 *
 *   OPEN     — still needs work, shown at top with Resolve + Skip buttons
 *   RESOLVED — verified via re-photograph, collapsed under "Resolved" group
 *   SKIPPED  — won't be re-photographed (false positive, out of scope, etc.),
 *              collapsed under "Skipped" group
 *
 * Print button hits window.print(); the inspector can take the list to the
 * site as paper. The print stylesheet (added globally elsewhere when we
 * want one) can hide controls — for now the printed page just looks slightly
 * dense but readable.
 */
export function NotVisibleChecklist({
  inspectionId,
  items,
  readOnly,
}: Props) {
  const [showResolved, setShowResolved] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);

  if (items.length === 0) return null;

  const open = items.filter((i) => !i.resolved && !i.skipped);
  const resolved = items.filter((i) => i.resolved);
  const skipped = items.filter((i) => i.skipped && !i.resolved);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--warning)]">
          Re-photograph punch-list
          <span className="ml-1.5 font-medium text-[var(--fg-subtle)]">
            · {open.length} to do
            {resolved.length > 0 ? ` · ${resolved.length} resolved` : ""}
            {skipped.length > 0 ? ` · ${skipped.length} skipped` : ""}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.print();
          }}
          className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
          title="Open the browser print dialog so you can take this list on your next site visit"
        >
          Print
        </button>
      </div>

      {open.length === 0 ? (
        <div
          className="rounded-lg border px-3 py-2.5 text-xs"
          style={{
            borderColor: "rgba(96,122,58,0.4)",
            background: "rgba(96,122,58,0.08)",
            color: "#607a3a",
          }}
        >
          ✓ Nothing left on the punch-list. Good job.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {open.map((it) => (
            <NotVisibleRow
              key={it.id}
              item={it}
              inspectionId={inspectionId}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}

      {resolved.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="self-start text-[11px] font-medium text-[var(--fg-subtle)] transition hover:text-[var(--fg-muted)]"
          >
            {showResolved ? "▾" : "▸"} {resolved.length} resolved
          </button>
          {showResolved ? (
            <ul className="flex flex-col gap-1.5">
              {resolved.map((it) => (
                <NotVisibleRow
                  key={it.id}
                  item={it}
                  inspectionId={inspectionId}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {skipped.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setShowSkipped((v) => !v)}
            className="self-start text-[11px] font-medium text-[var(--fg-subtle)] transition hover:text-[var(--fg-muted)]"
          >
            {showSkipped ? "▾" : "▸"} {skipped.length} skipped
          </button>
          {showSkipped ? (
            <ul className="flex flex-col gap-1.5">
              {skipped.map((it) => (
                <NotVisibleRow
                  key={it.id}
                  item={it}
                  inspectionId={inspectionId}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type Mode = "idle" | "resolving" | "skipping";

function NotVisibleRow({
  item,
  inspectionId,
  readOnly,
}: {
  item: NotVisibleItem;
  inspectionId: string;
  readOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");

  function resolve() {
    const fd = new FormData();
    fd.append("item_id", item.id);
    fd.append("inspection_id", inspectionId);
    fd.append("note", note.trim());
    fd.append("resolved_photo_id", item.photo_id);
    startTransition(async () => {
      await resolveNotVisible(fd);
      setMode("idle");
      setNote("");
    });
  }

  function skip() {
    const fd = new FormData();
    fd.append("item_id", item.id);
    fd.append("inspection_id", inspectionId);
    fd.append("reason", note.trim());
    startTransition(async () => {
      await skipNotVisible(fd);
      setMode("idle");
      setNote("");
    });
  }

  function reopenResolved() {
    const fd = new FormData();
    fd.append("item_id", item.id);
    fd.append("inspection_id", inspectionId);
    startTransition(async () => {
      await unresolveNotVisible(fd);
    });
  }

  function reopenSkipped() {
    const fd = new FormData();
    fd.append("item_id", item.id);
    fd.append("inspection_id", inspectionId);
    startTransition(async () => {
      await unskipNotVisible(fd);
    });
  }

  const isOpen = !item.resolved && !item.skipped;

  return (
    <li
      className={[
        "rounded-lg border px-3 py-2.5 transition",
        item.resolved
          ? "border-[var(--border)] bg-[var(--bg-elevated)] opacity-70"
          : item.skipped
            ? "border-[var(--border)] bg-[var(--bg-elevated)] opacity-60"
            : "border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:border-[var(--warning)]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={[
              "text-sm leading-snug",
              !isOpen
                ? "text-[var(--fg-muted)] line-through"
                : "font-medium text-[var(--fg)]",
            ].join(" ")}
          >
            {item.resolved ? "✓ " : item.skipped ? "↷ " : ""}
            {item.item}
          </p>
          {item.reason ? (
            <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">
              Reason: {item.reason}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--fg-subtle)]">
            <Link
              href={`/inspections/${inspectionId}/photos/${item.photo_id}`}
              className="text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
            >
              View source photo
            </Link>
            {item.section_name ? (
              <>
                <span aria-hidden>·</span>
                <span>{item.section_name}</span>
              </>
            ) : null}
            {item.photo_location ? (
              <>
                <span aria-hidden>·</span>
                <span>{item.photo_location}</span>
              </>
            ) : null}
          </div>
          {item.resolved && item.resolved_note ? (
            <p
              className="mt-2 rounded border-l-2 border-[var(--primary)] bg-white/[0.02] px-2 py-1 text-[11px]"
              style={{ color: "var(--fg-muted)" }}
            >
              Resolved: {item.resolved_note}
            </p>
          ) : null}
          {item.skipped && item.skipped_reason ? (
            <p
              className="mt-2 rounded border-l-2 border-[var(--fg-subtle)] bg-white/[0.02] px-2 py-1 text-[11px]"
              style={{ color: "var(--fg-muted)" }}
            >
              Skipped: {item.skipped_reason}
            </p>
          ) : null}
        </div>

        {/* Right column: action buttons. Two for open items, one for closed. */}
        {readOnly ? null : isOpen && mode === "idle" ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMode("resolving")}
              disabled={isPending}
              className="rounded-md border border-[var(--primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)] transition active:scale-[0.97] hover:bg-[var(--primary)] hover:text-[#0a0d12]"
              title="Mark as verified — opens a note field for how you re-photographed it"
            >
              ✓ Resolve
            </button>
            <button
              type="button"
              onClick={() => setMode("skipping")}
              disabled={isPending}
              className="rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition active:scale-[0.97] hover:bg-white/[0.05] hover:text-[var(--fg)]"
              title="Skip — Chip flagged this but you've decided no re-photograph is needed (false positive, out of scope, etc.)"
            >
              ↷ Skip
            </button>
          </div>
        ) : !isOpen ? (
          <button
            type="button"
            onClick={item.resolved ? reopenResolved : reopenSkipped}
            disabled={isPending}
            className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-subtle)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
            title="Send back to the open to-do list"
          >
            Reopen
          </button>
        ) : null}
      </div>

      {/* Inline composer when resolving OR skipping. Same shape, different
          confirm action — keeps the UI consistent and the code small. */}
      {mode !== "idle" && isOpen ? (
        <div className="mt-2.5 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder={
              mode === "resolving"
                ? "Optional: how did you verify? (e.g., 're-photographed from north angle, deflector measured 8 in from slab')"
                : "Optional: why skip? (e.g., 'false positive — already a Low advisory in NFPA 25 §13.4.4', or 'deferred to next year's budget')"
            }
            rows={2}
            className="cl-input resize-y py-2 text-xs"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setNote("");
              }}
              disabled={isPending}
              className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={mode === "resolving" ? resolve : skip}
              disabled={isPending}
              className={[
                "rounded-md px-3 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                mode === "resolving"
                  ? "bg-[var(--primary)] text-[#0a0d12] hover:bg-[var(--primary-hover)]"
                  : "border border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/[0.05] hover:text-[var(--fg)]",
              ].join(" ")}
            >
              {isPending
                ? "Saving…"
                : mode === "resolving"
                  ? "Confirm resolved"
                  : "Confirm skip"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
