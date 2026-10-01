import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight liveness check polled by the client-side status banner.
 * Checks an RLS-protected table with an anonymous HEAD request and zero
 * rows. The PostgREST root may be restricted to service-role keys even
 * while the app is healthy. No inspection records are returned. Returns:
 *
 *   {
 *     ok: boolean,           // true when Supabase responded < timeout
 *     latencyMs: number,     // round-trip time we observed
 *     supabase: "up" | "slow" | "down",
 *   }
 *
 * "slow" = responded but took > 1500ms (still up, but degraded — the banner
 * can warn the user that things may feel sluggish).
 */
const FAST_THRESHOLD_MS = 1500;
const TIMEOUT_MS = 4000;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, latencyMs: 0, supabase: "down", reason: "missing-env" },
      { status: 200 },
    );
  }

  const started = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/inspections?select=id&limit=0`, {
      method: "HEAD",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    const supabase =
        !res.ok
        ? "down"
        : latencyMs > FAST_THRESHOLD_MS
          ? "slow"
          : "up";
    return NextResponse.json(
      { ok: supabase !== "down", latencyMs, supabase },
      {
        status: 200,
        // Don't let CDNs/proxies cache the health check.
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        latencyMs: Date.now() - started,
        supabase: "down",
        reason: err instanceof Error ? err.message : String(err),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
