import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runWorker } from "@/lib/jobs/analysis";

/**
 * Analysis-queue worker (migration 0024).
 *
 * Drains `analysis_jobs`: sweeps locks older than 3 minutes back to
 * queued, then claims + runs jobs one at a time while under
 * AI_MAX_CONCURRENCY (env, default 2 — counted as `running` jobs locked
 * in the last 3 minutes) and a ~70s wall-clock budget. Every upload
 * also kicks this loop via `after()`, so the common no-contention case
 * never waits for the cron; the cron (vercel.json, every minute) is the
 * guarantee that nothing is left behind when a function dies.
 *
 * Auth: same contract as /api/cron/overdue — when CRON_SECRET is set, a
 * `Bearer ${CRON_SECRET}` header is required; unset (local dev) the
 * route runs open. Vercel crons are GETs; POST is accepted for manual
 * triggers.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const service = createServiceClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "service key missing (SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 503 },
    );
  }

  const summary = await runWorker(service, { workerId: `cron-${crypto.randomUUID().slice(0, 8)}` });
  if (summary.stoppedBecause === "migration-missing") {
    return NextResponse.json({ ok: false, ...summary }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
