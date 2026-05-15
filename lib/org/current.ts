import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const CURRENT_ORG_COOKIE = "cl_org";

export type CurrentOrg = {
  id: string;
  name: string;
  slug: string;
  role: "admin" | "member";
};

/**
 * Server-side lookup of the user's current organization context.
 * Returns null when the user is in personal workspace (no cookie set
 * OR cookie points at an org they're no longer a member of).
 */
export async function getCurrentOrg(): Promise<CurrentOrg | null> {
  const store = await cookies();
  const cookieOrgId = store.get(CURRENT_ORG_COOKIE)?.value;
  if (!cookieOrgId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Confirm membership before trusting the cookie — handles the case
  // where a user was removed from an org but their cookie still points there.
  const { data: member } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug)")
    .eq("organization_id", cookieOrgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member || !member.organizations) return null;

  const org = member.organizations as unknown as {
    id: string;
    name: string;
    slug: string;
  };
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    role: member.role as "admin" | "member",
  };
}

/**
 * List every organization the current user is a member of, used by the
 * AppShell org switcher dropdown.
 */
export async function listMyOrganizations(): Promise<
  Array<{ id: string; name: string; role: "admin" | "member" }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name)")
    .eq("user_id", user.id);

  return (data ?? [])
    .map((row) => {
      const o = row.organizations as unknown as { id: string; name: string };
      if (!o) return null;
      return {
        id: o.id,
        name: o.name,
        role: row.role as "admin" | "member",
      };
    })
    .filter((r): r is { id: string; name: string; role: "admin" | "member" } =>
      r !== null,
    );
}
