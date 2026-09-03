"use client";

import { useState } from "react";
import Link from "next/link";

export type FacilityOption = {
  id: string;
  name: string;
  address: string | null;
};

export const NEW_FACILITY_VALUE = "__new__";

/**
 * Facility picker for the New Inspection form. Owns the `facility_id`
 * select AND the `facility_name` text input so choosing a facility
 * prefills the name (and the address field further down the form).
 *
 *   ""           → no facility: the inspection keeps only its typed name
 *                  (exactly today's behavior)
 *   <uuid>       → link to that facility; name/address prefilled, editable
 *   "__new__"    → the server creates a facility from the typed name
 */
export function FacilityPicker({ facilities }: { facilities: FacilityOption[] }) {
  const [choice, setChoice] = useState("");
  const [name, setName] = useState("");

  function onChoose(value: string) {
    setChoice(value);
    const f = facilities.find((x) => x.id === value);
    if (f) {
      setName(f.name);
      // The address input lives in the collapsed "More details" block of
      // the parent form; prefill it directly rather than lifting state.
      const addr = document.getElementById("facility_address") as HTMLInputElement | null;
      if (addr && f.address) addr.value = f.address;
    }
    // "" (none) and "__new__" keep whatever the inspector typed.
  }

  const chosen = facilities.find((x) => x.id === choice) ?? null;

  return (
    <>
      <div className="flex flex-col">
        <label htmlFor="facility_id" className="cl-label">
          Facility
        </label>
        <select
          id="facility_id"
          name="facility_id"
          className="cl-input"
          value={choice}
          onChange={(e) => onChoose(e.target.value)}
        >
          <option value="">— None (just type a name below) —</option>
          {facilities.length > 0 ? (
            <optgroup label="Your facilities">
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.address ? ` — ${f.address}` : ""}
                </option>
              ))}
            </optgroup>
          ) : null}
          <option value={NEW_FACILITY_VALUE}>+ New facility…</option>
        </select>
        <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
          {chosen
            ? "Findings can be pinned on this facility's life-safety plan."
            : choice === NEW_FACILITY_VALUE
              ? "A facility is created from the name below. Upload its plan afterwards under "
              : "Link a facility to mark findings on its life-safety plan. Manage them under "}
          {!chosen ? (
            <Link href="/facilities" className="underline">
              Facilities
            </Link>
          ) : null}
          {!chosen ? "." : ""}
        </p>
      </div>

      <div className="flex flex-col">
        <label htmlFor="facility_name" className="cl-label">
          Facility name <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="facility_name"
          name="facility_name"
          type="text"
          required
          placeholder="Mercy Health — Atlanta Campus"
          className="cl-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
    </>
  );
}
