/**
 * Shared shapes for facility plans + pins (migration 0025). Kept in a
 * plain module (no "use client"/"use server") so server actions, server
 * components, and client components can all import them.
 */

export type PinKind = "finding" | "photo" | "device" | "note";

export type PlanRow = {
  id: string;
  facility_id: string;
  name: string;
  page: number;
  width: number | null;
  height: number | null;
  storage_path: string;
  source_path: string | null;
  sort: number;
  created_at: string;
};

/** A pin as stored (x/y already coerced to numbers — Postgres numeric
 *  comes back as a string from PostgREST). */
export type PinRow = {
  id: string;
  plan_id: string;
  facility_id: string;
  kind: PinKind;
  inspection_id: string | null;
  finding_id: string | null;
  photo_id: string | null;
  asset_id: string | null;
  x: number;
  y: number;
  label: string | null;
  created_at: string;
};

/** What the viewer needs to draw + describe one pin. Built by whoever
 *  loads the pins (server section, modal, photo page) so the viewer itself
 *  never touches the database. */
export type ViewerPin = {
  id: string;
  kind: PinKind;
  x: number;
  y: number;
  label: string | null;
  /** Finding number within the inspection; null → drawn as a dot. */
  number: number | null;
  /** Popover title: finding title / photo location / note label. */
  title: string;
  /** Popover subtitle, e.g. "High · Photo 3". */
  subtitle?: string | null;
  /** "Open" link target, if any. */
  href?: string | null;
  severity?: "Low" | "Medium" | "High" | null;
};

/** Coerce a raw plan_pins row (numeric → string) into PinRow. */
export function toPinRow(raw: Record<string, unknown>): PinRow {
  return {
    id: String(raw.id),
    plan_id: String(raw.plan_id),
    facility_id: String(raw.facility_id),
    kind: (raw.kind as PinKind) ?? "note",
    inspection_id: (raw.inspection_id as string | null) ?? null,
    finding_id: (raw.finding_id as string | null) ?? null,
    photo_id: (raw.photo_id as string | null) ?? null,
    asset_id: (raw.asset_id as string | null) ?? null,
    x: clamp01(Number(raw.x)),
    y: clamp01(Number(raw.y)),
    label: (raw.label as string | null) ?? null,
    created_at: String(raw.created_at ?? ""),
  };
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export const PIN_SELECT =
  "id, plan_id, facility_id, kind, inspection_id, finding_id, photo_id, asset_id, x, y, label, created_at";

export const PLAN_SELECT =
  "id, facility_id, name, page, width, height, storage_path, source_path, sort, created_at";

/** Pin fill colours by kind — one palette for the viewer and the PDF. */
export const PIN_COLORS: Record<PinKind, string> = {
  finding: "#a8362b",
  photo: "#1f6f8b",
  device: "#607a3a",
  note: "#b8762a",
};
