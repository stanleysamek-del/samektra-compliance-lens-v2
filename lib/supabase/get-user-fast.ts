import { createClient } from "@/lib/supabase/server";

/**
 * Wraps `supabase.auth.getUser()` with a hard timeout. If Supabase is slow
 * or unreachable we resolve to `null` instead of hanging the entire page.
 * Public pages use this to short-circuit the "you're already signed in,
 * go to /inspections" redirect — losing that redirect on an outage is much
 * better than letting Vercel time the whole page out.
 *
 * Protected pages should NOT use this — they should call getUser() directly
 * and let it fail loudly, because rendering them without auth is unsafe.
 */
export async function getUserOrNullFast(timeoutMs = 2500): Promise<{ id: string } | null> {
  try {
    const supabase = await createClient();
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getUser-timeout")), timeoutMs),
      ),
    ]);
    return result.data.user ?? null;
  } catch (err) {
    console.warn(
      "[getUserOrNullFast] failing open:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
