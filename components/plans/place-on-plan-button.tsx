"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { PlanViewer } from "@/components/plans/plan-viewer";
import { showToast } from "@/components/toaster";
import {
  createPin,
  deletePin,
  listFacilityPlans,
  movePin,
  type FacilityPlanForClient,
} from "@/app/actions/plans";
import type { PinRow, ViewerPin } from "@/components/plans/types";

/* =====================================================================
 * PlaceOnPlanButton — "this is where it is".
 *
 * Opens a full-screen sheet with the facility's plans (one tab per plan)
 * in PLACE mode; a tap drops the pin and records it. A finding can only
 * have one pin (createPin moves it); a photo pin passes its existing id
 * so re-placing moves rather than duplicates.
 *
 * Degrades honestly:
 *   - no facility on the inspection → note + link to the edit page
 *   - facility without plans       → link to the facility page to upload
 * ===================================================================== */

type Props = {
  facilityId: string | null | undefined;
  inspectionId: string;
  kind: "finding" | "photo";
  findingId?: string | null;
  photoId?: string | null;
  /** Shown in the sheet header + pin popover: finding title / photo location. */
  label: string;
  /** Existing pin, if any — renders the "Pinned on …" state. */
  existingPin?: { id: string; planName: string } | null;
  readOnly?: boolean;
  /** Tighter styling for the finding card's action row. */
  compact?: boolean;
};

export function PlaceOnPlanButton({
  facilityId,
  inspectionId,
  kind,
  findingId,
  photoId,
  label,
  existingPin,
  readOnly = false,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState<{ id: string; planName: string } | null>(
    existingPin ?? null,
  );

  const btnClass = compact
    ? "inline-flex min-h-[40px] items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition sm:min-h-0"
    : "cl-btn-outline inline-flex min-h-[44px] items-center gap-1.5 text-sm";

  if (!facilityId) {
    return (
      <p className="text-xs text-[var(--fg-subtle)]">
        <span aria-hidden>📍 </span>
        Set a facility on this inspection to mark it on the plan —{" "}
        <Link
          href={`/inspections/${inspectionId}/edit`}
          className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
        >
          edit inspection
        </Link>
        .
      </p>
    );
  }

  if (readOnly) {
    return pinned ? (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--fg-muted)]">
        <span aria-hidden>📍</span> Pinned on {pinned.planName}
      </span>
    ) : null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnClass}
        style={
          compact
            ? { color: pinned ? "#607a3a" : "var(--fg-muted)", background: "rgba(15,21,24,0.04)" }
            : undefined
        }
        title={pinned ? "Move this pin on the plan" : "Mark where this is on the life-safety plan"}
      >
        <span aria-hidden>📍</span>
        {pinned ? `Pinned on ${pinned.planName} · move` : "Place on plan"}
      </button>
      {open ? (
        <PlaceSheet
          facilityId={facilityId}
          inspectionId={inspectionId}
          kind={kind}
          findingId={findingId ?? null}
          photoId={photoId ?? null}
          label={label}
          existingPinId={pinned?.id ?? null}
          onClose={() => setOpen(false)}
          onPinned={(p) => {
            setPinned(p);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------------- */

function PlaceSheet({
  facilityId,
  inspectionId,
  kind,
  findingId,
  photoId,
  label,
  existingPinId,
  onClose,
  onPinned,
}: {
  facilityId: string;
  inspectionId: string;
  kind: "finding" | "photo";
  findingId: string | null;
  photoId: string | null;
  label: string;
  existingPinId: string | null;
  onClose: () => void;
  onPinned: (p: { id: string; planName: string }) => void;
}) {
  const [plans, setPlans] = useState<FacilityPlanForClient[] | null>(null);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listFacilityPlans({ facilityId, inspectionId }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setPlans([]);
        return;
      }
      setPlans(res.plans ?? []);
      setPins(res.pins ?? []);
      setActiveId((res.plans ?? [])[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [facilityId, inspectionId]);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const active = plans?.find((p) => p.id === activeId) ?? null;

  // Existing pins on the active plan, shown as context (dots).
  const contextPins: ViewerPin[] = pins
    .filter((p) => p.plan_id === activeId)
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      x: p.x,
      y: p.y,
      label: p.label,
      number: null,
      title:
        p.finding_id && p.finding_id === findingId
          ? `${label} (current pin)`
          : p.kind === "finding"
            ? "Another finding"
            : p.kind === "photo"
              ? "Photo"
              : p.label ?? "Pin",
      subtitle: p.label,
      href: null,
    }));

  async function place(x: number, y: number) {
    if (!active || saving) return;
    setSaving(true);
    try {
      if (kind === "photo" && existingPinId) {
        // Photo pins have no "one per photo" rule in the DB, so we keep
        // it ourselves: same plan → move; different plan → replace.
        const samePlan = pins.find((p) => p.id === existingPinId)?.plan_id === active.id;
        if (samePlan) {
          const mv = await movePin(existingPinId, x, y);
          if (!mv.ok) {
            showToast({ kind: "error", message: mv.error });
            return;
          }
          showToast({ kind: "success", message: `Pin moved on ${active.name}.` });
          onPinned({ id: existingPinId, planName: active.name });
          return;
        }
        await deletePin(existingPinId); // best-effort; create below either way
      }
      const res = await createPin({
        planId: active.id,
        facilityId,
        kind,
        inspectionId,
        findingId,
        photoId,
        x,
        y,
      });
      if (!res.ok) {
        showToast({ kind: "error", message: res.error });
        return;
      }
      showToast({
        kind: "success",
        message: `${res.moved ? "Pin moved to" : "Pinned on"} ${res.planName ?? active.name}.`,
      });
      onPinned({ id: res.pinId ?? "", planName: res.planName ?? active.name });
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ background: "rgba(10,13,18,0.7)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Place on plan"
    >
      <div
        className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden sm:my-4 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl"
        style={{ background: "var(--bg, #ece8da)", color: "var(--fg)" }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
              Place on plan
            </p>
            <p className="truncate text-sm font-medium">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-xl text-[var(--fg-muted)]"
          >
            ×
          </button>
        </div>

        {plans === null ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]">Loading plans…</p>
        ) : error ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: "#a8362b" }}>
            {error}
          </p>
        ) : plans.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
            <p>This facility has no plans yet.</p>
            <Link
              href={`/facilities/${facilityId}`}
              className="cl-btn-accent mt-4 inline-flex min-h-[44px] items-center"
            >
              Upload a plan on the facility page →
            </Link>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
            {plans.length > 1 ? (
              <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
                {plans.map((p) => {
                  const on = p.id === activeId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setActiveId(p.id)}
                      className="min-h-[44px] shrink-0 rounded-md px-3 text-xs font-medium transition"
                      style={{
                        background: on ? "var(--gold, #c89b3c)" : "rgba(15,21,24,0.05)",
                        color: on ? "var(--ink, #0f1518)" : "var(--fg-muted)",
                        border: `1px solid ${on ? "var(--gold, #c89b3c)" : "var(--border)"}`,
                      }}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {active ? (
              <PlanViewer
                key={active.id}
                src={active.url}
                width={active.width}
                height={active.height}
                pins={contextPins}
                mode="place"
                onPlace={place}
                heightClass="h-[62dvh] min-h-[280px] sm:h-[60vh]"
                placeHint={
                  saving ? "Saving pin…" : "Tap where it is. Drag to pan, pinch to zoom."
                }
              />
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
