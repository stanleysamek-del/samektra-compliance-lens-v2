"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFacility } from "@/app/actions/facilities";
import { showToast } from "@/components/toaster";

export const OCCUPANCY_OPTIONS = [
  "Health Care",
  "Ambulatory Health Care",
  "Business",
  "Assembly",
  "Educational",
  "Day Care",
  "Residential Board and Care",
  "Apartment",
  "Hotel / Dormitory",
  "Mercantile",
  "Industrial",
  "Storage",
  "Detention / Correctional",
  "Mixed",
];

/**
 * Inline "New facility" form for /facilities. Creates the facility
 * (org-scoped when the user is inside a team) and lands on its page so
 * the next step — uploading the plan — is right there.
 */
export function NewFacilityForm({
  orgName,
  onDone,
}: {
  orgName?: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [occupancy, setOccupancy] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showToast({ kind: "error", message: "Give the facility a name." });
      return;
    }
    start(async () => {
      const res = await createFacility({ name, address, occupancy });
      if (!res.ok) {
        showToast({ kind: "error", message: res.error });
        return;
      }
      showToast({ kind: "success", message: "Facility created." });
      onDone?.();
      if (res.id) router.push(`/facilities/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col">
        <label htmlFor="fac_name" className="cl-label">
          Facility name <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="fac_name"
          type="text"
          required
          className="cl-input"
          placeholder="Mercy Health — Atlanta Campus"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col">
          <label htmlFor="fac_address" className="cl-label">
            Address
          </label>
          <input
            id="fac_address"
            type="text"
            className="cl-input"
            placeholder="123 Compliance Way, Atlanta, GA 30301"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="fac_occupancy" className="cl-label">
            Occupancy
          </label>
          <input
            id="fac_occupancy"
            type="text"
            className="cl-input"
            list="fac_occupancy_options"
            placeholder="Health Care"
            value={occupancy}
            onChange={(e) => setOccupancy(e.target.value)}
          />
          <datalist id="fac_occupancy_options">
            {OCCUPANCY_OPTIONS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
      </div>
      <p className="text-xs text-[var(--fg-subtle)]">
        {orgName
          ? `Shared with everyone on ${orgName}.`
          : "Personal — only you can see it. Switch into a team first to share it."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="cl-btn-accent w-full sm:w-auto"
        >
          {pending ? "Creating…" : "Create facility"}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="cl-btn-outline w-full sm:w-auto"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
