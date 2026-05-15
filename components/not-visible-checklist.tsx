"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  resolveNotVisible,
  unresolveNotVisible,
} from "@/app/inspections/[id]/actions";

export type NotVisibleItem = {
  id: string;
  item: string;
  reason: string | null;
  resolved: boolean;
  resolved_note: string | null;
  resolved_at: string | null;
  photo_id: string;
  photo_location: string | null;
  section_name: string | null;
};

type Props = {
  inspectionId: string;
  items: NotVisibleItem[];
  /** Hide resolve controls when the inspection is finalized. */
  readOnly?: boolean;
};

/**
 * Aggregated "punch-list" of items Chip flagged as not visible across every
 * photo in the inspection. The inspector resolves them as they come back
 * with better shots. Lives below the photo grid on the inspection page.
 *
 * Items are grouped: unresolved at top (the work to do), resolved below
 * (collapsed by default, the audit trail).
 */
export function NotVisibleChecklist({
  inspectionId,
  items,
  readOnly,
}: Props) {
  const [showResolved, setShowResolved] = useState(false);

  if (items.length === 0) return null;

  const unresolved = items.filter((i) => !i.resolved);
  const resolved = items.filter((i) => i.resolved);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--warning)]">
          Re-photograph punch-list
          <span className="ml-1.5 font-medium text-[var(--fg-subtle)]">
            · {unresolved.length} to do
            {resolved.length > 0 ? ` · ${resolved.length} done` : ""}
          </span>
        </h2>
        <button
          type="button"
          onClick={() => {
            // Guarded inside the handler so SSR doesn't blow up — the
            // handler itself only fires after hydration on the client.
            if (typeof window !== "undefined") window.print();
          }}
          className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
          title="Open the browser print dialog so you can take this list on your next site visit"
        >
          Print
        </button>
      </div>

      {unresolved.length === 0 ? (
        <div
          className="rounded-lg border px-3 py-2.5 text-xs"
          style={{
            borderColor: "rgba(34,197,94,0.3)",
            background: "rgba(34,197,94,0.08)",
            color: "#86efac",
          }}
        >
          ✓ Everything Chip couldn&apos;t verify has been resolved. Good job.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {unresolved.map((it) => (
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
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved
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
    </section>
  );
}

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
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");

  function resolve() {
    const fd = new FormData();
    fd.append("item_id", item.id);
    fd.append("inspection_id", inspectionId);
    fd.append("note", note.trim());
    fd.append("resolved_photo_id", item.photo_id);
    startTransition(async () => {
      await resolveNotVisible(fd);
      setConfirming(false);
      setNote("");
    });
  }

  function reopen() {
    const fd = new FormData();
    fd.append("item_id", item.id);
    fd.append("inspection_id", inspectionId);
    startTransition(async () => {
      await unresolveNotVisible(fd);
    });
  }

  return (
    <li
      className={[
        "rounded-lg border px-3 py-2.5 transition",
        item.resolved
          ? "border-[var(--border)] bg-[var(--bg-elevated)] opacity-70"
          : "border-[var(--border-strong)] bg-[var(--bg-elevated)] hover:border-[var(--warning)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={[
              "text-sm leading-snug",
              item.resolved
                ? "text-[var(--fg-muted)] line-through"
                : "font-medium text-[var(--fg)]",
            ].join(" ")}
          >
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
              ✓ {item.resolved_note}
            </p>
          ) : null}
        </div>

        {readOnly ? null : item.resolved ? (
          <button
            type="button"
            onClick={reopen}
            disabled={isPending}
            className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-subtle)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
            title="Mark as still needing re-photograph"
          >
            Reopen
          </button>
        ) : !confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={isPending}
            className="shrink-0 rounded-md border border-[var(--primary)] px-2 py-1 text-[11px] font-medium text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-[#0a0d12]"
          >
            ✓ Mark resolved
          </button>
        ) : null}
      </div>

      {/* Inline note composer when resolving. */}
      {confirming && !item.resolved ? (
        <div className="mt-2.5 flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="Optional: how did you verify this? (e.g., 're-photographed from north angle, deflector measured 8 in from slab')"
            rows={2}
            className="cl-input resize-y py-2 text-xs"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setNote("");
              }}
              disabled={isPending}
              className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={resolve}
              disabled={isPending}
              className="cl-btn-accent px-3 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Confirm resolved"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
