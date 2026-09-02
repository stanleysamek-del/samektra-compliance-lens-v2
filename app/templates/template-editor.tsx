"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/card";
import {
  deleteChecklistTemplate,
  saveChecklistTemplate,
} from "@/app/actions/checklist";
import type { TemplateSection } from "@/lib/checklists/builtin-templates";

/**
 * Custom checklist template editor — used for "create from scratch",
 * "duplicate a built-in", and "edit my template". Sections hold questions;
 * each question can carry a code reference and AI match terms (the
 * substrings the analyzer scores findings against for auto-filing).
 */

type Props = {
  templateId?: string | null;
  initial: {
    name: string;
    description: string;
    occupancy: string;
    sections: TemplateSection[];
  };
  orgId?: string | null;
  orgName?: string | null;
};

export function TemplateEditor({ templateId, initial, orgId, orgName }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [occupancy, setOccupancy] = useState(initial.occupancy);
  const [sections, setSections] = useState<TemplateSection[]>(
    initial.sections.length > 0
      ? initial.sections
      : [{ code: "A1", title: "", items: [{ q: "" }] }],
  );
  const [shareWithOrg, setShareWithOrg] = useState(Boolean(orgId));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patchSection(idx: number, patch: Partial<TemplateSection>) {
    setSections((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  }

  function patchItem(
    sIdx: number,
    iIdx: number,
    patch: Partial<TemplateSection["items"][number]> & { matchText?: string },
  ) {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        return {
          ...s,
          items: s.items.map((item, j) => {
            if (j !== iIdx) return item;
            const next = { ...item, ...patch };
            if (patch.matchText !== undefined) {
              const terms = patch.matchText
                .split(",")
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean);
              next.match = terms.length > 0 ? terms : undefined;
              delete (next as Record<string, unknown>).matchText;
            }
            return next;
          }),
        };
      }),
    );
  }

  function save() {
    setError(null);
    // Strip empty questions/sections before validating server-side.
    const cleaned = sections
      .map((s) => ({
        code: s.code.trim(),
        title: s.title.trim(),
        items: s.items.filter((i) => i.q.trim().length > 0),
      }))
      .filter((s) => s.code && s.title && s.items.length > 0);
    startTransition(async () => {
      const res = await saveChecklistTemplate({
        id: templateId ?? null,
        name,
        description,
        occupancy,
        sections: cleaned,
        orgId: shareWithOrg ? orgId : null,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save the template.");
        return;
      }
      router.push("/templates");
      router.refresh();
    });
  }

  function remove() {
    if (!templateId) return;
    if (!window.confirm("Delete this template? Existing inspections keep their checklists.")) {
      return;
    }
    startTransition(async () => {
      const res = await deleteChecklistTemplate(templateId);
      if (!res.ok) {
        setError(res.error ?? "Couldn't delete the template.");
        return;
      }
      router.push("/templates");
      router.refresh();
    });
  }

  const totalQuestions = sections.reduce(
    (n, s) => n + s.items.filter((i) => i.q.trim()).length,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col sm:col-span-2">
            <label className="cl-label">Template name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="cl-input"
              placeholder="Hospital Smoke Compartment Round — Campus A"
            />
          </div>
          <div className="flex flex-col">
            <label className="cl-label">Occupancy</label>
            <input
              value={occupancy}
              onChange={(e) => setOccupancy(e.target.value)}
              className="cl-input"
              placeholder="Healthcare / Business / Restaurant…"
            />
          </div>
          <div className="flex flex-col">
            <label className="cl-label">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="cl-input"
              placeholder="What this round covers"
            />
          </div>
        </div>
        {orgId && !templateId ? (
          <label className="mt-3 flex items-center gap-2 text-sm text-[var(--fg)]">
            <input
              type="checkbox"
              checked={shareWithOrg}
              onChange={(e) => setShareWithOrg(e.target.checked)}
            />
            Share with {orgName ?? "my team"} (everyone on the team can use it)
          </label>
        ) : null}
      </Card>

      {sections.map((section, sIdx) => (
        <Card key={sIdx}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={section.code}
              onChange={(e) => patchSection(sIdx, { code: e.target.value })}
              className="cl-input w-20"
              placeholder="A1"
              aria-label="Section code"
            />
            <input
              value={section.title}
              onChange={(e) => patchSection(sIdx, { title: e.target.value })}
              className="cl-input flex-1"
              placeholder="Section title (e.g. Fire Doors)"
              aria-label="Section title"
            />
            <button
              type="button"
              onClick={() =>
                setSections((prev) => prev.filter((_, i) => i !== sIdx))
              }
              className="cl-btn-outline px-3 py-1.5 text-xs"
            >
              Remove section
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {section.items.map((item, iIdx) => (
              <div
                key={iIdx}
                className="rounded border border-[var(--border)] p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-xs tabular-nums text-[var(--fg-subtle)]">
                    {section.code || "?"}.{iIdx + 1}
                  </span>
                  <textarea
                    value={item.q}
                    onChange={(e) => patchItem(sIdx, iIdx, { q: e.target.value })}
                    rows={2}
                    className="cl-input flex-1 text-sm"
                    placeholder="Question — phrased so 'Yes' means compliant"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      patchSection(sIdx, {
                        items: section.items.filter((_, j) => j !== iIdx),
                      })
                    }
                    className="cl-btn-outline px-2 py-1 text-xs"
                    aria-label="Remove question"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={item.ref ?? ""}
                    onChange={(e) =>
                      patchItem(sIdx, iIdx, {
                        ref: e.target.value.trim() || undefined,
                      })
                    }
                    className="cl-input text-xs"
                    placeholder="Code ref (optional) — NFPA 80 §5.2"
                  />
                  <input
                    defaultValue={(item.match ?? []).join(", ")}
                    onChange={(e) =>
                      patchItem(sIdx, iIdx, { matchText: e.target.value })
                    }
                    className="cl-input text-xs"
                    placeholder="AI match terms (optional) — door latch, latching"
                    title="Comma-separated substrings. When AI photo analysis produces a finding containing one of these, this question is auto-marked No for you to confirm."
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patchSection(sIdx, { items: [...section.items, { q: "" }] })
              }
              className="cl-btn-outline self-start px-3 py-1.5 text-xs"
            >
              + Add question
            </button>
          </div>
        </Card>
      ))}

      <button
        type="button"
        onClick={() =>
          setSections((prev) => [
            ...prev,
            { code: `A${prev.length + 1}`, title: "", items: [{ q: "" }] },
          ])
        }
        className="cl-btn-outline self-start"
      >
        + Add section
      </button>

      {error ? (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="cl-btn-accent"
        >
          {pending ? "Saving…" : templateId ? "Save changes" : "Create template"}
        </button>
        <Link href="/templates" className="cl-btn-outline">
          Cancel
        </Link>
        {templateId ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="ml-auto text-sm font-medium text-red-700 underline"
          >
            Delete template
          </button>
        ) : null}
        <span className="w-full text-xs text-[var(--fg-subtle)]">
          {totalQuestions} question{totalQuestions === 1 ? "" : "s"} across{" "}
          {sections.length} section{sections.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
