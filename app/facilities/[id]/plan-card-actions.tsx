"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePlan, renamePlan } from "@/app/actions/plans";
import { showToast } from "@/components/toaster";

/** Rename / delete controls for one plan card on the facility page. */
export function PlanCardActions({ planId, name }: { planId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);

  function saveName() {
    if (!draft.trim() || draft.trim() === name) {
      setRenaming(false);
      return;
    }
    start(async () => {
      const res = await renamePlan(planId, draft);
      if (!res.ok) {
        showToast({ kind: "error", message: res.error });
        return;
      }
      setRenaming(false);
      router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Delete "${name}"? Every pin placed on it (from any inspection) is removed too.`,
      )
    )
      return;
    start(async () => {
      const res = await deletePlan(planId);
      if (!res.ok) {
        showToast({ kind: "error", message: res.error });
        return;
      }
      showToast({ kind: "success", message: "Plan deleted." });
      router.refresh();
    });
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          className="cl-input w-40 text-xs"
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") setRenaming(false);
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={saveName}
          disabled={pending}
          className="min-h-[40px] rounded-md px-2 text-xs font-semibold text-[var(--accent)]"
        >
          Save
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          setRenaming(true);
        }}
        disabled={pending}
        className="min-h-[40px] rounded-md px-2 text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="min-h-[40px] rounded-md px-2 text-xs font-medium text-[var(--fg-muted)] transition hover:text-[#a8362b]"
      >
        {pending ? "…" : "Delete"}
      </button>
    </div>
  );
}
