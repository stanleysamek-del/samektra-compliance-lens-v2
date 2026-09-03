"use client";

import { useRouter } from "next/navigation";
import { PlanViewer } from "@/components/plans/plan-viewer";
import { PinList } from "@/components/plans/pin-list";
import { deletePin, movePin, updatePinLabel } from "@/app/actions/plans";
import { showToast } from "@/components/toaster";
import type { ViewerPin } from "@/components/plans/types";

/**
 * One plan with this inspection's pins: the viewer (move / relabel /
 * delete wired to server actions) and the numbered legend under it.
 * Client component so the server section can stay data-only.
 */
export function InspectionPlanCard({
  plan,
  pins,
  readOnly,
  highlightPinId,
}: {
  plan: { id: string; name: string; url: string; width: number | null; height: number | null };
  pins: ViewerPin[];
  readOnly: boolean;
  highlightPinId?: string | null;
}) {
  const router = useRouter();

  async function onMove(id: string, x: number, y: number) {
    const res = await movePin(id, x, y);
    if (res.ok) router.refresh();
    return res;
  }
  async function onLabel(id: string, label: string) {
    const res = await updatePinLabel(id, label);
    if (res.ok) router.refresh();
    return res;
  }
  async function onDelete(id: string) {
    const res = await deletePin(id);
    if (res.ok) {
      showToast({ kind: "success", message: "Pin removed." });
      router.refresh();
    }
    return res;
  }

  return (
    <div className="flex flex-col gap-3">
      <PlanViewer
        src={plan.url}
        width={plan.width}
        height={plan.height}
        pins={pins}
        mode="view"
        readOnly={readOnly}
        onMove={onMove}
        onLabel={onLabel}
        onDelete={onDelete}
        highlightPinId={highlightPinId}
        heightClass="h-[52vh] min-h-[280px]"
      />
      <PinList pins={pins} />
    </div>
  );
}
