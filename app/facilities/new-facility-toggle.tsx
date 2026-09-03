"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { NewFacilityForm } from "./new-facility-form";

/** "+ New facility" button that opens the create form in a sheet. */
export function NewFacilityToggle({ orgName }: { orgName: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cl-btn-accent">
        + New facility
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
              style={{ background: "rgba(10,13,18,0.6)" }}
              role="dialog"
              aria-modal="true"
              aria-label="New facility"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                className="w-full max-w-lg rounded-t-xl p-5 sm:rounded-xl"
                style={{ background: "var(--bg, #ece8da)", color: "var(--fg)" }}
              >
                <h2 className="text-lg font-semibold tracking-tight">New facility</h2>
                <div className="mt-4">
                  <NewFacilityForm orgName={orgName} onDone={() => setOpen(false)} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
