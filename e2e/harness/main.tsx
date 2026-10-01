import React from "react";
import { createRoot } from "react-dom/client";
import { BarcodeScanner } from "@/components/assets/barcode-scanner";
import { ReportImporter } from "@/components/assets/report-importer";
import { AssetPlan } from "@/components/assets/asset-plan";
import "@/app/globals.css";
const facilities = [
  { id: "building-a", name: "Building A" },
  { id: "building-b", name: "Building B" },
];
const mode = new URLSearchParams(location.search).get("mode");
createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-4xl space-y-6 p-5">
    {mode === "import" ? (
      <ReportImporter facilities={facilities} />
    ) : mode === "plan" ? (
      <AssetPlan
        assetId="asset-a"
        facilityId="building-a"
        label="FE-001"
        initialPins={[]}
        canWrite
      />
    ) : (
      <BarcodeScanner facilities={facilities} compact={mode === "photo"} sourceImageUrl={mode === "photo" ? "/test-barcode.png" : undefined} />
    )}
  </main>,
);
