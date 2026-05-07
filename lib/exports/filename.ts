/**
 * Export filename builder, modeled after the customer's archive convention:
 *   {ReportType} - {FacilityCode} - {LocationDetail}-{MM}-{YY}.{ext}
 *
 * Examples:
 *   EOC-LS-Inspection - NHD - 1st-Floor-SC-1,3-7-24.pdf
 *   CAP - NHD - 1st-Floor-SC-1,3-7-24.xlsx
 *   LSRA - NHD - 1st-Floor-SC-1,3-7-24.xlsx
 */

export type ReportType = "EOC-LS-Inspection" | "CAP" | "LSRA";

export type ExportInspection = {
  facility_name: string | null;
  location: string | null;
  date_of_inspection: string | null;
};

/** Initials of the facility name, max 6 chars. "Northside Hospital Duluth" → "NHD". */
export function facilityCode(inspection: ExportInspection): string {
  const name = (inspection.facility_name ?? "").trim();
  if (!name) return "FAC";
  const initials = name
    .split(/\s+/)
    .filter((w) => /[A-Za-z]/.test(w))
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (initials || name.slice(0, 6)).slice(0, 6) || "FAC";
}

/** Location string with whitespace → dashes, unsafe chars stripped. */
export function locationCode(inspection: ExportInspection): string {
  const raw = (inspection.location ?? "").trim();
  if (!raw) return "Inspection";
  return raw
    .replace(/[^\w\s,.-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/** "MM-YY" from the inspection date. Returns "" if no date. */
export function dateCode(inspection: ExportInspection): string {
  if (!inspection.date_of_inspection) return "";
  const d = new Date(inspection.date_of_inspection);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1);
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}-${yy}`;
}

/** Full filename with extension, sanitized for filesystem safety. */
export function buildExportFilename(
  inspection: ExportInspection,
  reportType: ReportType,
  ext: string,
): string {
  const fc = facilityCode(inspection);
  const lc = locationCode(inspection);
  const dc = dateCode(inspection);
  const tail = dc ? `-${dc}` : "";
  const raw = `${reportType} - ${fc} - ${lc}${tail}.${ext}`;
  // Allow letters/digits/space/dash/dot/underscore/comma — match the customer's
  // archive convention. Strip anything else.
  return raw
    .replace(/[^a-z0-9._\- ,]/gi, "_")
    .replace(/_+/g, "_")
    .slice(0, 200);
}
