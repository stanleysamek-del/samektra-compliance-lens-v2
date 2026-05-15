"use client";

import { useState, useTransition } from "react";

type Props = {
  orgId: string;
  orgName: string;
  action: (formData: FormData) => Promise<void> | void;
};

/**
 * Type-to-confirm destructive dialog for deleting a team.
 *
 * The "Delete team" button is initially disabled and only enables when
 * the user has typed the team name exactly. The server action re-validates
 * the typed name as a second line of defense — this client check is just
 * UX to prevent reflexive submits.
 */
export function DeleteTeamDialog({ orgId, orgName, action }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  const matches = typed === orgName;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: "#a8362b" }}>
            Delete this team
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--fg-muted)]">
            Permanently removes the team, all member assignments, pending
            invites, and folders. Inspections created inside the team move
            back to each author&apos;s personal workspace — they are not
            destroyed.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded px-3 py-1.5 text-[11px] font-medium transition"
            style={{
              border: "1px solid rgba(168,54,43,0.4)",
              color: "#a8362b",
              background: "rgba(168,54,43,0.05)",
            }}
          >
            Delete team…
          </button>
        ) : null}
      </div>

      {open ? (
        <form
          action={(fd) => startTransition(() => action(fd))}
          className="flex flex-col gap-2 rounded-lg border px-3 py-3"
          style={{
            borderColor: "rgba(168,54,43,0.4)",
            background: "rgba(168,54,43,0.04)",
          }}
        >
          <input type="hidden" name="organization_id" value={orgId} />
          <label className="text-[11px] text-[var(--fg-muted)]">
            To confirm, type{" "}
            <span
              className="font-medium"
              style={{ color: "#a8362b" }}
            >
              {orgName}
            </span>{" "}
            below.
          </label>
          <input
            name="confirm_name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={orgName}
            autoComplete="off"
            spellCheck={false}
            className="cl-input text-sm"
          />
          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className="rounded px-3 py-1.5 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matches || pending}
              className="rounded px-3 py-1.5 text-[11px] font-medium text-white transition disabled:opacity-40"
              style={{
                background: matches ? "#a8362b" : "rgba(168,54,43,0.5)",
                cursor: matches && !pending ? "pointer" : "not-allowed",
              }}
            >
              {pending ? "Deleting…" : "Delete team permanently"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
