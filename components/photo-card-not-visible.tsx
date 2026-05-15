"use client";

import { useState, useTransition } from "react";
import {
  resolveNotVisible,
  unresolveNotVisible,
  skipNotVisible,
  unskipNotVisible,
} from "@/app/inspections/[id]/actions";
import type { NotVisibleItem } from "@/components/not-visible-checklist";

type Props = {
  inspectionId: string;
  photoId: string;
  items: NotVisibleItem[];
  readOnly?: boolean;
};

/**
 * Per-photo collapsible "Not visible" dropdown rendered inside the photo
 * card on the inspection page. Collapsed by default so cards stay scannable;
 * expanding shows each item with Resolve / Skip / Reopen controls inline.
 *
 * Uses the same server actions as the inspection-level NotVisibleChecklist,
 * so a resolve/skip from either surface stays in sync on the next render.
 */
export function PhotoCardNotVisible({
  inspectionId,
  photoId,
  items,
  readOnly,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const open = items.filter((i) => !i.resolved && !i.skipped);
  const resolved = items.filter((i) => i.resolved);
  const skipped = items.filter((i) => i.skipped && !i.resolved);

  // Summary label — color emphasizes when there's open work, fades when done.
  const allDone = open.length === 0;

  return (
    <div className="border-t border-[var(--border)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-white/[0.02]"
        aria-expanded={expanded}
      >
        <span
          className={[
            "flex items-center gap-2 text-xs font-medium",
            allDone ? "text-[var(--fg-subtle)]" : "text-[var(--warning)]",
          ].join(" ")}
        >
          <Caret expanded={expanded} />
          {allDone ? "✓ " : "⚠ "}
          {open.length > 0
            ? `${open.length} ${open.length === 1 ? "item" : "items"} Chip couldn't verify`
            : "All not-visible items cleared"}
          {resolved.length > 0 || skipped.length > 0 ? (
            <span className="font-normal text-[var(--fg-subtle)]">
              {resolved.length > 0 ? ` · ${resolved.length} resolved` : ""}
              {skipped.length > 0 ? ` · ${skipped.length} skipped` : ""}
            </span>
          ) : null}
        </span>
      </button>

      {expanded ? (
        <ul className="flex flex-col gap-1.5 border-t border-[var(--border)] bg-[#0a0d12]/40 px-3 py-2.5">
          {open.map((it) => (
            <CompactRow
              key={it.id}
              item={it}
              inspectionId={inspectionId}
              photoId={photoId}
              readOnly={readOnly}
            />
          ))}
          {resolved.map((it) => (
            <CompactRow
              key={it.id}
              item={it}
              inspectionId={inspectionId}
              photoId={photoId}
              readOnly={readOnly}
            />
          ))}
          {skipped.map((it) => (
            <CompactRow
              key={it.id}
              item={it}
              inspectionId={inspectionId}
              photoId={photoId}
              readOnly={readOnly}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Mode = "idle" | "resolving" | "skipping";

function CompactRow({
  item,
  inspectionId,
  photoId,
  readOnly,
}: {
  item: NotVisibleItem;
  inspectionId: string;
  photoId: string;
  readOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  function resolve() {
    const fd = new FormData();
    fd.append("item_id", item.id);
    fd.append("inspection_id", inspectionId);
    fd.append("note", note.trim());
    fd.append("resolved_photo_id", photoId);
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

  function reopen() {
    const fd = new FormData();
    fd.append("item_id", item.id);
    fd.append("inspection_id", inspectionId);
    startTransition(async () => {
      if (item.resolved) await unresolveNotVisible(fd);
      else if (item.skipped) await unskipNotVisible(fd);
    });
  }

  const isOpen = !item.resolved && !item.skipped;
  const hasDetails =
    Boolean(item.reason) ||
    Boolean(item.resolved_note) ||
    Boolean(item.skipped_reason);

  return (
    <li
      className={[
        "rounded-md border px-2.5 py-1.5 text-[12px]",
        item.resolved
          ? "border-[var(--border)] opacity-65"
          : item.skipped
            ? "border-[var(--border)] opacity-55"
            : "border-[var(--border-strong)]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => hasDetails && setDetailsOpen((v) => !v)}
            disabled={!hasDetails}
            className={[
              "block text-left leading-snug",
              hasDetails ? "cursor-pointer hover:opacity-90" : "cursor-default",
              !isOpen
                ? "text-[var(--fg-muted)] line-through"
                : "text-[var(--fg)]",
            ].join(" ")}
            title={hasDetails ? "Click for details" : undefined}
          >
            {item.resolved ? "✓ " : item.skipped ? "↷ " : ""}
            {item.item}
            {hasDetails ? (
              <span className="ml-1 text-[10px] text-[var(--fg-subtle)]">
                {detailsOpen ? "▾" : "▸"}
              </span>
            ) : null}
          </button>

          {detailsOpen ? (
            <div className="mt-1 flex flex-col gap-1">
              {item.reason ? (
                <p className="text-[11px] text-[var(--fg-subtle)]">
                  Reason: {item.reason}
                </p>
              ) : null}
              {item.resolved && item.resolved_note ? (
                <p
                  className="rounded border-l-2 border-[var(--primary)] bg-white/[0.02] px-1.5 py-0.5 text-[11px]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Resolved: {item.resolved_note}
                </p>
              ) : null}
              {item.skipped && item.skipped_reason ? (
                <p
                  className="rounded border-l-2 border-[var(--fg-subtle)] bg-white/[0.02] px-1.5 py-0.5 text-[11px]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Skipped: {item.skipped_reason}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Actions — compact two-button row when open, single Reopen otherwise. */}
        {readOnly ? null : isOpen && mode === "idle" ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode("resolving");
              }}
              disabled={isPending}
              className="rounded border border-[var(--primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)] transition active:scale-[0.97] hover:bg-[var(--primary)] hover:text-[#0a0d12]"
              title="Mark resolved — verified via re-photograph"
            >
              ✓ Resolve
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode("skipping");
              }}
              disabled={isPending}
              className="rounded border border-[var(--border-strong)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-muted)] transition active:scale-[0.97] hover:bg-white/[0.05] hover:text-[var(--fg)]"
              title="Skip — no re-photograph needed (false positive, out of scope, won't fix)"
            >
              ↷ Skip
            </button>
          </div>
        ) : !isOpen ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              reopen();
            }}
            disabled={isPending}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-subtle)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
            title="Reopen — send back to the to-do list"
          >
            Reopen
          </button>
        ) : null}
      </div>

      {/* Inline composer for Resolve / Skip — narrow to fit photo card. */}
      {mode !== "idle" && isOpen ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder={
              mode === "resolving"
                ? "Optional: how did you verify? (1-2 sentences)"
                : "Optional: why skip? (1-2 sentences)"
            }
            rows={2}
            className="cl-input resize-y py-1.5 text-[11px]"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMode("idle");
                setNote("");
              }}
              disabled={isPending}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (mode === "resolving") resolve();
                else skip();
              }}
              disabled={isPending}
              className={[
                "rounded px-2 py-0.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                mode === "resolving"
                  ? "bg-[var(--primary)] text-[#0a0d12] hover:bg-[var(--primary-hover)]"
                  : "border border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/[0.05] hover:text-[var(--fg)]",
              ].join(" ")}
            >
              {isPending
                ? "Saving…"
                : mode === "resolving"
                  ? "Confirm"
                  : "Confirm skip"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Caret({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
