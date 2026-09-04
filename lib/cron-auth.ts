import { timingSafeEqual } from "node:crypto";

/**
 * Shared auth check for the cron / worker routes (/api/jobs/run,
 * /api/cron/overdue, /api/keepalive).
 *
 * Contract:
 *   - CRON_SECRET set        → `Authorization: Bearer ${CRON_SECRET}` required.
 *                              Compared with a constant-time equality so the
 *                              response time doesn't leak how many leading
 *                              bytes matched.
 *   - CRON_SECRET unset, dev → allowed (local convenience: `curl` the route).
 *   - CRON_SECRET unset, prod→ 500. A production deployment must never run
 *                              these routes open — Vercel sets CRON_SECRET
 *                              automatically, so an unset value in prod is a
 *                              misconfiguration, not a choice.
 */
export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function checkCronAuth(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 500, error: "CRON_SECRET not configured" };
    }
    return { ok: true };
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const actual = Buffer.from(header, "utf8");

  // timingSafeEqual throws on length mismatch — and a mismatched length is
  // itself a wrong secret, so answer 401 without comparing.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
