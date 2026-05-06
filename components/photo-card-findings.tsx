"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deleteFinding } from "@/app/inspections/[id]/photos/[photoId]/actions";

export type CompactFinding = {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
};

type Props = {
  inspectionId: string;
  photoId: string;
  findings: CompactFinding[];
};

/**
 * Concise findings list shown directly on the photo card on the inspection
 * detail page. Each row has its own kebab menu so the user can edit or
 * delete a finding without opening the photo detail page.
 *
 *   - Edit  → jumps to /inspections/<id>/photos/<photoId>#finding-<fid>
 *             which scrolls to the matching FindingCard (which has full edit UI)
 *   - Delete → confirm() prompt + server action
 */
export function PhotoCardFindings({ inspectionId, photoId, findings }: Props) {
  if (findings.length === 0) {
    return (
      <p className="px-4 pb-3 text-xs text-[var(--fg-subtle)]">
        No deficiencies detected.
      </p>
    );
  }

  // Sort High → Medium → Low for the inline view.
  const order = { High: 0, Medium: 1, Low: 2 } as const;
  const sorted = [...findings].sort(
    (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3),
  );

  return (
    <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
      {sorted.map((f, idx) => (
        <li
          key={f.id}
          className="flex items-center gap-2 px-4 py-2 transition hover:bg-white/[0.02]"
        >
          <SeverityPill severity={f.severity} />
          <span className="min-w-0 flex-1 truncate text-xs text-[var(--fg)]">
            <span className="text-[var(--fg-subtle)]">#{idx + 1}</span>{" "}
            {f.title}
          </span>
          <FindingRowMenu
            findingId={f.id}
            inspectionId={inspectionId}
            photoId={photoId}
          />
        </li>
      ))}
    </ul>
  );
}

function SeverityPill({ severity }: { severity: "Low" | "Medium" | "High" }) {
  const map = {
    High: { bg: "rgba(248,113,113,0.14)", fg: "#fca5a5", label: "H" },
    Medium: { bg: "rgba(248,113,113,0.10)", fg: "#fca5a5", label: "M" },
    Low: { bg: "rgba(52,211,153,0.12)", fg: "#6ee7b7", label: "L" },
  } as const;
  const m = map[severity];
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={{ background: m.bg, color: m.fg }}
      title={severity}
      aria-label={severity}
    >
      {m.label}
    </span>
  );
}

function FindingRowMenu({
  findingId,
  inspectionId,
  photoId,
}: {
  findingId: string;
  inspectionId: string;
  photoId: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click-outside / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Finding actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--fg-muted)] transition hover:bg-white/5 hover:text-[var(--fg)]"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1 shadow-xl"
        >
          <Link
            href={`/inspections/${inspectionId}/photos/${photoId}#finding-${findingId}`}
            className="block px-3 py-1.5 text-xs text-[var(--fg)] transition hover:bg-white/5"
            onClick={() => setOpen(false)}
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={async () => {
              if (
                !window.confirm("Delete this finding? This cannot be undone.")
              ) {
                return;
              }
              setOpen(false);
              await deleteFinding(findingId, inspectionId);
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-[#fca5a5] transition hover:bg-[rgba(239,68,68,0.08)]"
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
