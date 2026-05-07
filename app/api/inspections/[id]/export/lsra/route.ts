import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { buildExportFilename } from "@/lib/exports/filename";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 *  Life Safety Risk Assessment (LSRA) — xlsx export.
 *
 *  Modeled on the customer's archive format (LSRA - NSD - 1st-Floor-…xlsx).
 *  Two sheets:
 *    1. "Tool" — risk-tolerance matrix at the top, then per-finding rows
 *       with Impact (1-4), Severity (1-4), and computed Risk Level.
 *    2. "Instructions" — short usage note + ASHE attribution disclaimer.
 *
 *  Risk Level matrix (per ASHE LSRA conventions):
 *    Impact rows × Severity columns → cell value = Risk Level.
 *    Impact 1 = Facility-wide; 2 = Multi-floor; 3 = Local; 4 = Short-duration.
 *    Severity 1 = Major injury/death; 2 = Injury; 3 = Unlikely injury; 4 = Minimal.
 *
 *  We DEFAULT Impact based on category and severity:
 *    Fire/Egress + High → Impact 2 (multi-unit), Severity 1
 *    Fire/Egress + Medium → Impact 3, Severity 2
 *    Fire/Egress + Low → Impact 3, Severity 3
 *    Other categories scale similarly.
 *  The user can edit Impact/Severity in Excel and the Risk Level recomputes.
 * ===================================================================== */

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: inspectionId } = await ctx.params;
  const debug = new URL(request.url).searchParams.get("debug") === "1";

  try {
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
      .select("id, created_at")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });
    const photoIds = (photos ?? []).map((p) => p.id as string);

    type LSRARow = {
      title: string;
      categoryGroup: string; // The LSRA category bucket
      severity: "Low" | "Medium" | "High";
      impact: number; // 1-4
      severityScore: number; // 1-4
      riskLevel: "High" | "Medium" | "Low" | "No ILSM";
    };

    let rawFindings: Array<{
      title: string;
      severity: "Low" | "Medium" | "High";
      category: string;
    }> = [];

    if (photoIds.length > 0) {
      const { data: findings } = await supabase
        .from("findings")
        .select("title, severity, category")
        .in("photo_id", photoIds);
      rawFindings = (findings ?? []).map((f) => ({
        title: (f.title as string) ?? "Untitled finding",
        severity: f.severity as "Low" | "Medium" | "High",
        category: (f.category as string) ?? "Other",
      }));
    }

    // Map our category enum → ASHE LSRA category buckets used in the reference
    // sheet (Fire/Smoke Doors, Fire Alarm, Sprinkler System, Fire/Smoke Barriers,
    // Means of Egress).
    function bucketFor(cat: string, title: string): string {
      const t = title.toLowerCase();
      if (cat === "Egress") return "Means of Egress";
      if (cat === "Electrical") return "Other";
      if (cat === "Fire") {
        if (t.includes("door")) return "Fire/Smoke Doors";
        if (t.includes("alarm") || t.includes("pull station") || t.includes("smoke detector"))
          return "Fire Alarm";
        if (t.includes("sprinkler") || t.includes("standpipe") || t.includes("riser"))
          return "Sprinkler System";
        if (
          t.includes("penetration") ||
          t.includes("barrier") ||
          t.includes("rated wall") ||
          t.includes("smoke compartment") ||
          t.includes("firestop")
        )
          return "Fire/Smoke Barriers";
        return "Fire/Smoke Barriers";
      }
      return "Other";
    }

    // Default Impact and Severity per finding severity. The customer's reference
    // workbook lets the inspector tweak these per row; we set sane defaults so
    // the Risk Level column is meaningful out of the box.
    function defaultImpactSeverity(
      bucket: string,
      sev: "Low" | "Medium" | "High",
    ): { impact: number; severityScore: number } {
      // High deficiencies in barriers / egress → multi-unit impact, life-safety severity.
      if (sev === "High") {
        if (bucket === "Means of Egress" || bucket === "Fire/Smoke Barriers") {
          return { impact: 2, severityScore: 1 };
        }
        return { impact: 3, severityScore: 2 };
      }
      if (sev === "Medium") {
        return { impact: 3, severityScore: 3 };
      }
      // Low advisories
      return { impact: 4, severityScore: 4 };
    }

    function riskLevelFor(impact: number, severity: number): LSRARow["riskLevel"] {
      // Risk-tolerance matrix derived from the customer's LSRA reference.
      // Returns: "High" | "Medium" | "Low" | "No ILSM"
      // Impact 1 (Facility-wide): Sev 1-2 High, Sev 3 Medium, Sev 4 Low
      // Impact 2 (Multi-unit):    Sev 1-2 High, Sev 3 Medium, Sev 4 Low
      // Impact 3 (Local):         Sev 1 High,   Sev 2 Medium, Sev 3 Medium (ILSM Created), Sev 4 Low
      // Impact 4 (Short Duration):                                                          No ILSM Required
      if (impact === 4) return "No ILSM";
      if (impact === 3) {
        if (severity === 1) return "High";
        if (severity === 2 || severity === 3) return "Medium";
        return "Low";
      }
      // Impact 1 or 2
      if (severity <= 2) return "High";
      if (severity === 3) return "Medium";
      return "Low";
    }

    const rows: LSRARow[] = rawFindings.map((f) => {
      const bucket = bucketFor(f.category, f.title);
      const { impact, severityScore } = defaultImpactSeverity(bucket, f.severity);
      return {
        title: f.title,
        categoryGroup: bucket,
        severity: f.severity,
        impact,
        severityScore,
        riskLevel: riskLevelFor(impact, severityScore),
      };
    });

    // Sort rows by category bucket order then by risk level severity.
    const BUCKET_ORDER = [
      "Fire/Smoke Doors",
      "Fire Alarm",
      "Sprinkler System",
      "Fire/Smoke Barriers",
      "Means of Egress",
      "Other",
    ];
    rows.sort((a, b) => {
      const ai = BUCKET_ORDER.indexOf(a.categoryGroup);
      const bi = BUCKET_ORDER.indexOf(b.categoryGroup);
      if (ai !== bi) return ai - bi;
      const riskOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2, "No ILSM": 3 };
      return (riskOrder[a.riskLevel] ?? 4) - (riskOrder[b.riskLevel] ?? 4);
    });

    // ---- Build workbook ----
    const wb = new ExcelJS.Workbook();
    wb.creator = "Compliance Lens by Samektra";
    wb.created = new Date();

    /* ---------- Sheet 1: Tool ---------- */
    const ws = wb.addWorksheet("Tool", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });
    ws.columns = [
      { width: 60 }, // A — Deficiency
      { width: 18 }, // B — Category bucket
      { width: 14 }, // C — Severity (Low/Medium/High)
      { width: 12 }, // D — Impact (1-4)
      { width: 14 }, // E — Severity Score (1-4)
      { width: 16 }, // F — Risk Level
    ];

    // Title
    ws.mergeCells("A1:F1");
    const title = ws.getCell("A1");
    title.value = "Life Safety Risk Assessment Tool";
    title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    title.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF14B8A6" },
    };
    ws.getRow(1).height = 28;

    // Risk-tolerance matrix
    ws.mergeCells("A3:F3");
    const matrixHdr = ws.getCell("A3");
    matrixHdr.value = "Risk Tolerance Matrix (Impact × Severity → Risk Level)";
    matrixHdr.font = { name: "Calibri", size: 11, bold: true };
    matrixHdr.alignment = { horizontal: "left" };

    const matrix = [
      ["Impact \\ Severity", "1 (Major)", "2 (Injury)", "3 (Unlikely)", "4 (Minimal)"],
      ["1 — Facility-wide",   "High",   "High",   "Medium", "Low"],
      ["2 — Multi-unit",      "High",   "High",   "Medium", "Low"],
      ["3 — Local",           "High",   "Medium", "Medium", "Low"],
      ["4 — Short Duration",  "No ILSM","No ILSM","No ILSM","No ILSM"],
    ];
    matrix.forEach((mr, i) => {
      const r = ws.getRow(4 + i);
      mr.forEach((v, j) => {
        const cell = r.getCell(j + 1);
        cell.value = v;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = thinBorder();
        if (i === 0) {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF374151" },
          };
        } else {
          cell.font = { name: "Calibri", size: 10 };
          if (j > 0) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: riskLevelFill(v) },
            };
          }
        }
      });
      r.height = 22;
    });

    // Metadata
    let r = 11;
    ws.mergeCells(`A${r}:F${r}`);
    ws.getCell(`A${r}`).value = `Date: ${formatDate(inspection.date_of_inspection)}    Location: ${inspection.location ?? ""}    Facility: ${inspection.facility_name ?? ""}    Address: ${inspection.facility_address ?? ""}`;
    ws.getCell(`A${r}`).font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF555555" } };
    r += 2;

    // Findings table header
    const hdr = ws.getRow(r);
    hdr.values = [
      "Deficiency",
      "Category",
      "Severity (audit)",
      "Impact (1-4)",
      "Severity (1-4)",
      "Risk Level",
    ];
    hdr.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    hdr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    hdr.height = 32;
    hdr.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF14B8A6" },
      };
      cell.border = thinBorder();
    });

    r += 1;
    let currentBucket = "";
    if (rows.length === 0) {
      ws.mergeCells(`A${r}:F${r}`);
      ws.getCell(`A${r}`).value = "No deficiencies recorded.";
      ws.getCell(`A${r}`).font = { italic: true, color: { argb: "FF777777" } };
      ws.getCell(`A${r}`).alignment = { horizontal: "center" };
    } else {
      for (const row of rows) {
        // Bucket header band
        if (row.categoryGroup !== currentBucket) {
          currentBucket = row.categoryGroup;
          ws.mergeCells(`A${r}:F${r}`);
          const cell = ws.getCell(`A${r}`);
          cell.value = row.categoryGroup;
          cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF0F172A" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE2E8F0" },
          };
          cell.alignment = { horizontal: "left", indent: 1 };
          ws.getRow(r).height = 22;
          r += 1;
        }

        const xRow = ws.getRow(r);
        xRow.values = [
          row.title,
          row.categoryGroup,
          row.severity,
          row.impact,
          row.severityScore,
          row.riskLevel,
        ];
        xRow.alignment = { wrapText: true, vertical: "top" };
        xRow.font = { name: "Calibri", size: 10 };
        xRow.eachCell((cell) => (cell.border = thinBorder()));
        // Center the numeric cells
        [3, 4, 5, 6].forEach((c) => {
          xRow.getCell(c).alignment = {
            horizontal: "center",
            vertical: "middle",
          };
        });
        // Risk level color
        const riskCell = xRow.getCell(6);
        riskCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: riskLevelFill(row.riskLevel) },
        };
        riskCell.font = { name: "Calibri", size: 10, bold: true };
        xRow.height = Math.max(36, Math.min(120, 18 + Math.ceil(row.title.length / 60) * 12));
        r += 1;
      }
    }

    // Footer
    r += 1;
    ws.mergeCells(`A${r}:F${r}`);
    ws.getCell(`A${r}`).value = `Generated ${new Date().toLocaleString()} by Compliance Lens by Samektra. Edit Impact / Severity columns in Excel and the Risk Level column should be reviewed accordingly.`;
    ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: "FF777777" } };
    ws.getCell(`A${r}`).alignment = { horizontal: "right", wrapText: true };

    /* ---------- Sheet 2: Instructions ---------- */
    const wsI = wb.addWorksheet("Instructions");
    wsI.columns = [{ width: 100 }];
    wsI.getCell("A1").value = "Life Safety Risk Assessment Tool — Instructions";
    wsI.getCell("A1").font = { name: "Calibri", size: 14, bold: true };
    const instructions = [
      "",
      "Purpose: Document the risk associated with each life-safety deficiency identified during an EOC/LS inspection.",
      "",
      "How to use:",
      "  1. Review each deficiency in the Tool sheet.",
      "  2. Adjust the Impact (1-4) and Severity (1-4) columns based on actual on-site conditions:",
      "       • Impact: 1 = Facility-wide, 2 = Multiple Units/Floors, 3 = Local/Single Unit, 4 = Short Duration.",
      "       • Severity (Category): 1 = Major injury/death, 2 = Injury, 3 = Not likely to cause injury, 4 = Minimal impact.",
      "  3. Use the Risk Tolerance Matrix at the top of the Tool sheet to look up the Risk Level.",
      "  4. Risk Level 'High' or 'Medium' typically requires Interim Life Safety Measures (ILSM).",
      "",
      "Disclaimer: This tool is a starting point. Adapt to your facility's risk-management policy and the relevant AHJ. The methodology aligns with the ASHE LSRA convention for healthcare occupancies.",
    ];
    instructions.forEach((line, i) => {
      const cell = wsI.getCell(`A${i + 2}`);
      cell.value = line;
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.font = { name: "Calibri", size: 11 };
    });

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const filename = buildExportFilename(inspection, "LSRA", "xlsx");

    return new Response(Buffer.from(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[lsra-export] failed", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    if (debug) {
      return NextResponse.json(
        { ok: false, error: message, stack },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "LSRA generation failed: " + message },
      { status: 500 },
    );
  }
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side = { style: "thin" as const, color: { argb: "FFCCCCCC" } };
  return { top: side, left: side, bottom: side, right: side };
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function riskLevelFill(level: string): string {
  switch (level) {
    case "High":
      return "FFFEE2E2"; // light red
    case "Medium":
      return "FFFEF3C7"; // light amber
    case "Low":
      return "FFD1FAE5"; // light green
    case "No ILSM":
      return "FFE0E7FF"; // light indigo
    default:
      return "FFFFFFFF";
  }
}
