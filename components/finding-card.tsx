"use client";

import { useState, useTransition } from "react";
import {
  updateFinding,
  deleteFinding,
  type FindingPatch,
} from "@/app/inspections/[id]/photos/[photoId]/actions";

export type FindingRow = {
  id: string;
  inspection_id: string;
  title: string;
  category: string;
  code: string | null;
  severity: "Low" | "Medium" | "High";
  description: string | null;
  location: string | null;
  remediation: string | null;
  references: string[] | null;
  ai_confidence: number | null;
  edited: boolean;
};

const CATEGORIES = [
  "Fire",
  "Electrical",
  "Egress",
  "ADA",
  "Hazmat",
  "InfectionControl",
  "Structural",
  "Other",
] as const;

const SEVERITIES = ["Low", "Medium", "High"] as const;

export function FindingCard({
  finding,
  index,
}: {
  finding: FindingRow;
  index: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FindingPatch>({
    title: finding.title,
    category: finding.category,
    code: finding.code ?? "",
    severity: finding.severity,
    description: finding.description ?? "",
    location: finding.location ?? "",
    remediation: finding.remediation ?? "",
  });
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateFinding(finding.id, finding.inspection_id, draft);
      setEditing(false);
    });
  }

  function remove() {
    if (!confirm("Delete this finding? This cannot be undone.")) return;
    startTransition(async () => {
      await deleteFinding(finding.id, finding.inspection_id);
    });
  }

  const sev = severityStyles(finding.severity);

  return (
    <div className="cl-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
              style={{ background: "rgba(148,163,184,0.1)", color: "var(--fg-muted)" }}
            >
              #{index + 1}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: sev.bg, color: sev.fg }}
            >
              {finding.severity}
            </span>
            <span className="text-[11px] font-medium text-[var(--fg-muted)]">
              {finding.category}
            </span>
            {finding.code ? (
              <span className="text-[11px] font-medium text-[var(--fg-muted)]">
                · {finding.code}
              </span>
            ) : null}
            {finding.edited ? (
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--primary)]">
                edited
              </span>
            ) : finding.ai_confidence != null ? (
              <span className="text-[10px] text-[var(--fg-subtle)]">
                AI · {Math.round((finding.ai_confidence ?? 0) * 100)}%
              </span>
            ) : null}
          </div>
          {!editing ? (
            <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--fg)]">
              {finding.title}
            </h3>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {!editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.04] hover:text-[var(--fg)]"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={remove}
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.04] hover:text-[#fca5a5]"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setEditing(false)}
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.04] hover:text-[var(--fg)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={save}
                className="rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Title">
            <input
              type="text"
              className="cl-input"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severity">
              <select
                className="cl-input"
                value={draft.severity}
                onChange={(e) =>
                  setDraft({ ...draft, severity: e.target.value as "Low" | "Medium" | "High" })
                }
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                className="cl-input"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Code">
            <input
              type="text"
              className="cl-input"
              placeholder="e.g., NFPA 101"
              value={draft.code ?? ""}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            />
          </Field>
          <Field label="Location">
            <input
              type="text"
              className="cl-input"
              value={draft.location ?? ""}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="cl-input min-h-[88px] py-2.5"
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>
          <Field label="Remediation">
            <textarea
              className="cl-input min-h-[88px] py-2.5"
              value={draft.remediation ?? ""}
              onChange={(e) => setDraft({ ...draft, remediation: e.target.value })}
            />
          </Field>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2 text-sm">
          {finding.description ? (
            <p className="leading-relaxed text-[var(--fg-muted)]">
              {finding.description}
            </p>
          ) : null}
          {finding.location ? (
            <p className="text-xs text-[var(--fg-subtle)]">
              <span className="font-medium uppercase tracking-wider">Location · </span>
              {finding.location}
            </p>
          ) : null}
          {finding.remediation ? (
            <div className="mt-1 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--primary)]">
                Remediation
              </p>
              <p className="mt-1 leading-relaxed text-[var(--fg-muted)]">
                {finding.remediation}
              </p>
            </div>
          ) : null}
          {finding.references && finding.references.length > 0 ? (
            <p className="text-xs text-[var(--fg-subtle)]">
              <span className="font-medium uppercase tracking-wider">References · </span>
              {finding.references.join(", ")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col">
      <span className="cl-label">{label}</span>
      {children}
    </label>
  );
}

function severityStyles(s: "Low" | "Medium" | "High") {
  if (s === "High") return { bg: "rgba(239,68,68,0.12)", fg: "#fca5a5" };
  if (s === "Medium") return { bg: "rgba(245,158,11,0.12)", fg: "#fbbf24" };
  return { bg: "rgba(148,163,184,0.12)", fg: "#cbd5e1" };
}
