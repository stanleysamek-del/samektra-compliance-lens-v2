import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/keepalive
 *
 * Pinged daily by Vercel Cron (see vercel.json) to keep our Supabase free-tier
 * project from auto-pausing after a week of inactivity.
 *
 * What counts as "activity" for Supabase: a request to the PostgREST API
 * (/rest/v1/*), Auth API (/auth/v1/*), or Realtime. Storage and Edge
 * Functions do NOT count. We hit BOTH /rest/v1/ and /auth/v1/health so we
 * exercise the database path (the one that actually matters for pausing).
 *
 * Authentication: when triggered by a Vercel cron, the request includes
 * `Authorization: Bearer ${CRON_SECRET}` (Vercel populates CRON_SECRET
 * automatically on deploy). We accept any GET when CRON_SECRET isn't set
 * so local dev / manual hits work, but in prod we require the header.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase env vars" },
      { status: 500 },
    );
  }

  const started = Date.now();
  const results: Record<string, { status: number | null; ms: number; error?: string }> = {};

  // 1) PostgREST root — counts as DB activity for the free-tier pause check.
  try {
    const t0 = Date.now();
    const res = await fetch(`${url}/rest/v1/`, {
      method: "GET",
      headers: { apikey: anonKey },
      cache: "no-store",
      // 8s ceiling — if Supabase is too slow even for a noop we still want
      // to log and move on rather than block the cron worker.
      signal: AbortSignal.timeout(8000),
    });
    results.rest = { status: res.status, ms: Date.now() - t0 };
  } catch (err) {
    results.rest = {
      status: null,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2) Auth health — secondary signal; cheap and tells us auth is reachable.
  try {
    const t0 = Date.now();
    const res = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    results.auth = { status: res.status, ms: Date.now() - t0 };
  } catch (err) {
    results.auth = {
      status: null,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const ok = (results.rest?.status ?? 0) >= 200 && (results.rest?.status ?? 0) < 500;

  console.log(
    "[keepalive]",
    JSON.stringify({ ok, totalMs: Date.now() - started, ...results }),
  );

  return NextResponse.json(
    { ok, totalMs: Date.now() - started, ...results },
    { status: ok ? 200 : 502 },
  );
}
