import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { buildExportFilename } from "@/lib/exports/filename";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 *  Interim Life Safety Measures (ILSM) — xlsx export.
 *
 *  When a life-safety deficiency can't be remediated immediately, TJC
 *  and CMS require an ILSM evaluation per LS.01.02.01 + K-291. The
 *  workbook produced here mirrors the standard healthcare ILSM form:
 *
 *    Sheet 1 "ILSM Plan" — per-finding rows. Columns:
 *      #, Deficiency, Severity, Location, Impact (1-4), Severity (1-4),
 *      Risk Level (computed), Applicable ILSM Measures (which of the 11
 *      standard measures apply), Responsible Party, Target Resolution,
 *      Status, Notes.
 *
 *    Sheet 2 "Standard Measures" — the 11 CMS/TJC ILSM measures with
 *      short descriptions, so the inspector + manager can cross-reference
 *      which numbers they checked on each row.
 *
 *  We pre-populate Impact / Severity / suggested measures from the AI's
 *  category + severity. The inspector edits in Excel; the Risk Level
 *  formula recomputes automatically (same matrix as LSRA).
 * ===================================================================== */

// The 11 standard ILSM measures per TJC LS.01.02.01 + CMS K-291.
const ILSM_MEASURES: Array<{ id: string; title: string; desc: string }> = [
  { id: "M1",  title: "Daily inspection of exits in affected area", desc: "Confirm exits remain unobstructed and operable each day the deficiency persists." },
  { id: "M2",  title: "Free and unobstructed egress", desc: "Maintain clear paths from affected area to public way; remove all temporary storage." },
  { id: "M3",  title: "Brief occupants and personnel", desc: "Communicate the deficiency, ILSM measures, and any modified procedures to staff and (where appropriate) patients/visitors." },
  { id: "M4",  title: "Extra fire extinguishers / notification devices", desc: "Deploy temporary extinguishers, portable smoke detectors, or air-horn notification appropriate to the impairment." },
  { id: "M5",  title: "Increased hazard surveillance / security", desc: "Frequent rounds (often hourly) in the affected area, especially during construction or after hours." },
  { id: "M6",  title: "Storage, housekeeping, and debris removal", desc: "Enforce limits on combustible storage and remove construction debris promptly." },
  { id: "M7",  title: "Increased fire-drill frequency", desc: "Conduct additional drills in the affected smoke compartment until the deficiency is corrected." },
  { id: "M8",  title: "Training on smoke control / evacuation / FD notification", desc: "Train affected staff on revised evacuation routes, smoke-control adjustments, and FD notification protocol." },
  { id: "M9",  title: "Fire prevention orientation", desc: "Orient temporary workers, contractors, and new staff on the impairment and applicable ILSM." },
  { id: "M10", title: "Notify the fire department of impaired systems", desc: "Written notification to the AHJ when a fire-protection system (sprinkler, alarm, smoke-control) is impaired > 4 hours in 24h or 24h in 90 days." },
  { id: "M11", title: "Other measures as appropriate", desc: "Site-specific compensating measures — fire watch, temporary barriers, alternative power, isolation curtains, etc." },
];

// Map our finding categories → suggested measures. The inspector still
// edits which measures apply on each row; this just fills sensible defaults.
function suggestedMeasures(
  category: string,
  severity: "Low" | "Medium" | "High",
): string {
  const sev = severity === "High" ? 3 : severity === "Medium" ? 2 : 1;
  // Always-applicable for high severity life-safety deficiencies.
  const baseHigh = ["M1", "M2", "M3", "M5", "M6"];
  const c = category;

  const list = new Set<string>();
  if (sev >= 2) baseHigh.forEach((m) => list.add(m));
  if (sev >= 3) {
    list.add("M4");
    list.add("M7");
    list.add("M8");
  }

  // Category-specific additions.
  if (c === "Fire" || c === "Egress") {
    list.add("M1");
    list.add("M2");
    if (sev >= 2) list.add("M4");
    if (sev >= 2) list.add("M10");
  }
  if (c === "Electrical") {
    list.add("M5");
    list.add("M11");
  }
  if (c === "Hazmat") {
    list.add("M5");
    list.add("M6");
    list.add("M11");
  }
  if (c === "Structural") {
    list.add("M2");
    list.add("M11");
  }

  // Always include the catch-all so the inspector can add a site-specific note.
  list.add("M11");

  return Array.from(list).sort().join(", ");
}

// Same Impact/Severity defaults as LSRA so the two docs agree.
function defaultImpactSeverity(
  category: string,
  severity: "Low" | "Medium" | "High",
): { impact: number; severityScore: number } {
  const isLifeSafety = ["Fire", "Egress", "Hazmat"].includes(category);
  if (severity === "High") return { impact: isLifeSafety ? 2 : 3, severityScore: 1 };
  if (severity === "Medium") return { impact: isLifeSafety ? 3 : 3, severityScore: 2 };
  return { impact: 3, severityScore: 3 };
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: inspectionId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not signed in" },
      { status: 401 },
    );
  }

  const { data: inspection } = await supabase
    .from("inspections")
    .select(
      "id, facility_name, facility_address, location, inspector_name, manager_assigned, date_of_inspection",
    )
    .eq("id", inspectionId)
    .maybeSingle();
  if (!inspection) {
    return NextResponse.json(
      { ok: false, error: "Inspection not found" },
      { status: 404 },
    );
  }

  const { data: photos } = await supabase
    .from("photos")
    .select("id, photo_location")
    .eq("inspection_id", inspectionId);
  const photoLocById = new Map<string, string | null>(
    (photos ?? []).map((p) => [
      p.id as string,
      (p.photo_location as string | null) ?? null,
    ]),
  );
  const photoIds = Array.from(photoLocById.keys());

  type FindingRow = {
    title: string;
    severity: "Low" | "Medium" | "High";
    category: string;
    location: string | null;
    photo_location: string | null;
  };
  let findings: FindingRow[] = [];
  if (photoIds.length > 0) {
    const { data } = await supabase
      .from("findings")
      .select("title, severity, category, location, photo_id")
      .in("photo_id", photoIds);
    findings = (data ?? []).map((f) => ({
      title: (f.title as string) ?? "Untitled finding",
      severity: f.severity as "Low" | "Medium" | "High",
      category: (f.category as string) ?? "Other",
      location: (f.location as string | null) ?? null,
      photo_location: photoLocById.get(f.photo_id as string) ?? null,
    }));
  }

  // ----------------------- Build workbook -----------------------
  const wb = new ExcelJS.Workbook();
  wb.creator = "Compliance Lens by Samektra";
  wb.lastModifiedBy = inspection.inspector_name ?? user.email ?? "Inspector";
  wb.created = new Date();

  // Sheet 1: ILSM Plan
  const ws = wb.addWorksheet("ILSM Plan", {
    properties: { defaultColWidth: 16 },
    views: [{ state: "frozen", ySplit: 8 }],
  });

  // Header block
  ws.getCell("A1").value = "Interim Life Safety Measures (ILSM) Plan";
  ws.getCell("A1").font = { size: 14, bold: true };
  ws.mergeCells("A1:L1");
  ws.getCell("A2").value =
    "Required per TJC LS.01.02.01 and CMS K-291 when a Life Safety Code deficiency cannot be corrected immediately.";
  ws.getCell("A2").font = { italic: true, size: 10 };
  ws.mergeCells("A2:L2");

  ws.getCell("A4").value = "Facility:";
  ws.getCell("B4").value = inspection.facility_name ?? "";
  ws.getCell("A5").value = "Address:";
  ws.getCell("B5").value = inspection.facility_address ?? "";
  ws.getCell("A6").value = "Location/Smoke Compartment:";
  ws.getCell("B6").value = inspection.location ?? "";
  ws.getCell("E4").value = "Inspector:";
  ws.getCell("F4").value = inspection.inspector_name ?? "";
  ws.getCell("E5").value = "Manager:";
  ws.getCell("F5").value = inspection.manager_assigned ?? "";
  ws.getCell("E6").value = "Inspection Date:";
  ws.getCell("F6").value = inspection.date_of_inspection ?? "";
  for (const c of ["A4", "A5", "A6", "E4", "E5", "E6"]) {
    ws.getCell(c).font = { bold: true };
  }

  // Column headers
  const headerRowIndex = 8;
  const headers = [
    "#",
    "Deficiency",
    "Severity",
    "Location",
    "Impact (1-4)",
    "Severity (1-4)",
    "Risk Level",
    "Applicable ILSM Measures",
    "Responsible Party",
    "Target Resolution Date",
    "Status",
    "Notes",
  ];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRowIndex, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF334155" } } };
  });

  // Column widths
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 9;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 11;
  ws.getColumn(6).width = 11;
  ws.getColumn(7).width = 11;
  ws.getColumn(8).width = 28;
  ws.getColumn(9).width = 18;
  ws.getColumn(10).width = 14;
  ws.getColumn(11).width = 13;
  ws.getColumn(12).width = 28;

  // Body rows
  let rowIdx = headerRowIndex + 1;
  findings.forEach((f, i) => {
    const { impact, severityScore } = defaultImpactSeverity(f.category, f.severity);
    const r = ws.getRow(rowIdx);
    r.values = [
      i + 1,
      f.title,
      f.severity,
      f.location || f.photo_location || "",
      impact,
      severityScore,
      // Risk Level formula — same matrix as LSRA: Impact x Severity → text.
      // 1×1=High, 1×2=High, 1×3=High, 1×4=Medium
      // 2×1=High, 2×2=High, 2×3=Medium, 2×4=Low
      // 3×1=High, 3×2=Medium, 3×3=Low, 3×4=Low
      // 4×1=Medium, 4×2=Low, 4×3=Low, 4×4=No ILSM
      {
        formula: `IF(OR(AND(E${rowIdx}=1,F${rowIdx}<=3),AND(E${rowIdx}=2,F${rowIdx}<=2),AND(E${rowIdx}=3,F${rowIdx}=1)),"High",IF(OR(AND(E${rowIdx}=1,F${rowIdx}=4),AND(E${rowIdx}=2,F${rowIdx}=3),AND(E${rowIdx}=3,F${rowIdx}=2),AND(E${rowIdx}=4,F${rowIdx}=1)),"Medium",IF(AND(E${rowIdx}=4,F${rowIdx}=4),"No ILSM","Low")))`,
      },
      suggestedMeasures(f.category, f.severity),
      "",
      "",
      "Pending",
      "",
    ];
    r.alignment = { vertical: "top", wrapText: true };

    // Conditional fill on the severity column to match the dashboard pills.
    const sevCell = ws.getCell(rowIdx, 3);
    const sevColor =
      f.severity === "High"
        ? "FFFCA5A5"
        : f.severity === "Medium"
          ? "FFFCD34D"
          : "FFCBD5E1";
    sevCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: sevColor },
    };
    sevCell.alignment = { horizontal: "center" };
    sevCell.font = { bold: true };

    rowIdx += 1;
  });

  if (findings.length === 0) {
    ws.getCell(rowIdx, 2).value =
      "No findings on this inspection. Add findings before generating an ILSM plan.";
    ws.getCell(rowIdx, 2).font = { italic: true, color: { argb: "FF94A3B8" } };
  }

  // Sheet 2: Standard Measures
  const ws2 = wb.addWorksheet("Standard Measures", {
    properties: { defaultColWidth: 18 },
  });
  ws2.getCell("A1").value = "Standard ILSM Measures";
  ws2.getCell("A1").font = { size: 14, bold: true };
  ws2.mergeCells("A1:C1");
  ws2.getCell("A2").value =
    "Per TJC LS.01.02.01 / CMS K-291. The numbers below are referenced in the 'Applicable ILSM Measures' column on the plan sheet.";
  ws2.getCell("A2").font = { italic: true, size: 10 };
  ws2.mergeCells("A2:C2");

  const h2 = ws2.getRow(4);
  h2.values = ["#", "Measure", "Description"];
  h2.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F766E" },
  };
  ws2.getColumn(1).width = 6;
  ws2.getColumn(2).width = 42;
  ws2.getColumn(3).width = 80;

  ILSM_MEASURES.forEach((m, i) => {
    const r = ws2.getRow(5 + i);
    r.values = [m.id, m.title, m.desc];
    r.alignment = { vertical: "top", wrapText: true };
    r.getCell(1).font = { bold: true };
  });

  // ---------------------------------------------------------------
  const buffer = await wb.xlsx.writeBuffer();
  const filename = buildExportFilename({
    facilityName: inspection.facility_name ?? "Inspection",
    suffix: "ILSM",
    extension: "xlsx",
  });
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
