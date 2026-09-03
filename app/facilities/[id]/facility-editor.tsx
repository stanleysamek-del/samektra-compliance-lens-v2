"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteFacility, updateFacility } from "@/app/actions/facilities";
import { showToast } from "@/components/toaster";
import { OCCUPANCY_OPTIONS } from "../new-facility-form";

/**
 * Facility header: name / address / occupancy with inline edit, and a
 * confirmed delete (plans + pins cascade; inspections keep their rows).
 */
export function FacilityEditor({
  facility,
  canWrite,
  planCount,
  inspectionCount,
}: {
  facility: {
    id: string;
    name: string;
    address: string | null;
    occupancy: string | null;
    isTeam: boolean;
  };
  canWrite: boolean;
  planCount: number;
  inspectionCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(facility.name);
  const [address, setAddress] = useState(facility.address ?? "");
  const [occupancy, setOccupancy] = useState(facility.occupancy ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateFacility(facility.id, { name, address, occupancy });
      if (!res.ok) {
        showToast({ kind: "error", message: res.error });
        return;
      }
      showToast({ kind: "success", message: "Facility updated." });
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    const what = [
      planCount > 0 ? `${planCount} plan${planCount === 1 ? "" : "s"} and every pin on them` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const msg =
      `Delete "${facility.name}"?` +
      (what ? ` This removes ${what}.` : "") +
      (inspectionCount > 0
        ? ` The ${inspectionCount} inspection${inspectionCount === 1 ? "" : "s"} here keep their photos and findings.`
        : "") +
      " This cannot be undone.";
    if (!window.confirm(msg)) return;
    start(async () => {
      const res = await deleteFacility(facility.id);
      if (!res.ok) {
        showToast({ kind: "error", message: res.error });
        return;
      }
      showToast({ kind: "success", message: "Facility deleted." });
      router.push("/facilities");
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
          <label className="cl-label" htmlFor="fe_name">
            Facility name
          </label>
          <input
            id="fe_name"
            className="cl-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col">
            <label className="cl-label" htmlFor="fe_address">
              Address
            </label>
            <input
              id="fe_address"
              className="cl-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="cl-label" htmlFor="fe_occ">
              Occupancy
            </label>
            <input
              id="fe_occ"
              className="cl-input"
              list="fe_occ_options"
              value={occupancy}
              onChange={(e) => setOccupancy(e.target.value)}
            />
            <datalist id="fe_occ_options">
              {OCCUPANCY_OPTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !name.trim()}
            className="cl-btn-accent"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(facility.name);
              setAddress(facility.address ?? "");
              setOccupancy(facility.occupancy ?? "");
            }}
            disabled={pending}
            className="cl-btn-outline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--fg)] sm:text-2xl">
            {facility.name}
          </h1>
          {facility.isTeam ? (
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Team
            </span>
          ) : null}
        </div>
        {facility.address ? (
          <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{facility.address}</p>
        ) : null}
        <p className="mt-1 text-xs text-[var(--fg-subtle)]">
          {facility.occupancy ? `${facility.occupancy} · ` : ""}
          {planCount} plan{planCount === 1 ? "" : "s"} · {inspectionCount} inspection
          {inspectionCount === 1 ? "" : "s"}
        </p>
      </div>
      {canWrite ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-[40px] rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="min-h-[40px] rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] transition hover:text-[#a8362b]"
          >
            {pending ? "…" : "Delete"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
