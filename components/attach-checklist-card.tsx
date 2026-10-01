"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/card";
import { attachChecklistToInspection } from "@/app/actions/checklist";

export type TemplateOption = { id: string; name: string; group: "standard" | "custom" };

/**
 * Shown on an in-progress inspection that has no checklist (created as
 * "General — photos only", or the template failed to attach at creation).
 * Without it a photo-only walk could never gain a scored checklist.
 */
export function AttachChecklistCard({
  inspectionId,
  templates,
}: {
  inspectionId: string;
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function attach() {
    if (!templateId) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await attachChecklistToInspection({ inspectionId, templateId });
        if (!res.ok) {
          setError(res.error ?? "Couldn't add the checklist.");
          return;
        }
        router.refresh();
      } catch {
        setError("Couldn't add the checklist — check your connection and try again.");
      }
    });
  }

  const standard = templates.filter((t) => t.group === "standard");
  const custom = templates.filter((t) => t.group === "custom");

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
        Checklist
      </h2>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        This inspection has no checklist yet. Add one to get a scored
        question set — photos you&apos;ve already analyzed stay as they are.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="attach_template" className="sr-only">
          Inspection type
        </label>
        <select
          id="attach_template"
          className="cl-input flex-1"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={pending}
        >
          <option value="">Choose an inspection type…</option>
          {standard.length > 0 ? (
            <optgroup label="Standard inspection types">
              {standard.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {custom.length > 0 ? (
            <optgroup label="Your inspection types">
              {custom.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <button
          type="button"
          onClick={attach}
          disabled={!templateId || pending}
          className="cl-btn-primary disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add checklist"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
