import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFPage, PDFFont } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { buildExportFilename } from "@/lib/exports/filename";
import {
  classifyToSection,
  groupBySection,
  type AuditSection,
} from "@/lib/exports/audit-sections";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 *  EOC / LS Inspection PDF report.
 *
 *  Modeled on the customer's archive format:
 *    1. Cover page — site header, document number, score, metadata grid.
 *    2. Section 1: Flagged Items — High and Medium findings only,
 *       organized by audit sub-section (A1 Fire Doors, A2 Fire-Rated
 *       Walls, A3 Fire Alarm/Sprinkler, A4 Rooms, A5 Corridors, A6
 *       General, B Safety Management, C Security Management).
 *    3. Section 2: Audit (full) — every finding by section with code
 *       numbers like A1.1.1, A2.1.4. Photo references inline.
 *    4. Photos — 4-up gallery, captioned "Photo N".
 *
 *  Findings are auto-classified into sub-sections by keywords in
 *  lib/exports/audit-sections.ts.
 * ===================================================================== */

type Finding = {
  id: string;
  photo_id: string;
  photo_index: number;
  title: string;
  severity: "Low" | "Medium" | "High";
  category: string;
  code: string | null;
  description: string | null;
  location: string | null;
  remediation: string | null;
  references: string[] | null;
};

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
        "id, facility_name, facility_address, location, inspector_name, manager_assigned, date_of_inspection, status, created_at",
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
      .select("id, storage_path, photo_location, raw_analysis, created_at")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    const photoList = photos ?? [];
    const photoIds = photoList.map((p) => p.id as string);
    // Build photoIndexMap so we can show "Photo N" inline next to each finding.
    const photoIndexById = new Map<string, number>();
    photoList.forEach((p, i) => photoIndexById.set(p.id as string, i + 1));

    let allFindings: Finding[] = [];
    if (photoIds.length > 0) {
      const { data: findings } = await supabase
        .from("findings")
        .select(
          "id, photo_id, title, severity, category, code, description, location, remediation, references, created_at",
        )
        .in("photo_id", photoIds)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: true });
      allFindings = (findings ?? []).map((f) => {
        const pid = f.photo_id as string;
        return {
          id: f.id as string,
          photo_id: pid,
          photo_index: photoIndexById.get(pid) ?? 0,
          title: (f.title as string) ?? "Untitled finding",
          severity: f.severity as "Low" | "Medium" | "High",
          category: (f.category as string) ?? "Other",
          code: (f.code as string | null) ?? null,
          description: (f.description as string | null) ?? null,
          location: (f.location as string | null) ?? null,
          remediation: (f.remediation as string | null) ?? null,
          references: (f.references as string[] | null) ?? null,
        };
      });
    }

    // Classify and group.
    const grouped = groupBySection(allFindings);
    // For each group, assign a stable per-question index (e.g. A2.1, A2.2),
    // and per-finding sub-index (A2.1.1, A2.1.2, …). Since we don't have
    // explicit "questions" the way the customer's checklist does, we use a
    // single "Q1" per section and number all findings under that as .1, .2, …
    const numbered: Array<{
      section: AuditSection;
      questionCode: string; // e.g. "A2.1"
      items: Array<Finding & { code_full: string }>;
    }> = grouped.map((g) => {
      const qCode = `${g.section.code}.1`;
      return {
        section: g.section,
        questionCode: qCode,
        items: g.items.map((f, idx) => ({
          ...f,
          code_full: `${qCode}.${idx + 1}`,
        })),
      };
    });

    const counts = { High: 0, Medium: 0, Low: 0 };
    for (const f of allFindings) counts[f.severity] += 1;
    const totalFindings = allFindings.length;
    // Customer-style score: deficiencies vs. (deficiencies + photos).
    // Not a perfect mapping but a reasonable proxy until we add a real
    // checklist with Y/N questions.
    const totalChecks = Math.max(photoList.length * 5, 5); // assume 5 checks per photo
    const flagged = totalFindings;
    const passed = Math.max(0, totalChecks - flagged);
    const scorePct = totalChecks > 0 ? (passed / totalChecks) * 100 : 0;

    // ---- Build PDF ----
    const pdf = await PDFDocument.create();
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 48;
    const COL_RIGHT = PAGE_W - MARGIN;

    const FG = rgb(0.07, 0.09, 0.13);
    const MUTED = rgb(0.42, 0.45, 0.5);
    const SUBTLE = rgb(0.65, 0.68, 0.72);
    const TEAL = rgb(0.08, 0.72, 0.65);
    const ORANGE = rgb(0.97, 0.45, 0.13);
    const RED = rgb(0.85, 0.18, 0.18);
    const AMBER = rgb(0.92, 0.6, 0.13);
    const GREEN = rgb(0.13, 0.6, 0.4);

    function severityColor(s: "Low" | "Medium" | "High") {
      if (s === "High") return RED;
      if (s === "Medium") return AMBER;
      return GREEN;
    }

    function drawWrapped(
      page: PDFPage,
      raw: string | null | undefined,
      x: number,
      y: number,
      maxW: number,
      size: number,
      font: PDFFont,
      color = FG,
      lineHeight = 1.35,
    ): number {
      const text = safeText(raw);
      if (!text) return y;
      const words = text.split(/\s+/);
      let line = "";
      let cy = y;
      for (const word of words) {
        const t = line ? line + " " + word : word;
        const w = font.widthOfTextAtSize(t, size);
        if (w > maxW && line) {
          page.drawText(line, { x, y: cy, size, font, color });
          cy -= size * lineHeight;
          line = word;
        } else {
          line = t;
        }
      }
      if (line) {
        page.drawText(line, { x, y: cy, size, font, color });
        cy -= size * lineHeight;
      }
      return cy;
    }

    /* ============================ COVER ============================ */
    const cover = pdf.addPage([PAGE_W, PAGE_H]);
    cover.drawRectangle({
      x: 0,
      y: PAGE_H - 6,
      width: PAGE_W,
      height: 6,
      color: ORANGE,
    });

    // Tiny header line, like "Northside Hospital / LS-EOC Inspection / Existing"
    cover.drawText(
      safeText(
        `${inspection.facility_name ?? "Facility"} / EOC-LS Inspection / ${inspection.status === "completed" ? "Completed" : "In Progress"}`,
      ),
      { x: MARGIN, y: PAGE_H - 56, size: 9, font: helv, color: MUTED },
    );

    // Big bold title block
    cover.drawText(safeText("EOC / LS Inspection Report"), {
      x: MARGIN,
      y: PAGE_H - 92,
      size: 22,
      font: helvBold,
      color: FG,
    });
    cover.drawText(
      safeText(`${inspection.facility_name ?? "—"}${inspection.location ? " — " + inspection.location : ""}`),
      { x: MARGIN, y: PAGE_H - 116, size: 13, font: helvBold, color: FG },
    );

    // Score / counts row, mimicking the customer's "Score 55/65 (84.62%) Flagged items 10"
    const scoreLine = `Score ${passed}/${totalChecks} (${scorePct.toFixed(2)}%)    Flagged items ${flagged}    Actions 0`;
    cover.drawText(safeText(scoreLine), {
      x: MARGIN,
      y: PAGE_H - 138,
      size: 11,
      font: helv,
      color: MUTED,
    });

    cover.drawText(
      safeText(
        `Document No. ${inspection.id.slice(0, 6).toUpperCase()}  ·  ${counts.High} High · ${counts.Medium} Medium · ${counts.Low} Low`,
      ),
      { x: MARGIN, y: PAGE_H - 154, size: 9, font: helv, color: SUBTLE },
    );

    // Metadata block (label / value rows, two columns)
    let cy = PAGE_H - 200;
    function metaRow(label: string, value: string) {
      cover.drawText(safeText(label), {
        x: MARGIN,
        y: cy,
        size: 9,
        font: helvBold,
        color: MUTED,
      });
      drawWrapped(
        cover,
        value && value.trim() ? value : "—",
        MARGIN + 130,
        cy,
        COL_RIGHT - (MARGIN + 130),
        11,
        helv,
        FG,
      );
      cy -= 26;
    }

    metaRow("Audit Title", `EOC/LS Inspection - ${inspection.facility_name ?? ""}${inspection.location ? " " + inspection.location : ""}`);
    metaRow("Client / Site", inspection.facility_name ?? "");
    metaRow("Location", inspection.location ?? "");
    metaRow("Address", inspection.facility_address ?? "");
    metaRow(
      "Conducted on",
      inspection.date_of_inspection
        ? new Date(inspection.date_of_inspection).toLocaleDateString()
        : "",
    );
    metaRow("Prepared by", inspection.inspector_name ?? "");
    metaRow("Manager Assigned", inspection.manager_assigned ?? "");
    metaRow("Photos", String(photoList.length));
    metaRow("Status", inspection.status ?? "");

    cover.drawText(
      safeText(`Generated ${new Date().toLocaleString()} · Compliance Lens by Samektra`),
      { x: MARGIN, y: 36, size: 8, font: helv, color: SUBTLE },
    );

    /* ============================ SECTION 1 — FLAGGED ITEMS ============================ */
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let py = PAGE_H - MARGIN;

    function newPageIfNeeded(minRoom: number) {
      if (py < minRoom + 60) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        py = PAGE_H - MARGIN;
      }
    }

    page.drawText(safeText("1.  Flagged Items"), {
      x: MARGIN,
      y: py,
      size: 16,
      font: helvBold,
      color: FG,
    });
    py -= 6;
    page.drawLine({
      start: { x: MARGIN, y: py },
      end: { x: COL_RIGHT, y: py },
      thickness: 0.6,
      color: TEAL,
    });
    py -= 10;
    page.drawText(safeText(`${counts.High + counts.Medium} flagged · ${counts.High} High · ${counts.Medium} Medium`), {
      x: MARGIN,
      y: py,
      size: 9,
      font: helv,
      color: MUTED,
    });
    py -= 22;

    const flaggedGrouped = numbered
      .map((g) => ({
        ...g,
        items: g.items.filter((f) => f.severity === "High" || f.severity === "Medium"),
      }))
      .filter((g) => g.items.length > 0);

    if (flaggedGrouped.length === 0) {
      page.drawText(safeText("No High- or Medium-severity findings."), {
        x: MARGIN,
        y: py,
        size: 11,
        font: helv,
        color: MUTED,
      });
      py -= 18;
    } else {
      for (const g of flaggedGrouped) {
        newPageIfNeeded(70);
        py = drawSectionHeader(page, py, "Audit / " + g.section.code + ".  " + g.section.title);

        // One synthetic question line per section; mirrors the customer's
        // "A2.1. Are penetrations in rated walls properly sealed?  No"
        const qText = sectionQuestionText(g.section);
        py = drawQuestionRow(page, py, g.questionCode, qText, "No");

        // Sub-findings (A2.1.1, A2.1.2, …)
        g.items.forEach((f, idx) => {
          newPageIfNeeded(60);
          const code = `${g.questionCode}.${idx + 1}.`;
          py = drawSubFinding(page, py, code, f);
        });

        py -= 8;
      }
    }

    /* ============================ SECTION 2 — FULL AUDIT ============================ */
    page = pdf.addPage([PAGE_W, PAGE_H]);
    py = PAGE_H - MARGIN;

    page.drawText(
      safeText(`2.  Audit  -  ${passed}/${totalChecks} (${scorePct.toFixed(2)}%)`),
      { x: MARGIN, y: py, size: 16, font: helvBold, color: FG },
    );
    py -= 6;
    page.drawLine({
      start: { x: MARGIN, y: py },
      end: { x: COL_RIGHT, y: py },
      thickness: 0.6,
      color: TEAL,
    });
    py -= 18;

    let auditIdx = 0;
    for (const g of numbered) {
      auditIdx += 1;
      newPageIfNeeded(80);
      // Sub-section header like "2.3.  A2.  Fire-Rated Walls — N flagged"
      const sectFlagged = g.items.filter(
        (f) => f.severity === "High" || f.severity === "Medium",
      ).length;
      const sectTotal = Math.max(g.items.length, 1) + 2; // proxy "denominator"
      const sectPct = ((sectTotal - sectFlagged) / sectTotal) * 100;

      page.drawText(
        safeText(
          `2.${auditIdx}.  ${g.section.code}.  ${g.section.title}  -  ${sectTotal - sectFlagged}/${sectTotal} (${sectPct.toFixed(1)}%)`,
        ),
        { x: MARGIN, y: py, size: 12, font: helvBold, color: TEAL },
      );
      py -= 6;
      page.drawLine({
        start: { x: MARGIN, y: py },
        end: { x: COL_RIGHT, y: py },
        thickness: 0.4,
        color: TEAL,
      });
      py -= 12;

      page.drawText(
        safeText(
          `${g.section.code}.  ${g.section.title}  -  ${sectFlagged} flagged, ${g.items.length} total`,
        ),
        { x: MARGIN, y: py, size: 10, font: helvBold, color: FG },
      );
      py -= 16;

      const qText = sectionQuestionText(g.section);
      py = drawQuestionRow(
        page,
        py,
        g.questionCode,
        qText,
        sectFlagged > 0 ? "No" : "Yes",
      );

      g.items.forEach((f, idx) => {
        newPageIfNeeded(60);
        const code = `${g.questionCode}.${idx + 1}.`;
        py = drawSubFinding(page, py, code, f);
      });

      py -= 12;
    }

    if (numbered.length === 0) {
      page.drawText(safeText("No findings recorded."), {
        x: MARGIN,
        y: py,
        size: 11,
        font: helv,
        color: MUTED,
      });
      py -= 16;
    }

    /* ============================ PHOTO GALLERY ============================ */
    if (photoList.length > 0) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      py = PAGE_H - MARGIN;
      page.drawText(safeText("Photos"), {
        x: MARGIN,
        y: py,
        size: 16,
        font: helvBold,
        color: FG,
      });
      py -= 6;
      page.drawLine({
        start: { x: MARGIN, y: py },
        end: { x: COL_RIGHT, y: py },
        thickness: 0.6,
        color: TEAL,
      });
      py -= 14;

      // 2 per row, 2 rows per page
      const colW = (PAGE_W - MARGIN * 2 - 16) / 2;
      const cellH = 280;
      let col = 0;

      for (let i = 0; i < photoList.length; i++) {
        const p = photoList[i];

        if (py - cellH < MARGIN) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          py = PAGE_H - MARGIN;
          col = 0;
        }

        const cellX = MARGIN + col * (colW + 16);
        const cellTop = py;

        page.drawText(safeText(`Photo ${i + 1}`), {
          x: cellX,
          y: cellTop - 12,
          size: 10,
          font: helvBold,
          color: FG,
        });
        if (p.photo_location) {
          page.drawText(safeText(String(p.photo_location).slice(0, 60)), {
            x: cellX,
            y: cellTop - 26,
            size: 8,
            font: helv,
            color: MUTED,
          });
        }

        try {
          const { data: blob } = await supabase.storage
            .from("photos")
            .download(p.storage_path as string);
          if (blob) {
            const buf = Buffer.from(await blob.arrayBuffer());
            const mime = blob.type || "image/jpeg";
            const img = mime.includes("png")
              ? await pdf.embedPng(buf)
              : await pdf.embedJpg(buf);
            const maxImgH = cellH - 36;
            const scale = Math.min(colW / img.width, maxImgH / img.height, 1);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = cellX + (colW - w) / 2;
            const y = cellTop - 32 - h;
            page.drawImage(img, { x, y, width: w, height: h });
          }
        } catch (err) {
          console.error("[pdf] embed failed", err);
        }

        col += 1;
        if (col >= 2) {
          col = 0;
          py -= cellH;
        }
      }
    }

    /* ============================ FOOTER ============================ */
    const pages = pdf.getPages();
    pages.forEach((pg, idx) => {
      pg.drawText(safeText(`${idx + 1} / ${pages.length}`), {
        x: COL_RIGHT - 30,
        y: 24,
        size: 8,
        font: helv,
        color: SUBTLE,
      });
      pg.drawText(safeText("Compliance Lens by Samektra"), {
        x: MARGIN,
        y: 24,
        size: 8,
        font: helv,
        color: SUBTLE,
      });
    });

    const bytes = await pdf.save();
    const filename = buildExportFilename(inspection, "EOC-LS-Inspection", "pdf");

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });

    /* ============================ HELPERS ============================ */
    function drawSectionHeader(pg: PDFPage, ySstart: number, label: string): number {
      pg.drawText(safeText(label), {
        x: MARGIN,
        y: ySstart,
        size: 11,
        font: helvBold,
        color: TEAL,
      });
      let y = ySstart - 5;
      pg.drawLine({
        start: { x: MARGIN, y },
        end: { x: COL_RIGHT, y },
        thickness: 0.4,
        color: TEAL,
      });
      return y - 12;
    }

    function drawQuestionRow(
      pg: PDFPage,
      ySstart: number,
      qCode: string,
      qText: string,
      yesNo: "Yes" | "No",
    ): number {
      pg.drawText(safeText(`${qCode}.`), {
        x: MARGIN,
        y: ySstart,
        size: 10,
        font: helvBold,
        color: FG,
      });
      const after = drawWrapped(
        pg,
        qText,
        MARGIN + 36,
        ySstart,
        COL_RIGHT - MARGIN - 36 - 40,
        10,
        helv,
        FG,
      );
      pg.drawText(safeText(yesNo), {
        x: COL_RIGHT - 30,
        y: ySstart,
        size: 10,
        font: helvBold,
        color: yesNo === "No" ? RED : GREEN,
      });
      return after - 4;
    }

    function drawSubFinding(
      pg: PDFPage,
      ySstart: number,
      code: string,
      f: Finding,
    ): number {
      let y = ySstart;

      // Severity dot
      pg.drawCircle({
        x: MARGIN + 4,
        y: y + 4,
        size: 3,
        color: severityColor(f.severity),
      });

      // Code + (Location) + Title — one wrapped block
      const locPrefix = f.location ? `(${f.location}) ` : "";
      const main = `${code} ${locPrefix}${f.title}`;
      pg.drawText(safeText(`${code}`), {
        x: MARGIN + 14,
        y,
        size: 10,
        font: helvBold,
        color: FG,
      });
      y = drawWrapped(
        pg,
        `${locPrefix}${f.title}`,
        MARGIN + 50,
        y,
        COL_RIGHT - MARGIN - 50,
        10,
        helvBold,
        FG,
      );
      void main;

      // Severity badge + photo ref
      const photoLabel = f.photo_index ? `Photo ${f.photo_index}` : "";
      const metaParts = [f.severity, f.code ?? "", photoLabel].filter(Boolean);
      pg.drawText(safeText(metaParts.join("  ·  ")), {
        x: MARGIN + 50,
        y,
        size: 8.5,
        font: helv,
        color: MUTED,
      });
      y -= 12;

      if (f.description) {
        y = drawWrapped(
          pg,
          f.description,
          MARGIN + 50,
          y,
          COL_RIGHT - MARGIN - 50,
          9.5,
          helv,
          FG,
        );
      }

      if (f.remediation) {
        y -= 2;
        pg.drawText(safeText("Remediation:"), {
          x: MARGIN + 50,
          y,
          size: 8.5,
          font: helvBold,
          color: TEAL,
        });
        y -= 11;
        y = drawWrapped(
          pg,
          f.remediation,
          MARGIN + 50,
          y,
          COL_RIGHT - MARGIN - 50,
          9.5,
          helv,
          FG,
        );
      }

      if (f.references && f.references.length > 0) {
        y -= 2;
        y = drawWrapped(
          pg,
          `References: ${f.references.join("; ")}`,
          MARGIN + 50,
          y,
          COL_RIGHT - MARGIN - 50,
          8,
          helv,
          MUTED,
        );
      }

      return y - 10;
    }
  } catch (err) {
    console.error("[pdf-export] failed", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    if (debug) {
      return NextResponse.json(
        { ok: false, error: message, stack },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "PDF generation failed: " + message,
        hint: "Append ?debug=1 to the URL for a stack trace.",
      },
      { status: 500 },
    );
  }
}

/** A short Y/N-style question caption per audit section, modeled on the
 *  customer's checklist questions. */
function sectionQuestionText(section: AuditSection): string {
  switch (section.code) {
    case "A1":
      return "Are fire doors compliant with NFPA 80 (positive latching, self-closing, intact rating labels, no unapproved hardware)?";
    case "A2":
      return "Are penetrations in fire-rated walls, ceilings, and floors properly sealed with a listed firestop system, and are rated assemblies identified per NFPA 101 §8.3.1.4?";
    case "A3":
      return "Are fire alarm and sprinkler systems clear of obstructions and in compliance with NFPA 13 / 25 / 72?";
    case "A4":
      return "Are rooms compliant with NFPA 101 occupancy chapters (waiting areas, patient sleeping rooms, hazardous areas, trash/linen limits)?";
    case "A5":
      return "Are corridors free from obstructions and in compliance with egress width and dead-end limits?";
    case "A6":
      return "Are general life-safety items (extinguishers, exit signs, electrical panels, ADA reach, decorations) compliant?";
    case "B":
      return "Is the facility compliant with general safety-management items (eyewash, ceiling tiles, power strips, housekeeping)?";
    case "C":
      return "Are security-management items (access control, ID badges, surveillance) compliant?";
    case "Z":
    default:
      return "Other findings worth noting.";
  }
}

/** WinAnsi-safe text. */
function safeText(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/[–—]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/…/g, "...")
    .replace(/·/g, "-")
    .replace(/§/g, "Sec. ")
    .replace(/¶/g, "P. ")
    .replace(/°/g, "deg ")
    .replace(/½/g, "1/2")
    .replace(/¼/g, "1/4")
    .replace(/¾/g, "3/4")
    .replace(/[^\x00-\xFF]/g, "?");
}

// classifyToSection imported from "@/lib/exports/audit-sections" but only used
// transitively through groupBySection — silence the unused warning.
void classifyToSection;
