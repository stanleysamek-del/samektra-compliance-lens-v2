"use client";

import { useState, useTransition } from "react";
import { assignPhotoToSection } from "@/app/inspections/[id]/actions";

type SectionOption = {
  id: string;
  name: string;
};

type Props = {
  photoId: string;
  inspectionId: string;
  currentSectionId: string | null;
  sections: SectionOption[];
};

/**
 * Tiny "Move to" dropdown rendered on each photo card. Shows the current
 * section (or "Unassigned") and lets the inspector move the photo to any
 * existing section, or detach it back to unassigned. Open/close is local
 * state; submission goes through the server action and triggers a
 * revalidation of the inspection page.
 */
export function PhotoMoveMenu({
  photoId,
  inspectionId,
  currentSectionId,
  sections,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const currentName =
    sections.find((s) => s.id === currentSectionId)?.name ?? "Unassigned";

  function move(sectionId: string | null) {
    setOpen(false);
    const fd = new FormData();
    fd.append("photo_id", photoId);
    fd.append("inspection_id", inspectionId);
    fd.append("section_id", sectionId ?? "none");
    startTransition(async () => {
      await assignPhotoToSection(fd);
    });
  }

  // No sections AND already unassigned → no menu needed.
  if (sections.length === 0 && currentSectionId === null) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] font-medium text-[var(--fg-muted)] transition hover:border-[var(--primary)] hover:text-[var(--fg)]"
        title="Move this photo to a section"
      >
        <FolderIcon /> {isPending ? "Moving…" : currentName}
        <CaretIcon />
      </button>

      {open ? (
        <>
          {/* Click-away catcher */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="absolute right-0 z-50 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="flex flex-col py-1 text-xs">
              <li>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    move(null);
                  }}
                  className={[
                    "w-full px-3 py-1.5 text-left transition hover:bg-white/[0.05]",
                    currentSectionId === null
                      ? "font-semibold text-[var(--primary)]"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                  ].join(" ")}
                >
                  Unassigned
                </button>
              </li>
              {sections.length > 0 ? (
                <li
                  aria-hidden
                  className="mx-2 my-1 h-px bg-[var(--border)]"
                />
              ) : null}
              {sections.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      move(s.id);
                    }}
                    className={[
                      "w-full truncate px-3 py-1.5 text-left transition hover:bg-white/[0.05]",
                      s.id === currentSectionId
                        ? "font-semibold text-[var(--primary)]"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                    ].join(" ")}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}
function CaretIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
