"use client";
import { useState } from "react";
import Link from "next/link";
import { PlanViewer } from "@/components/plans/plan-viewer";
import type { PinRow, ViewerPin } from "@/components/plans/types";
import {
  listFacilityPlans,
  type FacilityPlanForClient,
} from "@/app/actions/plans";
import { placeEquipment } from "@/app/assets/actions";
export function AssetPlan({
  assetId,
  facilityId,
  label,
  initialPins,
  canWrite,
}: {
  assetId: string;
  facilityId: string;
  label: string;
  initialPins: PinRow[];
  canWrite: boolean;
}) {
  const [plans, setPlans] = useState<FacilityPlanForClient[]>([]);
  const [pins, setPins] = useState(initialPins);
  const [selected, setSelected] = useState(initialPins[0]?.plan_id ?? "");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState("");
  const plan = plans.find((p) => p.id === selected);
  const visible: ViewerPin[] = pins
    .filter((p) => p.plan_id === selected)
    .map((p) => ({
      ...p,
      number: null,
      title: label,
      href: `/assets/${assetId}`,
    }));
  if (pending)
    visible.push({
      id: "preview",
      kind: "device",
      x: pending.x,
      y: pending.y,
      label: "Proposed position",
      title: "Confirm this position",
      number: null,
    });
  async function load() {
    setBusy(true);
    try {
      const result = await listFacilityPlans({ facilityId });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setPlans(result.plans ?? []);
      setSelected(initialPins[0]?.plan_id ?? result.plans?.[0]?.id ?? "");
      setLoaded(true);
    } catch {
      setMessage("Could not load plans. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!pending || !plan) return;
    setBusy(true);
    try {
      const result = await placeEquipment(
        assetId,
        plan.id,
        pending.x,
        pending.y,
      );
      if (!result.ok) {
        setMessage(result.error ?? "Could not save position.");
        return;
      }
      const next = {
        id: result.id!,
        plan_id: plan.id,
        facility_id: facilityId,
        kind: "device" as const,
        inspection_id: null,
        finding_id: null,
        photo_id: null,
        asset_id: assetId,
        ...pending,
        label,
        created_at: new Date().toISOString(),
      };
      setPins([next]);
      setPending(null);
      setPlacing(false);
      setMessage(
        "Equipment position saved. Future barcode scans return to this record and plan.",
      );
    } catch {
      setMessage(
        "Connection interrupted. Reload the record to verify the saved position.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Floor-plan location</h2>
      {!loaded ? (
        <button className="cl-btn-outline" disabled={busy} onClick={load}>
          {busy
            ? "Loading plans..."
            : initialPins.length
              ? "Show equipment on plan"
              : "Choose a floor plan"}
        </button>
      ) : !plans.length ? (
        <p>
          No plan is available.{" "}
          <Link className="underline" href={`/facilities/${facilityId}`}>
            Upload a drawing in this building
          </Link>
          .
        </p>
      ) : (
        <>
          <label>
            Floor / drawing
            <select
              className="cl-input"
              disabled={busy}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setPending(null);
                setPlacing(false);
              }}
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ? page {p.page}
                </option>
              ))}
            </select>
          </label>
          {canWrite && (
            <button
              className="cl-btn-outline"
              disabled={busy}
              onClick={() => {
                setPlacing(!placing);
                setPending(null);
              }}
            >
              {placing
                ? "Cancel placement"
                : pins.length
                  ? "Move equipment"
                  : "Place equipment"}
            </button>
          )}
          {plan && (
            <PlanViewer
              key={plan.id}
              src={plan.url}
              width={plan.width}
              height={plan.height}
              pins={visible}
              readOnly
              mode={placing && !busy ? "place" : "view"}
              onPlace={(x, y) => setPending({ x, y })}
              placeHint="Tap the verified equipment position, then confirm below."
            />
          )}
          {pending && (
            <button className="cl-btn-primary" disabled={busy} onClick={save}>
              Confirm position on {plan?.name}
            </button>
          )}
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
