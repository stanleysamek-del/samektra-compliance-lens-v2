"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deleteInspection } from "@/app/inspections/[id]/actions";

type Props = {
  inspectionId: string;
  facilityName: string;
};

/**
 * Three-dot row action menu (Edit / Delete) — iAuditor-style.
 * Closes on outside click. Delete requires JS confirm.
 */
export function InspectionRowMenu({ inspectionId, facilityName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Inspection actions"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--fg-muted)] transition hover:bg-white/[0.04] hover:text-[var(--fg)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-raised)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={`/inspections/${inspectionId}`}
            className="block px-4 py-2.5 text-sm text-[var(--fg)] transition hover:bg-white/[0.04]"
          >
            Open
          </Link>
          <Link
            href={`/inspections/${inspectionId}/edit`}
            className="block px-4 py-2.5 text-sm text-[var(--fg)] transition hover:bg-white/[0.04]"
          >
            Edit details
          </Link>
          <form
            action={deleteInspection}
            onSubmit={(e) => {
              if (
                !confirm(
                  `Delete "${facilityName}"? This permanently removes all photos and findings. Cannot be undone.`,
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <input type="hidden" name="inspection_id" value={inspectionId} />
            <input
              type="hidden"
              name="redirect_to"
              value="/inspections/history"
            />
            <button
              type="submit"
              className="block w-full border-t border-[var(--border)] px-4 py-2.5 text-left text-sm text-[#fca5a5] transition hover:bg-[rgba(239,68,68,0.06)]"
            >
              Delete
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
