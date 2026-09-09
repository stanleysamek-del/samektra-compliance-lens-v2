import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Server-only service-role access for jobs, cron, and atomic paid-usage reservations.
 * Never import into a client component or expose this key in a NEXT_PUBLIC variable.
 * User-facing record reads and writes use the session client and RLS.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
