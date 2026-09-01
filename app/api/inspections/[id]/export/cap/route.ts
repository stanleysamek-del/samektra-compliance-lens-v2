import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { buildExportFilename } from "@/lib/exports/filename";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 *  Corrective Action Plan (CAP) — xlsx export.
 *
 *  Modeled on the customer's archive format (CAP - NSD - 1st-Floor-…xlsm).
 *  Layout:
 *    Row 1     : title
 *    Row 3     : labels  (Inspector | Date | Name of Practice)
 *    Row 4     : values
 *    Row 5     : labels  (Manager Assigned | Date Assigned | Address)
 *    Row 6     : values
 *    Row 7     : note paragraph
 *    Row 9     : table header (Deficiency | Corrective Action | Follow-up)
 *    Row 10+   : one row per finding
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

    type CAPRow = {
      letterCode: string;
      title: string;
      severity: "Low" | "Medium" | "High";
      description: string | null;
      location: string | null;
      remediation: string | null;
      references: string[] | null;
      // Live action-workflow data (migration 0019) — the manager columns
      // print what the DB knows instead of shipping blank for hand-entry.
      capStatus: string | null;
      capTargetDate: string | null;
      assignedEmail: string | null;
      actionClosedAt: string | null;
      closureNote: string | null;
      managerCorrectiveAction: string | null;
    };

    const rows: CAPRow[] = [];
    if (photoIds.length > 0) {
      const { data: findings } = await supabase
        .from("findings")
        .select(
          "photo_id, title, severity, category, description, location, remediation, references, created_at, cap_status, cap_target_date, assigned_email, action_closed_at, closure_note, manager_corrective_action",
        )
        .in("photo_id", photoIds)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: true });

      // Letter codes per category to match the EOC-LS report numbering scheme.
      const CAT_CODE: Record<string, string> = {
        Fire: "A",
        Egress: "B",
        Electrical: "C",
        ADA: "D",
        Hazmat: "E",
        InfectionControl: "F",
        Structural: "G",
        Other: "Z",
      };
      const counters: Record<string, number> = {};
      for (const f of findings ?? []) {
        const cat = (f.category as string) ?? "Other";
        const letter = CAT_CODE[cat] ?? "Z";
        const idx = (counters[letter] = (counters[letter] ?? 0) + 1);
        rows.push({
          letterCode: `${letter}${idx}.1`,
          title: (f.title as string) ?? "Untitled finding",
          severity: f.severity as "Low" | "Medium" | "High",
          description: (f.description as string | null) ?? null,
          location: (f.location as string | null) ?? null,
          remediation: (f.remediation as string | null) ?? null,
          references: (f.references as string[] | null) ?? null,
          capStatus: (f.cap_status as string | null) ?? null,
          capTargetDate: (f.cap_target_date as string | null) ?? null,
          assignedEmail: (f.assigned_email as string | null) ?? null,
          actionClosedAt: (f.action_closed_at as string | null) ?? null,
          closureNote: (f.closure_note as string | null) ?? null,
          managerCorrectiveAction:
            (f.manager_corrective_action as string | null) ?? null,
        });
      }
    }

    // ---- Build workbook ----
    const wb = new ExcelJS.Workbook();
    wb.creator = "Compliance Lens by Samektra";
    wb.created = new Date();
    const ws = wb.addWorksheet("CAP", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    ws.columns = [
      { width: 64 }, // A: Deficiency
      { width: 64 }, // B: Corrective Action
      { width: 50 }, // C: Follow-up
      { width: 18 }, // D: Severity (extension column for our use)
    ];

    // Row 1 — title
    ws.mergeCells("A1:D1");
    const title = ws.getCell("A1");
    title.value = "Environment of Care Inspection Corrective Action Plan";
    title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    title.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF97316" }, // orange accent
    };
    ws.getRow(1).height = 28;

    // Row 3 — labels
    setLabelRow(ws, 3, ["Inspector:", "Date of Inspection:", "Name of Practice:"]);
    // Row 4 — values
    setValueRow(ws, 4, [
      inspection.inspector_name ?? "",
      formatDate(inspection.date_of_inspection),
      inspection.facility_name ?? "",
    ]);

    // Row 5 — labels
    setLabelRow(ws, 5, ["Manager Assigned:", "Date Assigned:", "Address:"]);
    // Row 6 — values
    setValueRow(ws, 6, [
      inspection.manager_assigned ?? "",
      formatDate(inspection.date_of_inspection),
      inspection.facility_address ?? "",
    ]);

    // Row 7 — note
    ws.mergeCells("A7:D7");
    const note = ws.getCell("A7");
    note.value =
      "On-site Supervisors / Managers are responsible to correct all items below. Sign and return when complete. Severity is informational only.";
    note.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF555555" } };
    note.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(7).height = 30;

    // Row 9 — table header
    const hdr = ws.getRow(9);
    hdr.values = [
      "EOC Inspection area not in Compliance",
      "Corrective Actions to be Implemented (Manager)",
      "Follow-Up EOC Inspection Comments (Inspector/Manager)",
      "Severity",
    ];
    hdr.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    hdr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    hdr.height = 36;
    hdr.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF14B8A6" }, // teal
      };
      cell.border = thinBorder();
    });

    // Rows 10+ — one row per finding
    let r = 10;
    if (rows.length === 0) {
      const empty = ws.getRow(r);
      ws.mergeCells(`A${r}:D${r}`);
      empty.getCell(1).value = "No deficiencies recorded.";
      empty.getCell(1).font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF777777" } };
      empty.getCell(1).alignment = { horizontal: "center" };
      r++;
    } else {
      for (const row of rows) {
        const def = formatDeficiency(row);
        // Corrective-action column: the manager's own words win; the AI
        // remediation is the fallback. Assignment details ride along so
        // the printed CAP shows who owns it and by when.
        const corrParts: string[] = [];
        corrParts.push(row.managerCorrectiveAction ?? row.remediation ?? "");
        if (row.assignedEmail) corrParts.push(`Assigned: ${row.assignedEmail}`);
        if (row.capTargetDate) corrParts.push(`Due: ${row.capTargetDate}`);
        const corr = corrParts.filter(Boolean).join("\n");
        // Follow-up column: live workflow status + close-out trail.
        const followUp = formatFollowUp(row);
        const sev = row.severity;

        const xRow = ws.getRow(r);
        xRow.values = [def, corr, followUp, sev];
        xRow.alignment = { wrapText: true, vertical: "top" };
        xRow.font = { name: "Calibri", size: 10 };
        xRow.eachCell((cell) => (cell.border = thinBorder()));

        // Severity color tint
        const sevCell = xRow.getCell(4);
        sevCell.alignment = { horizontal: "center", vertical: "middle" };
        sevCell.font = { name: "Calibri", size: 10, bold: true };
        sevCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb:
              sev === "High"
                ? "FFFEE2E2"
                : sev === "Medium"
                  ? "FFFEF3C7"
                  : "FFD1FAE5",
          },
        };

        // Auto-height — ExcelJS can't auto-size, but a reasonable cap fits most.
        xRow.height = Math.max(48, Math.min(180, 18 + Math.ceil(def.length / 60) * 12));
        r++;
      }
    }

    // Footer note
    r += 1;
    ws.mergeCells(`A${r}:D${r}`);
    const foot = ws.getCell(`A${r}`);
    foot.value = `Generated ${new Date().toLocaleString()} by Compliance Lens by Samektra`;
    foot.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF777777" } };
    foot.alignment = { horizontal: "right" };

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const filename = buildExportFilename(inspection, "CAP", "xlsx");

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
    console.error("[cap-export] failed", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    if (debug) {
      return NextResponse.json(
        { ok: false, error: message, stack },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "CAP generation failed: " + message },
      { status: 500 },
    );
  }
}

function setLabelRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  values: string[],
) {
  const row = ws.getRow(rowNum);
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = v;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF555555" } };
  });
}

function setValueRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  values: string[],
) {
  const row = ws.getRow(rowNum);
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = v;
    cell.font = { name: "Calibri", size: 11 };
    cell.alignment = { wrapText: true, vertical: "top" };
  });
  row.height = 22;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side = { style: "thin" as const, color: { argb: "FFCCCCCC" } };
  return { top: side, left: side, bottom: side, right: side };
}

function formatDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function formatFollowUp(row: {
  capStatus: string | null;
  actionClosedAt: string | null;
  closureNote: string | null;
}): string {
  const STATUS_TEXT: Record<string, string> = {
    open: "Open",
    in_progress: "In progress",
    done: "Done — pending verification",
    verified: "Verified complete",
    wont_fix: "Won't fix",
  };
  const parts: string[] = [];
  parts.push(`Status: ${STATUS_TEXT[row.capStatus ?? "open"] ?? "Open"}`);
  if (row.actionClosedAt) {
    parts.push(`Closed: ${row.actionClosedAt.slice(0, 10)}`);
  }
  if (row.closureNote) parts.push(row.closureNote);
  return parts.join("\n");
}

function formatDeficiency(row: {
  letterCode: string;
  title: string;
  description: string | null;
  location: string | null;
  references: string[] | null;
}): string {
  const parts: string[] = [];
  parts.push(`${row.letterCode}  ${row.title}`);
  if (row.location) parts.push(`Location: ${row.location}`);
  if (row.description) parts.push(row.description);
  if (row.references && row.references.length > 0) {
    parts.push(`Refs: ${row.references.join("; ")}`);
  }
  return parts.join("\n");
}
