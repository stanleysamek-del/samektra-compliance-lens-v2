"use client";

/**
 * ActionStrip — the corrective-action workflow on a finding card.
 *
 * Collapsed: one row — status pill · assignee · due date (red when
 * overdue) · priority. Expanded: assign controls, lifecycle buttons,
 * close-out flow (photo id or written note — "no evidence" isn't an
 * option), and the comment thread (lazy-loaded on first expand so the
 * server pages stay lean).
 *
 * Renders nothing interactive for viewers (readOnly) — RLS would deny
 * the writes anyway; hiding the buttons is the polish 0016 promised.
 */

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  assignAction,
  setActionStatus,
  closeAction,
  addFindingComment,
  type ActionStatus,
  type ActionPriority,
} from "@/app/actions/workflow";

export type OrgMember = {
  user_id: string;
  full_name: string;
  email: string;
};

export type ActionFields = {
  cap_status: ActionStatus | null;
  priority: ActionPriority | null;
  cap_target_date: string | null;
  assigned_to: string | null;
  assigned_email: string | null;
  action_closed_at: string | null;
  closure_note: string | null;
  closure_photo_id: string | null;
};

type CommentRow = {
  id: string;
  body: string;
  created_by: string;
  created_at: string;
};

const STATUS_META: Record<
  ActionStatus,
  { label: string; bg: string; fg: string }
> = {
  open: { label: "Open", bg: "rgba(15,21,24,0.06)", fg: "var(--slate)" },
  in_progress: { label: "In progress", bg: "rgba(184,118,42,0.12)", fg: "#b8762a" },
  done: { label: "Done — verify", bg: "rgba(20,184,166,0.12)", fg: "#0f766e" },
  verified: { label: "Verified", bg: "rgba(96,122,58,0.12)", fg: "#607a3a" },
  wont_fix: { label: "Won't fix", bg: "rgba(15,21,24,0.06)", fg: "var(--fg-subtle)" },
};

export function isOverdue(a: Pick<ActionFields, "cap_status" | "cap_target_date">): boolean {
  if (!a.cap_target_date) return false;
  if (a.cap_status === "done" || a.cap_status === "verified" || a.cap_status === "wont_fix")
    return false;
  return a.cap_target_date < new Date().toISOString().slice(0, 10);
}

export function ActionStrip({
  findingId,
  inspectionId,
  action,
  members,
  currentUserId,
  readOnly = false,
}: {
  findingId: string;
  inspectionId: string;
  action: ActionFields;
  members: OrgMember[];
  currentUserId: string;
  readOnly?: boolean;
}) {
  const status: ActionStatus = action.cap_status ?? "open";
  const meta = STATUS_META[status];
  const overdue = isOverdue(action);

  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Assignment draft
  const [assignee, setAssignee] = useState(action.assigned_to ?? "");
  const [assigneeEmail, setAssigneeEmail] = useState(action.assigned_email ?? "");
  const [priority, setPriority] = useState<ActionPriority>(action.priority ?? "medium");
  const [dueDate, setDueDate] = useState(action.cap_target_date ?? "");

  // Close-out draft
  const [closing, setClosing] = useState<null | "done" | "wont_fix">(null);
  const [closureNote, setClosureNote] = useState("");

  // Comments — lazy-loaded on first expand.
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  useEffect(() => {
    if (!expanded || comments !== null) return;
    const supabase = createClient();
    supabase
      .from("finding_comments")
      .select("id, body, created_by, created_at")
      .eq("finding_id", findingId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setComments((data as CommentRow[]) ?? []));
  }, [expanded, comments, findingId]);

  const memberName = (id: string | null) =>
    members.find((m) => m.user_id === id)?.full_name ?? null;

  const assigneeLabel =
    memberName(action.assigned_to) ??
    action.assigned_email ??
    null;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong");
    });
  }

  function saveAssignment() {
    run(() =>
      assignAction({
        findingId,
        inspectionId,
        assigneeUserId: assignee || null,
        assigneeEmail: assignee ? null : assigneeEmail || null,
        priority,
        dueDate: dueDate || null,
      }),
    );
  }

  function submitClose(kind: "done" | "wont_fix") {
    run(async () => {
      const res = await closeAction({
        findingId,
        inspectionId,
        status: kind,
        closureNote: closureNote || null,
      });
      if (res.ok) {
        setClosing(null);
        setClosureNote("");
      }
      return res;
    });
  }

  function postComment() {
    const body = commentDraft.trim();
    if (!body) return;
    run(async () => {
      const res = await addFindingComment({ findingId, inspectionId, body });
      if (res.ok) {
        setCommentDraft("");
        setComments((prev) => [
          ...(prev ?? []),
          {
            id: `local-${Date.now()}`,
            body,
            created_by: currentUserId,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      return res;
    });
  }

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-2.5">
      {/* Collapsed summary row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-2 text-left"
      >
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: meta.bg, color: meta.fg }}
        >
          {meta.label}
        </span>
        {action.priority && action.priority !== "medium" ? (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={
              action.priority === "high"
                ? { background: "rgba(168,54,43,0.10)", color: "#a8362b" }
                : { background: "rgba(15,21,24,0.05)", color: "var(--fg-subtle)" }
            }
          >
            {action.priority === "high" ? "High priority" : "Low priority"}
          </span>
        ) : null}
        <span className="text-[11px] text-[var(--fg-muted)]">
          {assigneeLabel ? <>→ {assigneeLabel}</> : "Unassigned"}
        </span>
        {action.cap_target_date ? (
          <span
            className="text-[11px] font-medium"
            style={{ color: overdue ? "#a8362b" : "var(--fg-subtle)" }}
          >
            {overdue ? "OVERDUE · " : "due "}
            {action.cap_target_date}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-[var(--fg-subtle)]">
          {expanded ? "Hide action ▴" : "Action ▾"}
        </span>
      </button>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-3">
          {!readOnly ? (
            <>
              {/* Assignment row */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <label className="flex flex-col">
                  <span className="cl-label">Assign to</span>
                  <select
                    className="cl-input"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                  >
                    <option value="">— unassigned / by email —</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                {!assignee ? (
                  <label className="flex flex-col">
                    <span className="cl-label">or email</span>
                    <input
                      type="email"
                      className="cl-input"
                      placeholder="somebody@company.com"
                      value={assigneeEmail}
                      onChange={(e) => setAssigneeEmail(e.target.value)}
                    />
                  </label>
                ) : null}
                <label className="flex flex-col">
                  <span className="cl-label">Due</span>
                  <input
                    type="date"
                    className="cl-input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
                <label className="flex flex-col">
                  <span className="cl-label">Priority</span>
                  <select
                    className="cl-input"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as ActionPriority)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={saveAssignment}
                  className="cl-btn-outline text-xs"
                >
                  {isPending ? "Saving…" : "Save assignment"}
                </button>

                <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />

                {/* Lifecycle transitions, contextual to current status */}
                {status === "open" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        setActionStatus({ findingId, inspectionId, status: "in_progress" }),
                      )
                    }
                    className="cl-btn-outline text-xs"
                  >
                    Start work
                  </button>
                ) : null}
                {status === "open" || status === "in_progress" ? (
                  <>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setClosing(closing === "done" ? null : "done")}
                      className="cl-btn-accent text-xs"
                    >
                      Mark done…
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        setClosing(closing === "wont_fix" ? null : "wont_fix")
                      }
                      className="cl-btn-outline text-xs"
                    >
                      Won&apos;t fix…
                    </button>
                  </>
                ) : null}
                {status === "done" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        setActionStatus({ findingId, inspectionId, status: "verified" }),
                      )
                    }
                    className="cl-btn-accent text-xs"
                  >
                    Verify fix
                  </button>
                ) : null}
                {status !== "open" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        setActionStatus({ findingId, inspectionId, status: "open" }),
                      )
                    }
                    className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.04] hover:text-[var(--fg)]"
                  >
                    Reopen
                  </button>
                ) : null}
              </div>

              {/* Close-out flow — evidence required */}
              {closing ? (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-3">
                  <p className="text-xs font-medium text-[var(--fg)]">
                    {closing === "done"
                      ? "Close out this action"
                      : "Why won't this be fixed?"}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--fg-subtle)]">
                    {closing === "done"
                      ? "Best evidence is a re-photo of the corrected condition — add it to this inspection, then close. No photo? Write what was done instead; the note goes on the CAP."
                      : "A written reason is required — it prints on the CAP next to the finding."}
                  </p>
                  <textarea
                    className="cl-input mt-2 min-h-[64px] py-2"
                    placeholder={
                      closing === "done"
                        ? "e.g. Storage relocated, 36 in. clearance restored — re-photo added to this inspection."
                        : "e.g. Panel scheduled for replacement in Q4 capital project; interim measure in place."
                    }
                    value={closureNote}
                    onChange={(e) => setClosureNote(e.target.value)}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPending || !closureNote.trim()}
                      onClick={() => submitClose(closing)}
                      className="cl-btn-primary text-xs"
                    >
                      {isPending
                        ? "Saving…"
                        : closing === "done"
                          ? "Close as done"
                          : "Close as won't fix"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setClosing(null)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {/* Close-out trail (visible to everyone once closed) */}
          {action.action_closed_at ? (
            <p className="text-[11px] leading-relaxed text-[var(--fg-subtle)]">
              Closed {new Date(action.action_closed_at).toLocaleDateString()}
              {action.closure_note ? <> — “{action.closure_note}”</> : null}
            </p>
          ) : null}

          {error ? (
            <p className="text-xs font-medium" style={{ color: "#a8362b" }}>
              {error}
            </p>
          ) : null}

          {/* Comment thread */}
          <div className="flex flex-col gap-2">
            {comments === null ? (
              <p className="text-[11px] text-[var(--fg-subtle)]">Loading thread…</p>
            ) : comments.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {comments.map((c) => (
                  <li key={c.id} className="text-xs leading-relaxed">
                    <span className="font-medium text-[var(--fg)]">
                      {memberName(c.created_by) ??
                        (c.created_by === currentUserId ? "You" : "Teammate")}
                    </span>{" "}
                    <span className="text-[var(--fg-subtle)]">
                      · {new Date(c.created_at).toLocaleDateString()}
                    </span>
                    <p className="text-[var(--fg-muted)]">{c.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {!readOnly ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="cl-input flex-1"
                  placeholder="Add a note to this action…"
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") postComment();
                  }}
                />
                <button
                  type="button"
                  disabled={isPending || !commentDraft.trim()}
                  onClick={postComment}
                  className="cl-btn-outline text-xs"
                >
                  Post
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
