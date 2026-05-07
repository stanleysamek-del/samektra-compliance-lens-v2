import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/inspections/[id]/export/pdf
 *
 * Streams a PDF report for the inspection: cover page with facility
 * info + each photo on its own page with findings underneath.
 *
 * Uses pdf-lib (pure JS, no native deps, works on Vercel).
 */
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
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { data: inspection } = await supabase
    .from("inspections")
    .select(
      "id, facility_name, facility_address, location, inspector_name, manager_assigned, date_of_inspection, status, created_at",
    )
    .eq("id", inspectionId)
    .maybeSingle();
  if (!inspection) {
    return NextResponse.json({ ok: false, error: "Inspection not found" }, { status: 404 });
  }

  const { data: photos } = await supabase
    .from("photos")
    .select("id, storage_path, photo_location, raw_analysis, created_at")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });

  const photoList = photos ?? [];
  const photoIds = photoList.map((p) => p.id as string);

  const findingsByPhoto: Record<
    string,
    Array<{
      title: string;
      severity: "Low" | "Medium" | "High";
      category: string;
      code: string | null;
      description: string | null;
      location: string | null;
      remediation: string | null;
      references: string[] | null;
    }>
  > = {};

  if (photoIds.length > 0) {
    const { data: findings } = await supabase
      .from("findings")
      .select(
        "photo_id, title, severity, category, code, description, location, remediation, references, created_at",
      )
      .in("photo_id", photoIds)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: true });
    (findings ?? []).forEach((f) => {
      const pid = f.photo_id as string;
      const list = (findingsByPhoto[pid] ??= []);
      list.push({
        title: (f.title as string) ?? "Untitled finding",
        severity: f.severity as "Low" | "Medium" | "High",
        category: (f.category as string) ?? "",
        code: (f.code as string | null) ?? null,
        description: (f.description as string | null) ?? null,
        location: (f.location as string | null) ?? null,
        remediation: (f.remediation as string | null) ?? null,
        references: (f.references as string[] | null) ?? null,
      });
    });
  }

  // ---- Build PDF ----
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 48;
  const RED = rgb(0.97, 0.45, 0.45);
  const TEAL = rgb(0.08, 0.72, 0.65);
  const ORANGE = rgb(0.97, 0.45, 0.13);
  const FG = rgb(0.07, 0.09, 0.13);
  const MUTED = rgb(0.42, 0.45, 0.5);

  function severityColor(s: "Low" | "Medium" | "High") {
    if (s === "High" || s === "Medium") return RED;
    return TEAL;
  }

  function drawWrappedText(
    page: import("pdf-lib").PDFPage,
    rawText: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    font: import("pdf-lib").PDFFont,
    color = FG,
    lineHeight = 1.35,
  ): number {
    const text = safeText(rawText);
    const words = (text ?? "").split(/\s+/);
    let line = "";
    let cy = y;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      const w = font.widthOfTextAtSize(test, size);
      if (w > maxWidth && line) {
        page.drawText(safeText(line), { x, y: cy, size, font, color });
        cy -= size * lineHeight;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(safeText(line), { x, y: cy, size, font, color });
      cy -= size * lineHeight;
    }
    return cy;
  }

  // ---- Cover page ----
  const cover = pdf.addPage([PAGE_W, PAGE_H]);
  // Top accent bar
  cover.drawRectangle({
    x: 0,
    y: PAGE_H - 8,
    width: PAGE_W,
    height: 8,
    color: ORANGE,
  });
  cover.drawText(safeText("Compliance Lens by Samektra"), {
    x: MARGIN,
    y: PAGE_H - 64,
    size: 11,
    font: helv,
    color: MUTED,
  });
  cover.drawText(safeText("Inspection Report"), {
    x: MARGIN,
    y: PAGE_H - 104,
    size: 28,
    font: helvBold,
    color: FG,
  });

  let cy = PAGE_H - 160;
  const labelSize = 9;
  const valueSize = 12;

  function field(label: string, value: string | null | undefined) {
    cover.drawText(safeText(label.toUpperCase()), {
      x: MARGIN,
      y: cy,
      size: labelSize,
      font: helvBold,
      color: MUTED,
    });
    cy -= 14;
    cover.drawText(safeText(value && value.trim().length > 0 ? value : "—"), {
      x: MARGIN,
      y: cy,
      size: valueSize,
      font: helv,
      color: FG,
    });
    cy -= 28;
  }

  field("Facility", inspection.facility_name);
  field("Address", inspection.facility_address);
  field("Location", inspection.location);
  field("Inspector", inspection.inspector_name);
  field("Manager", inspection.manager_assigned);
  field("Date of inspection", inspection.date_of_inspection);
  field("Status", inspection.status);
  field("Photos", String(photoList.length));

  // Total findings count
  const totalFindings = Object.values(findingsByPhoto).reduce(
    (s, arr) => s + arr.length,
    0,
  );
  const counts = { High: 0, Medium: 0, Low: 0 };
  Object.values(findingsByPhoto).forEach((arr) =>
    arr.forEach((f) => (counts[f.severity] += 1)),
  );

  field(
    "Findings",
    `${totalFindings} total · ${counts.High} high · ${counts.Medium} medium · ${counts.Low} low`,
  );

  cover.drawText(safeText(`Generated ${new Date().toLocaleString()}`), {
    x: MARGIN,
    y: 40,
    size: 9,
    font: helv,
    color: MUTED,
  });

  // ---- One section per photo ----
  for (let i = 0; i < photoList.length; i++) {
    const p = photoList[i];
    const findings = findingsByPhoto[p.id as string] ?? [];
    const summary = (
      p.raw_analysis as { summary?: { text?: string } } | null
    )?.summary?.text;

    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let py = PAGE_H - MARGIN;

    // Header
    page.drawText(safeText(`Photo ${i + 1} of ${photoList.length}`), {
      x: MARGIN,
      y: py,
      size: 9,
      font: helv,
      color: MUTED,
    });
    py -= 18;
    page.drawText(safeText(((p.photo_location as string | null) ?? "Photo").toString()), {
        x: MARGIN,
        y: py,
        size: 18,
        font: helvBold,
        color: FG,
      },
    );
    py -= 28;

    // Try to embed the image
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
        const maxW = PAGE_W - MARGIN * 2;
        const maxH = 320;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = MARGIN + (maxW - w) / 2;
        page.drawImage(img, { x, y: py - h, width: w, height: h });
        py -= h + 16;
      }
    } catch (err) {
      console.error("[pdf] image embed failed", err);
      page.drawText(safeText("(photo unavailable)"), {
        x: MARGIN,
        y: py,
        size: 10,
        font: helv,
        color: MUTED,
      });
      py -= 16;
    }

    // Summary
    if (summary) {
      py = drawWrappedText(
        page,
        summary,
        MARGIN,
        py,
        PAGE_W - MARGIN * 2,
        10,
        helv,
        MUTED,
      );
      py -= 8;
    }

    // Findings header
    page.drawText(safeText(`Findings · ${findings.length}`), {
      x: MARGIN,
      y: py,
      size: 11,
      font: helvBold,
      color: FG,
    });
    py -= 18;

    if (findings.length === 0) {
      page.drawText(safeText("No deficiencies detected."), {
        x: MARGIN,
        y: py,
        size: 10,
        font: helv,
        color: MUTED,
      });
      py -= 14;
    } else {
      for (let f = 0; f < findings.length; f++) {
        const finding = findings[f];

        // New page if running short on room.
        if (py < 140) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          py = PAGE_H - MARGIN;
        }

        // Severity dot
        page.drawCircle({
          x: MARGIN + 5,
          y: py + 2,
          size: 4,
          color: severityColor(finding.severity),
        });

        // Title
        const titleSize = 11;
        const title = `#${f + 1} · ${finding.severity} · ${finding.title}`;
        py = drawWrappedText(
          page,
          title,
          MARGIN + 18,
          py,
          PAGE_W - MARGIN * 2 - 18,
          titleSize,
          helvBold,
          FG,
        );

        // Code + category
        const meta = [finding.category, finding.code].filter(Boolean).join(" · ");
        if (meta) {
          page.drawText(safeText(meta), {
            x: MARGIN + 18,
            y: py,
            size: 9,
            font: helv,
            color: MUTED,
          });
          py -= 14;
        }

        if (finding.location) {
          py = drawWrappedText(
            page,
            `Location: ${finding.location}`,
            MARGIN + 18,
            py,
            PAGE_W - MARGIN * 2 - 18,
            9,
            helv,
            MUTED,
          );
        }

        if (finding.description) {
          py = drawWrappedText(
            page,
            finding.description,
            MARGIN + 18,
            py - 2,
            PAGE_W - MARGIN * 2 - 18,
            10,
            helv,
            FG,
          );
        }

        if (finding.remediation) {
          py -= 4;
          page.drawText(safeText("Remediation:"), {
            x: MARGIN + 18,
            y: py,
            size: 9,
            font: helvBold,
            color: TEAL,
          });
          py -= 12;
          py = drawWrappedText(
            page,
            finding.remediation,
            MARGIN + 18,
            py,
            PAGE_W - MARGIN * 2 - 18,
            10,
            helv,
            FG,
          );
        }

        if (finding.references && finding.references.length > 0) {
          py -= 2;
          page.drawText(safeText(`References: ${finding.references.join("; ")}`), {
            x: MARGIN + 18,
            y: py,
            size: 8,
            font: helv,
            color: MUTED,
          });
          py -= 12;
        }

        py -= 12;
      }
    }
  }

  // ---- Page numbers footer ----
  const pages = pdf.getPages();
  pages.forEach((page, idx) => {
    page.drawText(safeText(`Compliance Lens by Samektra · Page ${idx + 1} of ${pages.length}`), {
      x: MARGIN,
      y: 24,
      size: 8,
      font: helv,
      color: MUTED,
    });
  });

  const bytes = await pdf.save();
  const filename = sanitizeFilename(
    `${inspection.facility_name ?? "inspection"} - ${inspection.date_of_inspection ?? ""}.pdf`,
  );

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
 * the AI emits constantly. Replace them with ASCII equivalents to avoid the
 * "WinAnsi cannot encode" runtime error that 500s the route.
 */
function safeText(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/[\u2013\u2014]/g, "-") // en/em dash
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // curly single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // curly double quotes
    .replace(/\u2026/g, "...") // ellipsis
    .replace(/\u00B7/g, "-") // middle dot
    .replace(/\u00A7/g, "Sec. ") // section sign
    .replace(/\u00B6/g, "P. ") // pilcrow
    .replace(/\u00B0/g, "deg ") // degree
    .replace(/\u00BD/g, "1/2") // 1/2
    .replace(/\u00BC/g, "1/4")
    .replace(/\u00BE/g, "3/4")
    .replace(/[^\x00-\xFF]/g, "?"); // anything else outside Latin-1 -> '?'
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9._\- ]/gi, "_").slice(0, 200);
}
