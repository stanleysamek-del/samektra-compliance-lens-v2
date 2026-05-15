"use client";

import { useState, useTransition } from "react";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
} from "@/app/inspections/folders/actions";

export type FolderRow = {
  id: string;
  name: string;
  sort_order: number;
  inspectionCount: number;
};

type Props = {
  organizationId: string;
  folders: FolderRow[];
};

/**
 * Org-scoped folder manager rendered above the inspections list. Same
 * shape as the per-inspection SectionsManager — add, rename, reorder,
 * delete. Per-inspection folder assignment lives on the InspectionMoveMenu.
 */
export function FoldersManager({ organizationId, folders }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitNew() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    const fd = new FormData();
    fd.append("organization_id", organizationId);
    fd.append("name", name);
    startTransition(async () => {
      await createFolder(fd);
      setNewName("");
      setAdding(false);
    });
  }

  function submitRename(folderId: string) {
    const name = editName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    const fd = new FormData();
    fd.append("folder_id", folderId);
    fd.append("name", name);
    startTransition(async () => {
      await renameFolder(fd);
      setEditingId(null);
    });
  }

  function remove(folderId: string, name: string) {
    if (
      !confirm(
        `Delete group "${name}"? Inspections inside it move to Unfiled. Findings stay.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.append("folder_id", folderId);
    startTransition(async () => {
      await deleteFolder(fd);
    });
  }

  function move(folderId: string, direction: "up" | "down") {
    const fd = new FormData();
    fd.append("folder_id", folderId);
    fd.append("direction", direction);
    startTransition(async () => {
      await moveFolder(fd);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          Groups {folders.length > 0 ? `· ${folders.length}` : ""}
        </h2>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
          >
            + Add group
          </button>
        ) : null}
      </div>

      {folders.length === 0 && !adding ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-xs text-[var(--fg-subtle)]">
          No groups yet. Create one to organize inspections by hospital,
          location, type, or anything else your team uses — e.g.,
          &ldquo;Memorial Hospital&rdquo;, &ldquo;Q4 Fire Audits&rdquo;,
          &ldquo;Annual Sprinkler Surveys&rdquo;.
        </p>
      ) : null}

      {folders.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {folders.map((f, idx) => {
            const isEditing = editingId === f.id;
            const isFirst = idx === 0;
            const isLast = idx === folders.length - 1;
            return (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <input
                      type="text"
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(f.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => submitRename(f.id)}
                      className="cl-input py-1 text-sm"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <FolderIcon />
                      <span className="truncate text-sm font-medium text-[var(--fg)]">
                        {f.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--fg-subtle)]">
                        · {f.inspectionCount}{" "}
                        {f.inspectionCount === 1 ? "inspection" : "inspections"}
                      </span>
                    </div>
                  )}
                </div>

                {!isEditing ? (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(f.id, "up")}
                      disabled={isFirst || isPending}
                      title="Move up"
                      className="rounded p-1 text-[var(--fg-subtle)] transition hover:bg-white/[0.05] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <UpIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(f.id, "down")}
                      disabled={isLast || isPending}
                      title="Move down"
                      className="rounded p-1 text-[var(--fg-subtle)] transition hover:bg-white/[0.05] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <DownIcon />
                    </button>
                    <span className="mx-1 h-4 w-px bg-[var(--border)]" />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(f.id);
                        setEditName(f.name);
                      }}
                      className="rounded px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f.id, f.name)}
                      disabled={isPending}
                      className="rounded px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[#fca5a5]"
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

      {adding ? (
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
            placeholder="Group name (e.g., 'Memorial Hospital', 'Annual Fire Audits')"
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

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
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
