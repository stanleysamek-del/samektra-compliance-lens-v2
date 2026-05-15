"use client";

import { useState, useTransition } from "react";
import { assignInspectionToFolder } from "@/app/inspections/folders/actions";

type FolderOption = { id: string; name: string };

type Props = {
  inspectionId: string;
  currentFolderId: string | null;
  folders: FolderOption[];
};

/**
 * "Move to group" dropdown rendered on each inspection card on the
 * inspections list page. Same UX shape as PhotoMoveMenu — click toggles
 * a small menu, pick a destination, action runs, page revalidates.
 */
export function InspectionMoveMenu({
  inspectionId,
  currentFolderId,
  folders,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const currentName =
    folders.find((f) => f.id === currentFolderId)?.name ?? "Unfiled";

  function move(folderId: string | null) {
    setOpen(false);
    const fd = new FormData();
    fd.append("inspection_id", inspectionId);
    fd.append("folder_id", folderId ?? "none");
    startTransition(async () => {
      await assignInspectionToFolder(fd);
    });
  }

  if (folders.length === 0 && currentFolderId === null) {
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
        title="Move this inspection to a group"
      >
        <FolderIcon /> {isPending ? "Moving…" : currentName}
        <CaretIcon />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="absolute right-0 z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-lg"
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
                    currentFolderId === null
                      ? "font-semibold text-[var(--primary)]"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                  ].join(" ")}
                >
                  Unfiled
                </button>
              </li>
              {folders.length > 0 ? (
                <li aria-hidden className="mx-2 my-1 h-px bg-[var(--border)]" />
              ) : null}
              {folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      move(f.id);
                    }}
                    className={[
                      "w-full truncate px-3 py-1.5 text-left transition hover:bg-white/[0.05]",
                      f.id === currentFolderId
                        ? "font-semibold text-[var(--primary)]"
                        : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                    ].join(" ")}
                  >
                    {f.name}
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
