/**
 * ONE date formatter. Accepts ISO strings (including bare YYYY-MM-DD, which
 * is parsed as a LOCAL date so it never renders as the previous day in US
 * time zones) or Date objects.
 */
function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sep 1, 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Sep 1, 2026, 2:15 PM" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Sep 1" — for tight rows */
export function formatDateShort(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
