import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS. The ONLY consumer is the cron
 * route (cross-user scans have no user session to ride). Everything
 * user-facing stays on the anon client + RLS; keep it that way.
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY isn't configured so the
 * cron degrades to a logged no-op instead of crashing — same contract
 * as the Resend email helpers.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
