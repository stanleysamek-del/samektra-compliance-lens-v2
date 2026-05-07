import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { buildExportFilename } from "@/lib/exports/filename";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =====================================================================
 *  Inspection PDF report — modeled on the customer's EOC-LS Inspection
 *  archive format.
 *
 *    1. Cover page — facility metadata grid + score rollup.
 *    2. Findings grouped by category, with letter-numbered codes
 *       (A1, A2, B1, …). Each finding referenced as "Photo N".
 *    3. Photo gallery — 4 photos per page, captioned "Photo N".
 *
 *  Filename follows the convention:
 *    "EOC-LS-Inspection - {FacilityCode} - {Location}-{MM}-{YY}.pdf"
 * ===================================================================== */

// Map our schema's category enum to the inspection-letter codes used in
// healthcare LS/EOC reports.
const CATEGORY_CODES: Record<string, { code: string; title: string }> = {
  Fire: { code: "A", title: "Fire Safety (doors, walls, alarm, sprinkler)" },
  Egress: { code: "B", title: "Means of Egress" },
  Electrical: { code: "C", title: "Electrical Safety" },
  ADA: { code: "D", title: "Accessibility (ADA / ANSI)" },
  Hazmat: { code: "E", title: "Hazardous Materials" },
  InfectionControl: { code: "F", title: "Infection Control" },
  Structural: { code: "G", title: "Structural / Building Integrity" },
  Other: { code: "Z", title: "Other Findings" },
};

const CATEGORY_ORDER = [
  "Fire",
  "Egress",
  "Electrical",
  "ADA",
  "Hazmat",
  "InfectionControl",
  "Structural",
  "Other",
];

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

    type Finding = {
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

    let allFindings: Finding[] = [];
    if (photoIds.length > 0) {
      const { data: findings } = await supabase
        .from("findings")
        .select(
          "photo_id, title, severity, category, code, description, location, remediation, references, created_at",
        )
        .in("photo_id", photoIds)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: true });
      allFindings = (findings ?? []).map((f) => {
        const pid = f.photo_id as string;
        const photoIndex = photoIds.indexOf(pid);
        return {
          photo_id: pid,
          photo_index: photoIndex,
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

    // Group findings by category. Sort categories per CATEGORY_ORDER.
    const byCategory = new Map<string, Finding[]>();
    for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
    for (const f of allFindings) {
      const list = byCategory.get(f.category) ?? byCategory.get("Other")!;
      list.push(f);
    }

    // ---- Build PDF ----
    const pdf = await PDFDocument.create();
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // A4 size to match the customer reference (595 x 841).
    const PAGE_W = 595;
    const PAGE_H = 842;
    const MARGIN = 48;
    const FG = rgb(0.07, 0.09, 0.13);
    const MUTED = rgb(0.42, 0.45, 0.5);
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
      page: import("pdf-lib").PDFPage,
      raw: string | null | undefined,
      x: number,
      y: number,
      maxW: number,
      size: number,
      font: import("pdf-lib").PDFFont,
      color = FG,
      lineHeight = 1.35,
    ): number {
      const text = safeText(raw);
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

    // ---- Cover page ----
    const cover = pdf.addPage([PAGE_W, PAGE_H]);
    cover.drawRectangle({
      x: 0,
      y: PAGE_H - 6,
      width: PAGE_W,
      height: 6,
      color: ORANGE,
    });

    cover.drawText(safeText("Compliance Lens by Samektra"), {
      x: MARGIN,
      y: PAGE_H - 56,
      size: 9,
      font: helv,
      color: MUTED,
    });

    cover.drawText(safeText("EOC / LS Inspection Report"), {
      x: MARGIN,
      y: PAGE_H - 88,
      size: 22,
      font: helvBold,
      color: FG,
    });

    cover.drawText(
      safeText(inspection.facility_name ?? "Inspection"),
      { x: MARGIN, y: PAGE_H - 116, size: 14, font: helvBold, color: FG },
    );

    if (inspection.location) {
      cover.drawText(safeText(inspection.location), {
        x: MARGIN,
        y: PAGE_H - 134,
        size: 11,
        font: helv,
        color: MUTED,
      });
    }

    // Score / counts
    const counts = { High: 0, Medium: 0, Low: 0 };
    for (const f of allFindings) counts[f.severity] += 1;
    const totalFindings = allFindings.length;

    let cy = PAGE_H - 180;
    function field(label: string, value: string) {
      cover.drawText(safeText(label.toUpperCase()), {
        x: MARGIN,
        y: cy,
        size: 8,
        font: helvBold,
        color: MUTED,
      });
      cy -= 12;
      cover.drawText(safeText(value && value.trim() ? value : "—"), {
        x: MARGIN,
        y: cy,
        size: 11,
        font: helv,
        color: FG,
      });
      cy -= 22;
    }

    field("Inspector", inspection.inspector_name ?? "");
    field("Manager Assigned", inspection.manager_assigned ?? "");
    field("Date of Inspection", inspection.date_of_inspection ?? "");
    field("Address", inspection.facility_address ?? "");
    field("Status", inspection.status ?? "");
    field(
      "Findings",
      `${totalFindings} total · ${counts.High} High · ${counts.Medium} Medium · ${counts.Low} Low`,
    );
    field("Photos", String(photoList.length));

    cover.drawText(
      safeText(`Generated ${new Date().toLocaleString()}`),
      { x: MARGIN, y: 40, size: 8, font: helv, color: MUTED },
    );

    // ---- Findings sections ----
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let py = PAGE_H - MARGIN;

    page.drawText(safeText("Findings"), {
      x: MARGIN,
      y: py,
      size: 18,
      font: helvBold,
      color: FG,
    });
    py -= 28;

    function newPageIfNeeded(minRoom: number) {
      if (py < minRoom + 60) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        py = PAGE_H - MARGIN;
      }
    }

    let categoryHadAnyFinding = false;
    for (const cat of CATEGORY_ORDER) {
      const list = byCategory.get(cat) ?? [];
      if (list.length === 0) continue;
      categoryHadAnyFinding = true;
      const meta = CATEGORY_CODES[cat] ?? { code: "Z", title: cat };

      newPageIfNeeded(80);
      // Section header
      page.drawText(safeText(`${meta.code}.  ${meta.title}`), {
        x: MARGIN,
        y: py,
        size: 13,
        font: helvBold,
        color: TEAL,
      });
      py -= 8;
      page.drawLine({
        start: { x: MARGIN, y: py },
        end: { x: PAGE_W - MARGIN, y: py },
        thickness: 0.8,
        color: TEAL,
      });
      py -= 12;

      // One numbered sub-finding per item: code = "A1.1", "A1.2", ...
      list.forEach((f, idx) => {
        const subCode = `${meta.code}${idx + 1}`;
        newPageIfNeeded(120);

        // Severity dot + sub-code + title
        page.drawCircle({
          x: MARGIN + 4,
          y: py + 3,
          size: 3.5,
          color: severityColor(f.severity),
        });
        page.drawText(safeText(`${subCode}.`), {
          x: MARGIN + 14,
          y: py,
          size: 11,
          font: helvBold,
          color: FG,
        });
        py = drawWrapped(
          page,
          f.title,
          MARGIN + 36,
          py,
          PAGE_W - MARGIN * 2 - 36,
          11,
          helvBold,
          FG,
        );

        // Severity + code citation + photo ref
        const photoLabel =
          f.photo_index >= 0 ? `Photo ${f.photo_index + 1}` : "—";
        const metaLine = [
          f.severity,
          f.code ?? "",
          photoLabel,
        ]
          .filter(Boolean)
          .join(" · ");
        page.drawText(safeText(metaLine), {
          x: MARGIN + 36,
          y: py,
          size: 9,
          font: helv,
          color: MUTED,
        });
        py -= 14;

        if (f.location) {
          py = drawWrapped(
            page,
            `Location: ${f.location}`,
            MARGIN + 36,
            py,
            PAGE_W - MARGIN * 2 - 36,
            9,
            helv,
            MUTED,
          );
        }

        if (f.description) {
          py -= 2;
          py = drawWrapped(
            page,
            f.description,
            MARGIN + 36,
            py,
            PAGE_W - MARGIN * 2 - 36,
            10,
            helv,
            FG,
          );
        }

        if (f.remediation) {
          py -= 4;
          page.drawText(safeText("Remediation:"), {
            x: MARGIN + 36,
            y: py,
            size: 9,
            font: helvBold,
            color: TEAL,
          });
          py -= 12;
          py = drawWrapped(
            page,
            f.remediation,
            MARGIN + 36,
            py,
            PAGE_W - MARGIN * 2 - 36,
            10,
            helv,
            FG,
          );
        }

        if (f.references && f.references.length > 0) {
          py -= 2;
          py = drawWrapped(
            page,
            `References: ${f.references.join("; ")}`,
            MARGIN + 36,
            py,
            PAGE_W - MARGIN * 2 - 36,
            8,
            helv,
            MUTED,
          );
        }

        py -= 14;
      });

      py -= 8;
    }

    if (!categoryHadAnyFinding) {
      page.drawText(safeText("No deficiencies were detected."), {
        x: MARGIN,
        y: py,
        size: 11,
        font: helv,
        color: MUTED,
      });
      py -= 18;
    }

    // ---- Photo gallery ----
    if (photoList.length > 0) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      py = PAGE_H - MARGIN;

      page.drawText(safeText("Photos"), {
        x: MARGIN,
        y: py,
        size: 18,
        font: helvBold,
        color: FG,
      });
      py -= 28;

      // 2-up grid: photos arranged in pairs across the page, two rows per page.
      const colW = (PAGE_W - MARGIN * 2 - 16) / 2;
      const cellH = 240;
      let col = 0;
      let rowY = py;

      for (let i = 0; i < photoList.length; i++) {
        const p = photoList[i];

        if (rowY - cellH < MARGIN) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          rowY = PAGE_H - MARGIN;
          col = 0;
        }

        const cellX = MARGIN + col * (colW + 16);
        const cellTopY = rowY;

        // Caption first (above the image)
        page.drawText(safeText(`Photo ${i + 1}`), {
          x: cellX,
          y: cellTopY - 12,
          size: 10,
          font: helvBold,
          color: FG,
        });
        if (p.photo_location) {
          page.drawText(safeText(String(p.photo_location).slice(0, 50)), {
            x: cellX,
            y: cellTopY - 26,
            size: 8,
            font: helv,
            color: MUTED,
          });
        }

        // Embed image
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
            const y = cellTopY - 32 - h;
            page.drawImage(img, { x, y, width: w, height: h });
          }
        } catch (err) {
          console.error("[pdf] embed failed", err);
        }

        col += 1;
        if (col >= 2) {
          col = 0;
          rowY -= cellH;
        }
      }
    }

    // ---- Footer / page numbers ----
    const pages = pdf.getPages();
    pages.forEach((pg, idx) => {
      pg.drawText(
        safeText(
          `Compliance Lens by Samektra · ${idx + 1} / ${pages.length}`,
        ),
        {
          x: MARGIN,
          y: 24,
          size: 8,
          font: helv,
          color: MUTED,
        },
      );
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

/**
 * pdf-lib's StandardFonts only support WinAnsi encoding, which can't render
 * em-dashes, curly quotes, the section sign §, or other Unicode characters
 * the AI emits constantly. Replace them with ASCII equivalents.
 */
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
