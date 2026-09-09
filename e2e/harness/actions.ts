import type { EquipmentImportRow } from "@/lib/asset-import";
declare global {
  interface Window {
    lastImport?: {
      facilityId: string;
      rows: EquipmentImportRow[];
      overwrite: boolean;
    };
    lastPlacement?: { assetId: string; planId: string; x: number; y: number };
  }
}
export async function importEquipment(
  facilityId: string,
  rows: EquipmentImportRow[],
  overwrite: boolean,
) {
  window.lastImport = { facilityId, rows, overwrite };
  return { ok: true, result: { added: rows.length, updated: 0, skipped: 0 } };
}
export async function placeEquipment(
  assetId: string,
  planId: string,
  x: number,
  y: number,
) {
  window.lastPlacement = { assetId, planId, x, y };
  return { ok: true, id: "pin-a" };
}
export async function listFacilityPlans() {
  return {
    ok: true,
    plans: [
      {
        id: "plan-a",
        name: "First floor",
        page: 1,
        width: 800,
        height: 500,
        url: "/test-plan.svg",
      },
    ],
  };
}
