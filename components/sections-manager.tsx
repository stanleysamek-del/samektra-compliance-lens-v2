"use client";

import { useState, useTransition } from "react";
import {
  createSection,
  renameSection,
  deleteSection,
  moveSection,
} from "@/app/inspections/[id]/actions";

export type SectionRow = {
  id: string;
  name: string;
  sort_order: number;
  photoCount: number;
};

type Props = {
  inspectionId: string;
  sections: SectionRow[];
  /** When true, hides the management UI (used on read-only finalized inspections). */
  readOnly?: boolean;
};

/**
 * Compact section manager rendered above the photo grid on the inspection
 * detail page. Lets the inspector add, rename, reorder, and remove sections.
 * Photo-to-section assignment lives on the per-photo card (PhotoMoveMenu).
 */
export function SectionsManager({ inspectionId, sections, readOnly }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isPending, startTransition] = useTransition();

  if (readOnly && sections.length === 0) return null;

  function submitNew() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    const fd = new FormData();
    fd.append("inspection_id", inspectionId);
    fd.append("name", name);
    startTransition(async () => {
      await createSection(fd);
      setNewName("");
      setAdding(false);
    });
  }

  function submitRename(sectionId: string) {
    const name = editName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    const fd = new FormData();
    fd.append("section_id", sectionId);
    fd.append("inspection_id", inspectionId);
    fd.append("name", name);
    startTransition(async () => {
      await renameSection(fd);
      setEditingId(null);
    });
  }

  function remove(sectionId: string, name: string) {
    if (
      !confirm(
        `Delete section "${name}"? Photos in it will move to Unassigned. Findings stay.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.append("section_id", sectionId);
    fd.append("inspection_id", inspectionId);
    startTransition(async () => {
      await deleteSection(fd);
    });
  }

  function move(sectionId: string, direction: "up" | "down") {
    const fd = new FormData();
    fd.append("section_id", sectionId);
    fd.append("inspection_id", inspectionId);
    fd.append("direction", direction);
    startTransition(async () => {
      await moveSection(fd);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Sections {sections.length > 0 ? `· ${sections.length}` : ""}
        </h2>
        {!readOnly && !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
          >
            + Add section
          </button>
        ) : null}
      </div>

      {sections.length === 0 && !adding ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-xs text-[var(--fg-subtle)]">
          No sections yet. Group photos by room, smoke compartment, or area —
          e.g., &ldquo;Stair B&rdquo;, &ldquo;Main Corridor&rdquo;, &ldquo;Electrical Room 2&rdquo;.
        </p>
      ) : null}

      {sections.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {sections.map((s, idx) => {
            const isEditing = editingId === s.id;
            const isFirst = idx === 0;
            const isLast = idx === sections.length - 1;
            return (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
              >
                {/* Name / rename */}
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(s.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => submitRename(s.id)}
                      className="cl-input py-1 text-sm"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-[var(--fg)]">
                        {s.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--fg-subtle)]">
                        · {s.photoCount} photo{s.photoCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                </div>

                {!readOnly && !isEditing ? (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(s.id, "up")}
                      disabled={isFirst || isPending}
                      title="Move up"
                      aria-label="Move section up"
                      className="rounded p-1 text-[var(--fg-subtle)] transition hover:bg-white/[0.05] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <UpIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(s.id, "down")}
                      disabled={isLast || isPending}
                      title="Move down"
                      aria-label="Move section down"
                      className="rounded p-1 text-[var(--fg-subtle)] transition hover:bg-white/[0.05] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <DownIcon />
                    </button>
                    <span className="mx-1 h-4 w-px bg-[var(--border)]" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(s.id);
                        setEditName(s.name);
                      }}
                      className="rounded px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id, s.name)}
                      disabled={isPending}
                      className="rounded px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[#a8362b]"
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* New-section composer */}
      {adding && !readOnly ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--bg-elevated)] px-3 py-2">
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNew();
              if (e.key === "Escape") {
                setAdding(false);
                setNewName("");
              }
            }}
            placeholder="Section name (e.g., 'Stair B', 'Electrical Room')"
            className="cl-input py-1 text-sm"
          />
          <button
            type="button"
            onClick={submitNew}
            disabled={isPending || newName.trim().length === 0}
            className="cl-btn-accent px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
            className="rounded px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function UpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}
function DownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
