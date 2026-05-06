import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current user only if they have is_admin=true on profiles.
 * Otherwise calls notFound() — non-admins see the standard 404 page,
 * which keeps the existence of /admin routes hidden.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, full_name, organization, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile || !profile.is_admin) notFound();

  return { user, profile };
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(profile?.is_admin);
}
