"use client";

import { useState } from "react";
import { addCustomFinding } from "@/app/inspections/[id]/photos/[photoId]/actions";
import { BboxPicker, type Bbox } from "@/components/bbox-picker";
import { SubmitButton } from "@/components/submit-button";
import { showToast } from "@/components/toaster";
import { severityColor, type Severity } from "@/lib/severity";

type Props = {
  inspectionId: string;
  photoId: string;
  /** Signed URL of the photo so the inspector can draw a bbox on it. */
  photoUrl: string | null;
};

const SEVERITIES: Severity[] = ["Low", "Medium", "High"];
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

// Common code citations the inspector might pick. Free-text wins; this list
// just feeds the <datalist> for autocomplete suggestions.
const CODE_SUGGESTIONS = [
  "NFPA 10 §6.1.3.8.1",
  "NFPA 10 §7.2",
  "NFPA 10 §7.3",
  "NFPA 10 §8.3",
  "NFPA 13",
  "NFPA 25 §3.3",
  "NFPA 25 §5.2.4",
  "NFPA 25 §13.4.4.2",
  "NFPA 70 §300.21",
  "NFPA 72",
  "NFPA 80 §4.1.4",
  "NFPA 99",
  "NFPA 101 §7.1.10.1",
  "NFPA 101 §7.10",
  "NFPA 101 §8.3.1.4",
  "NFPA 101 §8.3.5.1",
  "NFPA 101 §8.4",
  "NFPA 101 §8.5",
  "NFPA 101 §18.3.7",
  "NFPA 101 §19.3.7",
  "NFPA 701",
  "IBC §703.7",
  "IBC §714.4",
  "NEC §110.26",
];

type Draft = {
  category: (typeof CATEGORIES)[number];
  title: string;
  code: string;
  location: string;
  description: string;
  remediation: string;
  references: string;
};

const EMPTY_DRAFT: Draft = {
  category: "Fire",
  title: "",
  code: "",
  location: "",
  description: "",
  remediation: "",
  references: "",
};

/**
 * Inspector-authored ("custom") finding entry. The AI doesn't always catch
 * everything; this form lets the inspector add their own deficiency to the
 * photo with the same fields the AI fills in.
 *
 * Fields are CONTROLLED on purpose: React 19 resets uncontrolled inputs
 * after a form action completes, so a failed save would wipe the draft.
 * The form only closes when the server confirms the insert.
 */
export function AddFindingForm({ inspectionId, photoId, photoUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<Severity>("Medium");
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function close() {
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    setBbox(null);
    setSeverity("Medium");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cl-btn-outline w-full sm:w-auto"
      >
        + Add custom finding
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        const res = await addCustomFinding(fd);
        if (!res.ok) {
          // Keep the form open — every field is controlled so the draft
          // survives React's post-action reset.
          showToast({ kind: "error", message: res.error });
          return;
        }
        showToast({ kind: "success", message: "Finding added." });
        close();
      }}
      className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
    >
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <input type="hidden" name="photo_id" value={photoId} />
      <input type="hidden" name="severity" value={severity} />
      {bbox ? (
        <>
          <input type="hidden" name="bbox_x1" value={bbox.x1} />
          <input type="hidden" name="bbox_y1" value={bbox.y1} />
          <input type="hidden" name="bbox_x2" value={bbox.x2} />
          <input type="hidden" name="bbox_y2" value={bbox.y2} />
        </>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          Custom finding
        </h3>
        <button
          type="button"
          onClick={close}
          className="text-xs text-[var(--fg-muted)] underline-offset-2 hover:underline"
        >
          Cancel
        </button>
      </div>

      {/* Bbox picker (optional) */}
      {photoUrl ? (
        <div>
          <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
            Mark on photo (optional)
          </label>
          <div className="mt-1.5">
            <BboxPicker src={photoUrl} initial={bbox} onChange={setBbox} />
          </div>
        </div>
      ) : null}

      {/* Severity pills */}
      <div>
        <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
          Severity
        </label>
        <div className="mt-1.5 flex gap-2">
          {SEVERITIES.map((s) => {
            const selected = severity === s;
            const sev = severityColor(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                aria-pressed={selected}
                className={[
                  "min-h-[40px] rounded-full border px-3 py-1 text-xs font-semibold transition sm:min-h-0",
                  selected
                    ? "text-white"
                    : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/5",
                ].join(" ")}
                style={
                  selected
                    ? { background: sev.fg, borderColor: sev.fg }
                    : undefined
                }
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category */}
      <div>
        <label
          htmlFor="cf-category"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
        >
          Category
        </label>
        <select
          id="cf-category"
          name="category"
          value={draft.category}
          onChange={(e) => set("category", e.target.value as Draft["category"])}
          className="cl-input mt-1.5"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div>
        <label
          htmlFor="cf-title"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
        >
          Title <span className="text-[var(--accent)]">*</span>
        </label>
        <input
          id="cf-title"
          name="title"
          required
          maxLength={200}
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g., Unsealed annular space around MC cable"
          className="cl-input mt-1.5"
        />
      </div>

      {/* Code */}
      <div>
        <label
          htmlFor="cf-code"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
        >
          Code reference (optional)
        </label>
        <input
          id="cf-code"
          name="code"
          list="cf-code-suggestions"
          value={draft.code}
          onChange={(e) => set("code", e.target.value)}
          placeholder="e.g., NFPA 101 §8.3.5.1"
          className="cl-input mt-1.5"
        />
        <datalist id="cf-code-suggestions">
          {CODE_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <p className="mt-1 text-[10px] text-[var(--fg-subtle)]">
          Type freely or pick from common citations.
        </p>
      </div>

      {/* Location */}
      <div>
        <label
          htmlFor="cf-location"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
        >
          Location (optional)
        </label>
        <input
          id="cf-location"
          name="location"
          maxLength={200}
          value={draft.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="e.g., Above ceiling, north wall, room 214"
          className="cl-input mt-1.5"
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="cf-description"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
        >
          Description
        </label>
        <textarea
          id="cf-description"
          name="description"
          rows={3}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="What is the problem and why is it a deficiency?"
          className="cl-input mt-1.5 resize-y"
        />
      </div>

      {/* Remediation */}
      <div>
        <label
          htmlFor="cf-remediation"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
        >
          Remediation
        </label>
        <textarea
          id="cf-remediation"
          name="remediation"
          rows={3}
          value={draft.remediation}
          onChange={(e) => set("remediation", e.target.value)}
          placeholder="How should it be corrected?"
          className="cl-input mt-1.5 resize-y"
        />
      </div>

      {/* References */}
      <div>
        <label
          htmlFor="cf-references"
          className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
        >
          References (optional, comma- or semicolon-separated)
        </label>
        <input
          id="cf-references"
          name="references"
          value={draft.references}
          onChange={(e) => set("references", e.target.value)}
          placeholder="e.g., NFPA 101 §8.3.5.1; UL XHEZ"
          className="cl-input mt-1.5"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={close} className="cl-btn-outline">
          Cancel
        </button>
        <SubmitButton className="cl-btn-accent" pendingLabel="Adding…">
          Add finding
        </SubmitButton>
      </div>
    </form>
  );
}
