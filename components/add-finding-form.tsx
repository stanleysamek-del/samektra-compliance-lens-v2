"use client";

import { useState } from "react";
import { addCustomFinding } from "@/app/inspections/[id]/photos/[photoId]/actions";
import { BboxPicker, type Bbox } from "@/components/bbox-picker";

type Props = {
  inspectionId: string;
  photoId: string;
  /** Signed URL of the photo so the inspector can draw a bbox on it. */
  photoUrl: string | null;
};

const SEVERITIES = ["Low", "Medium", "High"] as const;
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

/**
 * Inspector-authored ("custom") finding entry. The AI doesn't always catch
 * everything; this form lets the inspector add their own deficiency to the
 * photo with the same fields the AI fills in.
 *
 * Severity and category are constrained selects (matches the schema enums);
 * code, location, and references are free-text with autocomplete; title,
 * description, and remediation are open text.
 */
export function AddFindingForm({ inspectionId, photoId, photoUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>("Medium");
  const [bbox, setBbox] = useState<Bbox | null>(null);

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
        await addCustomFinding(fd);
        setOpen(false);
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
          onClick={() => setOpen(false)}
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
            <BboxPicker src={photoUrl} onChange={setBbox} />
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
            const color =
              s === "High"
                ? "#f87171"
                : s === "Medium"
                  ? "#fbbf24"
                  : "#34d399";
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  selected
                    ? "text-[#0a0d12]"
                    : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/5",
                ].join(" ")}
                style={
                  selected
                    ? { background: color, borderColor: color }
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
          defaultValue="Fire"
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
          placeholder="e.g., NFPA 101 §8.3.5.1; UL XHEZ"
          className="cl-input mt-1.5"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cl-btn-outline"
        >
          Cancel
        </button>
        <button type="submit" className="cl-btn-accent">
          Add finding
        </button>
      </div>
    </form>
  );
}
