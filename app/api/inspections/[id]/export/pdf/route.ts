import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFPage, PDFFont, RGB } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { buildExportFilename } from "@/lib/exports/filename";
import {
  classifyToSection,
  groupBySection,
  type AuditSection,
} from "@/lib/exports/audit-sections";
import { lswLinksForCitation } from "@/lib/lsw-links";
import type { Annotation } from "@/app/inspections/[id]/photos/[photoId]/actions";
import { numberFindings } from "@/components/plans/pin-numbering";
import {
  PIN_COLORS,
  PIN_SELECT,
  PLAN_SELECT,
  toPinRow,
  type PinRow,
  type PlanRow,
} from "@/components/plans/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 *  EOC / LS Inspection PDF report.
 *
 *  Modeled on the customer's archive format:
 *    1. Cover page — site header, document number, score, metadata grid.
 *    2. Audit (full) — every finding organized by audit sub-section
 *       (A1 Fire Doors, A2 Fire-Rated Walls, A3 Fire Alarm/Sprinkler,
 *       A4 Rooms, A5 Corridors, A6 General, B Safety Management,
 *       C Security Management) with code numbers like A1.1.1, A2.1.4.
 *       Photo references inline.
 *    3. Photos — 4-up gallery, captioned "Photo N".
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
  // Bbox styling (used when drawing on photos in the gallery).
  bbox_x1: number | null;
  bbox_y1: number | null;
  bbox_x2: number | null;
  bbox_y2: number | null;
  bbox_stroke_width: number | null;
  bbox_color: string | null;
  bbox_fill: string | null;
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
        "id, facility_name, facility_address, location, inspector_name, manager_assigned, date_of_inspection, status, created_at, inspector_signature_url, manager_signature_url, inspector_signed_at, manager_signed_at",
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
      .select("id, storage_path, photo_location, raw_analysis, annotations, created_at")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true });

    const photoList = photos ?? [];
    const photoIds = photoList.map((p) => p.id as string);
    // Build photoIndexMap so we can show "Photo N" inline next to each finding.
    const photoIndexById = new Map<string, number>();
    photoList.forEach((p, i) => photoIndexById.set(p.id as string, i + 1));

    let allFindings: Finding[] = [];
    // Inspection-wide finding numbers for the Plan-markup page (same rule
    // as the on-screen plan legend: creation order across all photos).
    let findingNumberById = new Map<string, number>();
    if (photoIds.length > 0) {
      const { data: findings } = await supabase
        .from("findings")
        .select(
          "id, photo_id, title, severity, category, code, description, location, remediation, references, created_at, bbox_x1, bbox_y1, bbox_x2, bbox_y2, bbox_stroke_width, bbox_color, bbox_fill",
        )
        .in("photo_id", photoIds)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: true });
      findingNumberById = numberFindings(
        (findings ?? []).map((f) => ({
          id: f.id as string,
          created_at: (f.created_at as string | null) ?? null,
        })),
      );
      allFindings = (findings ?? []).map((f) => {
        const pid = f.photo_id as string;
        const fAny = f as {
          bbox_x1: number | null;
          bbox_y1: number | null;
          bbox_x2: number | null;
          bbox_y2: number | null;
          bbox_stroke_width: number | null;
          bbox_color: string | null;
          bbox_fill: string | null;
        };
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
          bbox_x1: fAny.bbox_x1,
          bbox_y1: fAny.bbox_y1,
          bbox_x2: fAny.bbox_x2,
          bbox_y2: fAny.bbox_y2,
          bbox_stroke_width: fAny.bbox_stroke_width,
          bbox_color: fAny.bbox_color,
          bbox_fill: fAny.bbox_fill,
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

    // Real checklist (migration 0022), when this inspection has one. The
    // answered questions REPLACE the photos×5 proxy score below, and a
    // checklist-summary section renders after the audit body.
    let checklistItems: Array<{
      section_code: string;
      section_title: string;
      question: string;
      code_ref: string | null;
      answer: "yes" | "no" | "na" | null;
      note: string | null;
      answered_by_ai: boolean;
      template_name: string | null;
    }> = [];
    try {
      const { data: clData } = await supabase
        .from("inspection_checklist_items")
        .select(
          "section_code, section_title, question, code_ref, answer, note, answered_by_ai, template_name",
        )
        .eq("inspection_id", inspectionId)
        .order("sort", { ascending: true });
      checklistItems = (clData as typeof checklistItems) ?? [];
    } catch {
      // Pre-migration or transient error — fall back to the proxy score.
    }
    const clYes = checklistItems.filter((i) => i.answer === "yes").length;
    const clNo = checklistItems.filter((i) => i.answer === "no").length;
    const hasChecklistScore = clYes + clNo > 0;

    // Score: real checklist when answered; otherwise the historical
    // deficiencies-vs-(photos×5) proxy so pre-checklist inspections keep
    // rendering a number.
    const totalChecks = hasChecklistScore
      ? clYes + clNo
      : Math.max(photoList.length * 5, 5);
    const flagged = hasChecklistScore ? clNo : totalFindings;
    const passed = hasChecklistScore
      ? clYes
      : Math.max(0, totalChecks - totalFindings);
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

    /* ============================ FULL AUDIT ============================ */
    // Note: the previous "Section 1: Flagged Items" overview was removed —
    // the audit by section below already lists every finding, so the
    // overview was duplicated content.
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let py = PAGE_H - MARGIN;

    function newPageIfNeeded(minRoom: number) {
      if (py < minRoom + 60) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        py = PAGE_H - MARGIN;
      }
    }

    page.drawText(
      safeText(`Audit  -  ${passed}/${totalChecks} (${scorePct.toFixed(2)}%)`),
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

    for (const g of numbered) {
      newPageIfNeeded(80);
      // Sub-section header like "2.3.  A2.  Fire-Rated Walls — N flagged"
      const sectFlagged = g.items.filter(
        (f) => f.severity === "High" || f.severity === "Medium",
      ).length;
      const sectTotal = Math.max(g.items.length, 1) + 2; // proxy "denominator"
      const sectPct = ((sectTotal - sectFlagged) / sectTotal) * 100;

      page.drawText(
        safeText(
          `${g.section.code}.  ${g.section.title}  -  ${sectTotal - sectFlagged}/${sectTotal} (${sectPct.toFixed(1)}%)`,
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

            // Overlay AI bboxes (Medium / High only — same as the on-screen rule)
            // and inspector annotations on top of the photo. Coordinates are
            // normalized [0,1] relative to the image; convert to PDF coords
            // (PDF origin bottom-left, so Y must be flipped from the
            // image-space top-down).
            const photoFindings = allFindings.filter(
              (f) =>
                f.photo_id === (p.id as string) &&
                (f.severity === "Medium" || f.severity === "High") &&
                f.bbox_x1 != null &&
                f.bbox_y1 != null &&
                f.bbox_x2 != null &&
                f.bbox_y2 != null,
            );
            for (const f of photoFindings) {
              const swMul = typeof f.bbox_stroke_width === "number" ? f.bbox_stroke_width : 2;
              const stroke = f.bbox_color
                ? hexToRgb(f.bbox_color)
                : severityRgb(f.severity);
              const fill = f.bbox_fill ? hexToRgb(f.bbox_fill) : null;
              drawRect(
                page,
                x,
                y,
                w,
                h,
                f.bbox_x1!,
                f.bbox_y1!,
                f.bbox_x2!,
                f.bbox_y2!,
                stroke,
                fill,
                Math.max(0.8, swMul * 0.8),
              );
            }

            const photoAnnotations =
              (p.annotations as Annotation[] | null) ?? [];
            for (const a of photoAnnotations) {
              drawAnnotation(page, x, y, w, h, a, helv);
            }
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

    /* ====================== CHECKLIST SUMMARY ====================== */
    // Real question-by-question record (migration 0022): per-section
    // scores + every "No" with its note. Renders only when the inspection
    // ran with a checklist template.
    if (checklistItems.length > 0) {
      let clPage = pdf.addPage([PAGE_W, PAGE_H]);
      let cy = PAGE_H - MARGIN - 10;
      const ensure = (needed: number) => {
        if (cy - needed < MARGIN) {
          clPage = pdf.addPage([PAGE_W, PAGE_H]);
          cy = PAGE_H - MARGIN - 10;
        }
      };

      clPage.drawText(
        safeText(
          `Checklist — ${checklistItems[0].template_name ?? "Inspection checklist"}`,
        ),
        { x: MARGIN, y: cy, size: 14, font: helvBold, color: FG },
      );
      cy -= 18;
      const clNa = checklistItems.filter((i) => i.answer === "na").length;
      const clOpen = checklistItems.filter((i) => i.answer === null).length;
      clPage.drawText(
        safeText(
          `Score ${clYes}/${clYes + clNo} (${scorePct.toFixed(2)}%) · ${clNa} N.A. · ${clOpen} unanswered`,
        ),
        { x: MARGIN, y: cy, size: 10, font: helv, color: MUTED },
      );
      cy -= 22;

      // Group by section, preserving sort order.
      const bySection = new Map<string, typeof checklistItems>();
      for (const item of checklistItems) {
        const key = `${item.section_code}. ${item.section_title}`;
        if (!bySection.has(key)) bySection.set(key, []);
        bySection.get(key)!.push(item);
      }

      for (const [header, rows] of bySection) {
        const yes = rows.filter((r) => r.answer === "yes").length;
        const no = rows.filter((r) => r.answer === "no").length;
        const scored = yes + no;
        const pct = scored > 0 ? ((yes / scored) * 100).toFixed(1) : "—";
        ensure(40);
        clPage.drawText(
          safeText(`${header}  -  ${yes}/${scored} (${pct}%)`),
          { x: MARGIN, y: cy, size: 11, font: helvBold, color: FG },
        );
        cy -= 16;

        for (const row of rows) {
          const answerLabel =
            row.answer === "yes"
              ? "Yes"
              : row.answer === "no"
                ? "No"
                : row.answer === "na"
                  ? "N.A."
                  : "—";
          ensure(30);
          const color = row.answer === "no" ? RED : MUTED;
          clPage.drawText(safeText(answerLabel), {
            x: MARGIN,
            y: cy,
            size: 9,
            font: helvBold,
            color,
          });
          cy = drawWrapped(
            clPage,
            `${row.question}${row.code_ref ? `  (${row.code_ref})` : ""}${row.answered_by_ai ? "  [AI-flagged]" : ""}`,
            MARGIN + 34,
            cy,
            PAGE_W - MARGIN * 2 - 34,
            9,
            helv,
            row.answer === "no" ? FG : MUTED,
          );
          if (row.answer === "no" && row.note) {
            ensure(24);
            cy = drawWrapped(
              clPage,
              row.note,
              MARGIN + 34,
              cy - 1,
              PAGE_W - MARGIN * 2 - 34,
              8.5,
              helv,
              RED,
            );
          }
          cy -= 4;
        }
        cy -= 8;
      }
    }

    /* ========================= PLAN MARKUP ========================= */
    // One page per facility plan that carries pins for THIS inspection:
    // the plan image scaled to fit, a numbered circle at every pin, and a
    // legend "N - finding title (Photo M)". Skips silently when the
    // inspection has no facility, the facility has no plans, no pins were
    // placed, or migration 0025 isn't applied (every read degrades).
    try {
      const { data: facRow, error: facErr } = await supabase
        .from("inspections")
        .select("facility_id")
        .eq("id", inspectionId)
        .maybeSingle();
      const facilityId = facErr ? null : ((facRow?.facility_id as string | null) ?? null);
      if (facilityId) {
        const [{ data: planRows, error: planErr }, { data: pinRows, error: pinErr }] =
          await Promise.all([
            supabase
              .from("facility_plans")
              .select(PLAN_SELECT)
              .eq("facility_id", facilityId)
              .order("sort", { ascending: true })
              .order("page", { ascending: true }),
            supabase.from("plan_pins").select(PIN_SELECT).eq("inspection_id", inspectionId),
          ]);
        const plans = planErr ? [] : ((planRows ?? []) as PlanRow[]);
        const pins: PinRow[] = pinErr
          ? []
          : ((pinRows ?? []) as Record<string, unknown>[]).map(toPinRow);
        const findingById = new Map(allFindings.map((f) => [f.id, f]));
        const photoLocationById = new Map<string, string | null>();
        photoList.forEach((p) =>
          photoLocationById.set(p.id as string, (p.photo_location as string | null) ?? null),
        );

        for (const plan of plans) {
          const planPins = pins.filter((p) => p.plan_id === plan.id);
          if (planPins.length === 0) continue;

          // Resolve each pin to a number + legend line.
          type Resolved = {
            pin: PinRow;
            number: number | null;
            color: RGB;
            legend: string;
          };
          const resolved: Resolved[] = planPins.map((pin) => {
            if (pin.kind === "finding" && pin.finding_id) {
              const f = findingById.get(pin.finding_id);
              const n = findingNumberById.get(pin.finding_id) ?? null;
              const photoLabel = f?.photo_index ? ` (Photo ${f.photo_index})` : "";
              return {
                pin,
                number: n,
                color: f ? severityColor(f.severity) : RED,
                legend: `${n ?? "-"} - ${f?.title ?? "Finding"}${photoLabel}${pin.label ? ` - ${pin.label}` : ""}`,
              };
            }
            if (pin.kind === "photo" && pin.photo_id) {
              const idx = photoIndexById.get(pin.photo_id);
              const loc = photoLocationById.get(pin.photo_id);
              return {
                pin,
                number: null,
                color: hexToRgb(PIN_COLORS.photo),
                legend: `Photo ${idx ?? "?"}${loc ? ` - ${loc}` : ""}${pin.label ? ` - ${pin.label}` : ""}`,
              };
            }
            return {
              pin,
              number: null,
              color: hexToRgb(PIN_COLORS[pin.kind] ?? PIN_COLORS.note),
              legend: `${pin.kind === "device" ? "Device" : "Note"}${pin.label ? ` - ${pin.label}` : ""}`,
            };
          });
          resolved.sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));

          let mpPage = pdf.addPage([PAGE_W, PAGE_H]);
          let my = PAGE_H - MARGIN - 10;
          mpPage.drawText(safeText(`Plan markup - ${plan.name}`), {
            x: MARGIN,
            y: my,
            size: 14,
            font: helvBold,
            color: TEAL,
          });
          my -= 8;
          mpPage.drawLine({
            start: { x: MARGIN, y: my },
            end: { x: COL_RIGHT, y: my },
            thickness: 0.6,
            color: TEAL,
          });
          my -= 14;

          // Image: fit within the content width and leave room for the legend.
          const LEGEND_RESERVE = Math.min(220, 40 + resolved.length * 13);
          const maxW = PAGE_W - MARGIN * 2;
          const maxH = my - MARGIN - LEGEND_RESERVE;
          try {
            const { data: blob } = await supabase.storage
              .from("drawings")
              .download(plan.storage_path);
            if (blob) {
              const buf = Buffer.from(await blob.arrayBuffer());
              const isPng =
                (blob.type || "").includes("png") || /\.png$/i.test(plan.storage_path);
              const img = isPng ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
              const scale = Math.min(maxW / img.width, maxH / img.height, 1);
              const w = img.width * scale;
              const h = img.height * scale;
              const x = MARGIN + (maxW - w) / 2;
              const y = my - h;
              mpPage.drawImage(img, { x, y, width: w, height: h });
              mpPage.drawRectangle({
                x,
                y,
                width: w,
                height: h,
                borderColor: SUBTLE,
                borderWidth: 0.5,
              });

              for (const r of resolved) {
                const cx = x + r.pin.x * w;
                const cy = y + h - r.pin.y * h; // PDF y is bottom-up
                const radius = r.number != null ? 9 : 5;
                mpPage.drawCircle({
                  x: cx,
                  y: cy,
                  size: radius,
                  color: r.color,
                  borderColor: rgb(1, 1, 1),
                  borderWidth: 1.2,
                });
                if (r.number != null) {
                  const label = String(r.number);
                  const size = label.length > 2 ? 7 : 8.5;
                  const tw = helvBold.widthOfTextAtSize(label, size);
                  mpPage.drawText(label, {
                    x: cx - tw / 2,
                    y: cy - size * 0.36,
                    size,
                    font: helvBold,
                    color: rgb(1, 1, 1),
                  });
                }
              }
              my = y - 16;
            }
          } catch (err) {
            console.error("[pdf] plan embed failed", err);
            mpPage.drawText(safeText("Plan image could not be embedded."), {
              x: MARGIN,
              y: my - 12,
              size: 9,
              font: helv,
              color: MUTED,
            });
            my -= 30;
          }

          // Legend
          mpPage.drawText(safeText("Legend"), {
            x: MARGIN,
            y: my,
            size: 10,
            font: helvBold,
            color: FG,
          });
          my -= 14;
          for (const r of resolved) {
            if (my < MARGIN + 20) {
              mpPage = pdf.addPage([PAGE_W, PAGE_H]);
              my = PAGE_H - MARGIN - 10;
              mpPage.drawText(safeText(`Plan markup - ${plan.name} (legend, continued)`), {
                x: MARGIN,
                y: my,
                size: 11,
                font: helvBold,
                color: TEAL,
              });
              my -= 18;
            }
            mpPage.drawCircle({
              x: MARGIN + 5,
              y: my + 3,
              size: 4,
              color: r.color,
            });
            my = drawWrapped(
              mpPage,
              r.legend,
              MARGIN + 16,
              my,
              PAGE_W - MARGIN * 2 - 16,
              9,
              helv,
              FG,
            );
            my -= 2;
          }
        }
      }
    } catch (err) {
      // Never let the plan page take the whole report down.
      console.error("[pdf] plan markup skipped", err);
    }

    /* ========================= SIGN-OFF PAGE ========================= */
    // Dedicated final page: inspector + manager blocks. Captured
    // signatures (the `signatures` bucket stores the PNGs the pad drew)
    // embed above their lines; unsigned roles get a blank line for a wet
    // signature on the printed copy.
    {
      const sigPage = pdf.addPage([PAGE_W, PAGE_H]);
      let sy = PAGE_H - MARGIN - 10;
      sigPage.drawText(safeText("Sign-off"), {
        x: MARGIN,
        y: sy,
        size: 14,
        font: helvBold,
        color: TEAL,
      });
      sy -= 8;
      sigPage.drawLine({
        start: { x: MARGIN, y: sy },
        end: { x: COL_RIGHT, y: sy },
        thickness: 0.6,
        color: TEAL,
      });
      sy -= 30;

      const blocks = [
        {
          role: "Inspector",
          name: inspection.inspector_name as string | null,
          path: (inspection as { inspector_signature_url?: string | null })
            .inspector_signature_url,
          signedAt: (inspection as { inspector_signed_at?: string | null })
            .inspector_signed_at,
        },
        {
          role: "Manager Assigned",
          name: inspection.manager_assigned as string | null,
          path: (inspection as { manager_signature_url?: string | null })
            .manager_signature_url,
          signedAt: (inspection as { manager_signed_at?: string | null })
            .manager_signed_at,
        },
      ];

      for (const b of blocks) {
        sigPage.drawText(safeText(b.role.toUpperCase()), {
          x: MARGIN,
          y: sy,
          size: 9,
          font: helvBold,
          color: MUTED,
        });
        sy -= 14;

        // Embedded signature image (72pt tall box), if captured.
        if (b.path) {
          try {
            const { data: blob } = await supabase.storage
              .from("signatures")
              .download(b.path);
            if (blob) {
              const buf = Buffer.from(await blob.arrayBuffer());
              const img = await pdf.embedPng(buf);
              const maxH = 60;
              const maxW = 240;
              const scale = Math.min(maxW / img.width, maxH / img.height, 1);
              sigPage.drawImage(img, {
                x: MARGIN,
                y: sy - maxH,
                width: img.width * scale,
                height: img.height * scale,
              });
            }
          } catch (err) {
            console.error("[pdf] signature embed failed", err);
          }
          sy -= 66;
        } else {
          sy -= 40;
        }

        // Signature line + caption
        sigPage.drawLine({
          start: { x: MARGIN, y: sy },
          end: { x: MARGIN + 260, y: sy },
          thickness: 0.8,
          color: FG,
        });
        sy -= 14;
        const caption = [
          b.name || "",
          b.signedAt
            ? `Signed ${new Date(b.signedAt).toISOString().slice(0, 10)}`
            : "Date: ____________",
        ]
          .filter(Boolean)
          .join("   ·   ");
        sigPage.drawText(safeText(caption), {
          x: MARGIN,
          y: sy,
          size: 9,
          font: helv,
          color: MUTED,
        });
        sy -= 48;
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

      // LifeSafetyWiki deep links — the decoded section a surveyor can
      // open to read the requirement in plain language.
      const lswLinks = lswLinksForCitation(f.code);
      if (lswLinks.length > 0) {
        y -= 2;
        y = drawWrapped(
          pg,
          `Read on LifeSafetyWiki: ${lswLinks.map((l) => l.url).join("  ")}`,
          MARGIN + 50,
          y,
          COL_RIGHT - MARGIN - 50,
          7.5,
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

/* =====================================================================
 *  Photo overlay drawing helpers — used to render AI bboxes and
 *  inspector annotations on top of each photo in the gallery.
 *
 *  All coords from the editor are normalized [0, 1] relative to the
 *  IMAGE. We translate to PDF coords where:
 *    - x is left-to-right (same direction)
 *    - y is bottom-to-top (FLIPPED from image space)
 *  The image is drawn at PDF rect (imgX, imgY) with (imgW, imgH).
 *  A normalized point (nx, ny) maps to PDF (imgX + nx*imgW,
 *  imgY + imgH - ny*imgH).
 * ===================================================================== */

function hexToRgb(hex: string): RGB {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // strip alpha; opacity handled separately
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  if ([r, g, b].some(Number.isNaN)) return rgb(0.97, 0.45, 0.45);
  return rgb(r, g, b);
}

function severityRgb(s: "Low" | "Medium" | "High"): RGB {
  if (s === "Low") return rgb(0.20, 0.83, 0.60); // green
  return rgb(0.97, 0.45, 0.45); // red for Medium/High
}

function drawRect(
  page: PDFPage,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  nx1: number,
  ny1: number,
  nx2: number,
  ny2: number,
  stroke: RGB,
  fill: RGB | null,
  thickness: number,
) {
  const left = imgX + Math.min(nx1, nx2) * imgW;
  const right = imgX + Math.max(nx1, nx2) * imgW;
  const top = imgY + imgH - Math.min(ny1, ny2) * imgH;
  const bottom = imgY + imgH - Math.max(ny1, ny2) * imgH;
  page.drawRectangle({
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    borderColor: stroke,
    borderWidth: thickness,
    color: fill ?? undefined,
    opacity: fill ? 0.25 : undefined,
    borderOpacity: 1,
  });
}

function drawAnnotation(
  page: PDFPage,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  a: Annotation,
  font: PDFFont,
) {
  const stroke = hexToRgb(a.color);
  const fill = a.fill ? hexToRgb(a.fill) : null;
  const swMul = typeof a.strokeWidth === "number" ? a.strokeWidth : 2;
  const thickness = Math.max(0.8, swMul * 0.8);

  // PDF Y is flipped relative to image-space Y.
  const px1 = imgX + a.x1 * imgW;
  const px2 = imgX + a.x2 * imgW;
  const py1 = imgY + imgH - a.y1 * imgH;
  const py2 = imgY + imgH - a.y2 * imgH;

  if (a.type === "rect") {
    drawRect(page, imgX, imgY, imgW, imgH, a.x1, a.y1, a.x2, a.y2, stroke, fill, thickness);
    return;
  }

  if (a.type === "circle") {
    const cx = (px1 + px2) / 2;
    const cy = (py1 + py2) / 2;
    const xScale = Math.abs(px2 - px1) / 2;
    const yScale = Math.abs(py2 - py1) / 2;
    page.drawEllipse({
      x: cx,
      y: cy,
      xScale,
      yScale,
      borderColor: stroke,
      borderWidth: thickness,
      color: fill ?? undefined,
      opacity: fill ? 0.25 : undefined,
      borderOpacity: 1,
    });
    return;
  }

  if (a.type === "arrow") {
    // Line from tail (x1,y1) to head (x2,y2).
    page.drawLine({
      start: { x: px1, y: py1 },
      end: { x: px2, y: py2 },
      thickness: thickness * 1.2,
      color: stroke,
    });
    // Arrowhead: small triangle at the head end.
    const dx = px2 - px1;
    const dy = py2 - py1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0.5) {
      const ux = dx / len;
      const uy = dy / len;
      const headLen = Math.max(6, thickness * 4);
      // Perpendicular unit vector.
      const perpX = -uy;
      const perpY = ux;
      const baseX = px2 - ux * headLen;
      const baseY = py2 - uy * headLen;
      const leftPt = {
        x: baseX + perpX * headLen * 0.5,
        y: baseY + perpY * headLen * 0.5,
      };
      const rightPt = {
        x: baseX - perpX * headLen * 0.5,
        y: baseY - perpY * headLen * 0.5,
      };
      page.drawLine({
        start: { x: px2, y: py2 },
        end: leftPt,
        thickness: thickness * 1.2,
        color: stroke,
      });
      page.drawLine({
        start: { x: px2, y: py2 },
        end: rightPt,
        thickness: thickness * 1.2,
        color: stroke,
      });
    }
    return;
  }

  if (a.type === "text") {
    const fsMul = typeof a.fontSize === "number" ? a.fontSize : 2;
    // ~9pt base × multiplier (1=small, 2=medium, 3=large).
    const fontSize = Math.max(7, 4.5 * fsMul);
    const text = safeText(a.text ?? "").slice(0, 80);
    if (!text) return;
    // Anchor text roughly centered on the bbox.
    const cx = (px1 + px2) / 2;
    const cy = (py1 + py2) / 2;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x: cx - textWidth / 2,
      y: cy - fontSize / 2,
      size: fontSize,
      font,
      color: stroke,
    });
    return;
  }
}
