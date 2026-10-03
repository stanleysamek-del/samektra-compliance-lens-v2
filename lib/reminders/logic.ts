/**
 * Reminder timing — pure, stateless, and shared by the daily cron.
 *
 * "Stateless" means no bookkeeping table: whether something is reminded
 * today is decided from the gap between today and its due date alone, so
 * the cron can run any number of times a day (or be skipped for a day)
 * without double-sending or needing to remember what it already sent.
 */

/** Overdue nudges at these days past due, then monthly — never daily forever. */
export const NUDGE_DAYS = new Set([1, 3, 7, 14, 30]);

export function shouldNudge(daysPast: number): boolean {
  if (daysPast <= 0) return false;
  if (NUDGE_DAYS.has(daysPast)) return true;
  return daysPast > 30 && daysPast % 30 === 0;
}

export type Phase = "heads_up" | "due_today" | "overdue";

/** Whole days from `dueIso` to `todayIso` (both YYYY-MM-DD, UTC). Positive = past due. */
export function daysPastDue(todayIso: string, dueIso: string): number {
  return Math.round(
    (Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${dueIso.slice(0, 10)}T00:00:00Z`)) / 86_400_000,
  );
}

/** Scheduled inspections: the day before, the day of, then overdue nudges. */
export function schedulePhase(daysPast: number): Phase | null {
  if (daysPast === -1) return "heads_up";
  if (daysPast === 0) return "due_today";
  return shouldNudge(daysPast) ? "overdue" : null;
}

/** Equipment: a week ahead, the day before, the day of, then overdue nudges. */
export function assetPhase(daysPast: number): Phase | null {
  if (daysPast === -7 || daysPast === -1) return "heads_up";
  if (daysPast === 0) return "due_today";
  return shouldNudge(daysPast) ? "overdue" : null;
}

/** "due today" / "due tomorrow" / "due in 7 days" / "3 days overdue". */
export function describeDue(daysPast: number): string {
  if (daysPast > 0) return `${daysPast} day${daysPast === 1 ? "" : "s"} overdue`;
  if (daysPast === 0) return "due today";
  if (daysPast === -1) return "due tomorrow";
  return `due in ${-daysPast} days`;
}

/** Group items by recipient so each person gets ONE email, not one per item. */
export function groupByRecipient<T>(entries: Array<{ email: string; item: T }>): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const { email, item } of entries) {
    const key = email.trim().toLowerCase();
    if (!key) continue;
    const list = out.get(key) ?? [];
    list.push(item);
    out.set(key, list);
  }
  return out;
}

/** a***@example.org — for dry-run output, which should never print full addresses. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 1)}***@${domain}`;
}
