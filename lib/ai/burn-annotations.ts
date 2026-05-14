/**
 * Server-side image compositing for AI re-analysis.
 *
 * When an inspector annotates a photo with rectangles, circles, arrows,
 * or text, those shapes are stored as normalized coords on the photo
 * (annotations JSONB) and on each finding (bbox_* columns). For deep
 * re-analysis we want the AI to SEE those shapes so the inspector's
 * markup can direct the model's attention to subtle items.
 *
 * This module flattens the shapes onto the photo's pixels by overlaying
 * an SVG layer and recompositing with sharp. Output is a JPEG buffer
 * suitable for sending to Anthropic / Google / OpenAI's vision APIs.
 *
 * No-op when there are no shapes — returns the original buffer.
 */

import sharp from "sharp";
import type { Annotation } from "@/app/inspections/[id]/photos/[photoId]/actions";

export type BurnableBbox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string | null;       // override color, hex
  strokeWidth?: number | null; // 1 / 2 / 3
  fill?: string | null;        // override fill, hex
  severity: "Low" | "Medium" | "High";
  index: number;
};

const SEVERITY_COLOR: Record<"Low" | "Medium" | "High", string> = {
  Low: "#34d399",
  Medium: "#f87171",
  High: "#f87171",
};

/**
 * Returns a fresh image buffer with annotations + AI bboxes burned on top.
 * The image is re-encoded as JPEG at quality 85. EXIF orientation is
 * applied so any rotation metadata is baked into the pixels (this is also
 * what fixes phone-photo orientation drift on the AI side).
 */
export async function burnAnnotationsOnImage(
  imageBuffer: Buffer,
  annotations: Annotation[],
  bboxes: BurnableBbox[],
): Promise<Buffer> {
  if (annotations.length === 0 && bboxes.length === 0) {
    return imageBuffer;
  }

  // Normalize EXIF orientation FIRST so coordinates align with what the AI
  // will see. Then read the rotated metadata.
  const rotated = await sharp(imageBuffer).rotate().toBuffer();
  const meta = await sharp(rotated).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 768;

  // Build the SVG overlay at the image's pixel dimensions.
  const shapes: string[] = [];

  // AI bboxes (Medium + High; same filter as on-screen)
  for (const b of bboxes) {
    if (b.severity === "Low") continue;
    const x1 = clamp(b.x1) * width;
    const y1 = clamp(b.y1) * height;
    const x2 = clamp(b.x2) * width;
    const y2 = clamp(b.y2) * height;
    const sw = (typeof b.strokeWidth === "number" ? b.strokeWidth : 2) * 2.0;
    const stroke = b.color ?? SEVERITY_COLOR[b.severity];
    const fillAttr = b.fill
      ? `fill="${escapeHex(b.fill)}" fill-opacity="0.25"`
      : `fill="none"`;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    shapes.push(
      `<rect x="${left}" y="${top}" width="${w}" height="${h}" stroke="${escapeHex(stroke)}" stroke-width="${sw}" ${fillAttr}/>`,
    );
    // Numbered badge so the AI can correlate to existing findings.
    shapes.push(badge(left + 6, top + 6, `#${b.index + 1}`, stroke));
  }

  // Inspector annotations
  for (const a of annotations) {
    const x1 = clamp(a.x1) * width;
    const y1 = clamp(a.y1) * height;
    const x2 = clamp(a.x2) * width;
    const y2 = clamp(a.y2) * height;
    const sw = (typeof a.strokeWidth === "number" ? a.strokeWidth : 2) * 2.0;
    const stroke = escapeHex(a.color);
    const fillAttr = a.fill
      ? `fill="${escapeHex(a.fill)}" fill-opacity="0.25"`
      : `fill="none"`;

    if (a.type === "rect") {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      shapes.push(
        `<rect x="${left}" y="${top}" width="${w}" height="${h}" stroke="${stroke}" stroke-width="${sw}" ${fillAttr}/>`,
      );
    } else if (a.type === "circle") {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      shapes.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${stroke}" stroke-width="${sw}" ${fillAttr}/>`,
      );
    } else if (a.type === "arrow") {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len > 0.5) {
        const ux = dx / len;
        const uy = dy / len;
        const perpX = -uy;
        const perpY = ux;
        const headLen = Math.max(14, sw * 5);
        const baseX = x2 - ux * headLen;
        const baseY = y2 - uy * headLen;
        const leftX = baseX + perpX * headLen * 0.55;
        const leftY = baseY + perpY * headLen * 0.55;
        const rightX = baseX - perpX * headLen * 0.55;
        const rightY = baseY - perpY * headLen * 0.55;
        shapes.push(
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`,
        );
        shapes.push(
          `<polygon points="${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}" fill="${stroke}"/>`,
        );
      }
    } else if (a.type === "text") {
      const fsMul = typeof a.fontSize === "number" ? a.fontSize : 2;
      const fontSize = Math.max(14, fsMul * Math.max(12, width / 80));
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const text = (a.text ?? "").slice(0, 80);
      shapes.push(
        `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${stroke}" font-size="${fontSize}" font-family="sans-serif" font-weight="bold" stroke="rgba(0,0,0,0.85)" stroke-width="3" paint-order="stroke">${escapeXmlText(text)}</text>`,
      );
    }
  }

  const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join("")}</svg>`;

  const out = await sharp(rotated)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  return out;
}

/* ---------- helpers ---------- */

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function escapeHex(hex: string): string {
  // Strip anything that isn't a valid hex color so we don't break the SVG.
  if (typeof hex !== "string") return "#f87171";
  const m = hex.match(/^#[0-9a-fA-F]{3,8}$/);
  return m ? hex : "#f87171";
}

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function badge(x: number, y: number, text: string, color: string): string {
  // Small numbered circle for AI-bbox badges (correlates to findings list).
  return [
    `<circle cx="${x + 10}" cy="${y + 10}" r="11" fill="${escapeHex(color)}" stroke="rgba(0,0,0,0.55)" stroke-width="1.5"/>`,
    `<text x="${x + 10}" y="${y + 14}" text-anchor="middle" fill="#0a0d12" font-size="13" font-family="sans-serif" font-weight="bold">${escapeXmlText(text)}</text>`,
  ].join("");
}
