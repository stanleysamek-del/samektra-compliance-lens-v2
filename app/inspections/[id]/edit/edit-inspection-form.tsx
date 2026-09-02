"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { showToast } from "@/components/toaster";
import {
  updateInspection,
  type InspectionEditValues,
  type UpdateInspectionState,
} from "../actions";

/**
 * Edit-details form. Inputs are CONTROLLED so a failed save (validation
 * or RLS) never resets the fields to the DB values — React 19 resets
 * uncontrolled inputs after a form action completes, which is exactly
 * how the previous version threw away what the user had typed.
 *
 * On success the server action redirects to the inspection page; on
 * failure it returns `{ ok: false, error, values }` and we render the
 * banner + toast while keeping the draft.
 */
export function EditInspectionForm({
  inspectionId,
  initial,
}: {
  inspectionId: string;
  initial: InspectionEditValues;
}) {
  const [state, formAction] = useActionState<UpdateInspectionState, FormData>(
    updateInspection,
    { ok: true, error: null, values: null },
  );
  const [values, setValues] = useState<InspectionEditValues>(initial);

  // Surface the failure where a phone user will see it, even if the banner
  // is below the fold.
  useEffect(() => {
    if (!state.ok && state.error) {
      showToast({ kind: "error", message: state.error });
    }
  }, [state]);

  function set<K extends keyof InspectionEditValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="inspection_id" value={inspectionId} />

      <div className="flex flex-col">
        <label htmlFor="facility_name" className="cl-label">
          Facility name <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="facility_name"
          name="facility_name"
          type="text"
          required
          value={values.facility_name}
          onChange={(e) => set("facility_name", e.target.value)}
          className="cl-input"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="facility_address" className="cl-label">
          Facility address
        </label>
        <input
          id="facility_address"
          name="facility_address"
          type="text"
          value={values.facility_address}
          onChange={(e) => set("facility_address", e.target.value)}
          className="cl-input"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="location" className="cl-label">
          Location
        </label>
        <input
          id="location"
          name="location"
          type="text"
          value={values.location}
          onChange={(e) => set("location", e.target.value)}
          className="cl-input"
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="inspector_name" className="cl-label">
          Inspector name
        </label>
        <input
          id="inspector_name"
          name="inspector_name"
          type="text"
          value={values.inspector_name}
          onChange={(e) => set("inspector_name", e.target.value)}
          className="cl-input"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col">
          <label htmlFor="manager_assigned" className="cl-label">
            Assigned manager
          </label>
          <input
            id="manager_assigned"
            name="manager_assigned"
            type="text"
            value={values.manager_assigned}
            onChange={(e) => set("manager_assigned", e.target.value)}
            className="cl-input"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="manager_assigned_email" className="cl-label">
            Manager email
          </label>
          <input
            id="manager_assigned_email"
            name="manager_assigned_email"
            type="email"
            value={values.manager_assigned_email}
            onChange={(e) => set("manager_assigned_email", e.target.value)}
            className="cl-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col">
          <label htmlFor="date_of_inspection" className="cl-label">
            Date of inspection
          </label>
          <input
            id="date_of_inspection"
            name="date_of_inspection"
            type="date"
            value={values.date_of_inspection}
            onChange={(e) => set("date_of_inspection", e.target.value)}
            className="cl-input"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="date_assigned" className="cl-label">
            Date assigned (manager)
          </label>
          <input
            id="date_assigned"
            name="date_assigned"
            type="date"
            value={values.date_assigned}
            onChange={(e) => set("date_assigned", e.target.value)}
            className="cl-input"
          />
        </div>
      </div>

      {!state.ok && state.error ? (
        <p
          role="alert"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "rgba(168,54,43,0.4)",
            background: "rgba(168,54,43,0.08)",
            color: "#a8362b",
          }}
        >
          {state.error} Your changes are still in the form — fix and save
          again.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <SubmitButton
          className="cl-btn-primary w-full sm:w-auto sm:flex-1"
          pendingLabel="Saving…"
        >
          Save changes
        </SubmitButton>
        <Link
          href={`/inspections/${inspectionId}`}
          className="cl-btn-outline w-full sm:w-auto"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
