import { ASSET_TYPES } from "@/lib/assets";
export type EquipmentImportRow = {
  barcode: string;
  label: string;
  type: string;
  location: string;
  manufacturer: string;
  model: string;
  serial: string;
};
export const IMPORT_FIELDS = [
  "barcode",
  "label",
  "type",
  "location",
  "manufacturer",
  "model",
  "serial",
] as const;
export const COLUMN_ALIASES: Record<(typeof IMPORT_FIELDS)[number], string[]> =
  {
    barcode: [
      "barcode",
      "barcode number",
      "barcode id",
      "asset tag",
      "tag number",
      "tag id",
      "equipment id",
    ],
    label: ["label", "asset name", "equipment name", "description", "device"],
    type: ["type", "asset type", "equipment type"],
    location: [
      "location",
      "location description",
      "location text",
      "room",
      "area",
    ],
    manufacturer: ["manufacturer", "make"],
    model: ["model", "model number"],
    serial: ["serial", "serial number", "serial no"],
  };
export function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[_#.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function detectColumns(headers: string[]) {
  return Object.fromEntries(
    IMPORT_FIELDS.map((f) => [
      f,
      headers.findIndex((h) => COLUMN_ALIASES[f].includes(normalizeHeader(h))),
    ]),
  ) as Record<(typeof IMPORT_FIELDS)[number], number>;
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || value === "") quoted = !quoted;
      else value += c;
    } else if (c === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}
export function validateEquipmentRows(
  rows: EquipmentImportRow[],
): string | null {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500)
    return "Import between 1 and 500 equipment rows at a time.";
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || IMPORT_FIELDS.some((f) => typeof r[f] !== "string"))
      return `Row ${i + 1}: invalid fields.`;
    if (
      !r.barcode.trim() ||
      r.barcode.length > 160 ||
      /[\x00-\x1f\x7f]/.test(r.barcode)
    )
      return `Row ${i + 1}: a barcode of 1?160 characters is required.`;
    if (seen.has(r.barcode.trim()))
      return `Row ${i + 1}: duplicate barcode ${r.barcode}. Remove duplicates before importing.`;
    seen.add(r.barcode.trim());
    if (!ASSET_TYPES.some((t) => t === r.type))
      return `Row ${i + 1}: choose a supported equipment type.`;
    if (
      r.label.length > 160 ||
      r.location.length > 500 ||
      [r.manufacturer, r.model, r.serial].some((s) => s.length > 160)
    )
      return `Row ${i + 1}: shorten the text fields.`;
  }
  return null;
}
