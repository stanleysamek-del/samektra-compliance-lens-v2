"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const CURRENT_ORG_COOKIE = "cl_org";

/* =====================================================================
 * Current-org cookie helpers
 * "Current org" tells the rest of the app which workspace context the
 * user is acting in. Null/missing cookie = personal workspace.
 * ===================================================================== */

async function setCurrentOrgCookie(orgId: string | null) {
  const store = await cookies();
  if (orgId) {
    store.set(CURRENT_ORG_COOKIE, orgId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
    });
  } else {
    store.delete(CURRENT_ORG_COOKIE);
  }
}

/* =====================================================================
 * Create organization
 * ===================================================================== */

export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/team?error=" + encodeURIComponent("Name is required"));
  }
  if (name.length > 120) {
    redirect("/team?error=" + encodeURIComponent("Name is too long"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Generate a slug with a short random suffix to avoid collisions.
  const baseSlug = slugify(name);
  const suffix = Math.random().toString(36).slice(2, 6);
  const slug = `${baseSlug}-${suffix}`.slice(0, 60);

  const { data: row, error } = await supabase
    .from("organizations")
    .insert({ name, slug })
    .select("id")
    .maybeSingle();

  if (error || !row) {
    console.error("[createOrganization]", error);
    redirect(
      "/team?error=" +
        encodeURIComponent(error?.message ?? "Couldn't create organization"),
    );
  }

  // Switch the user into the new org immediately.
  await setCurrentOrgCookie(row.id);

  revalidatePath("/team");
  revalidatePath("/inspections");
  redirect("/team");
}

/* =====================================================================
 * Invites
 * ===================================================================== */

export async function inviteMember(formData: FormData) {
  const orgId = String(formData.get("organization_id") ?? "");
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member");
  if (!orgId || !emailRaw) return;
  if (role !== "admin" && role !== "member") return;
  if (!emailRaw.includes("@")) {
    redirect(
      `/team?error=${encodeURIComponent("Enter a valid email address")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("organization_invites").insert({
    organization_id: orgId,
    email: emailRaw,
    role,
  });
  if (error) {
    console.error("[inviteMember]", error);
    redirect(`/team?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/team");
}

export async function revokeInvite(formData: FormData) {
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!inviteId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("organization_invites").delete().eq("id", inviteId);
  revalidatePath("/team");
}

/**
 * Accept invite via the RPC defined in migration 0014. Wraps the entire
 * "validate token + add member + mark accepted" in a single transaction.
 */
export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/team");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Send to login, come back to the invite page after.
    redirect(
      `/login?next=${encodeURIComponent(`/team/invite/${token}`)}`,
    );
  }

  const { data: orgId, error } = await supabase.rpc("accept_invite", {
    _token: token,
  });
  if (error) {
    redirect(
      `/team/invite/${token}?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Switch into the new org context immediately.
  if (typeof orgId === "string") {
    await setCurrentOrgCookie(orgId);
  }

  revalidatePath("/team");
  revalidatePath("/inspections");
  redirect("/team");
}

/* =====================================================================
 * Members management
 * ===================================================================== */

export async function changeMemberRole(formData: FormData) {
  const memberId = String(formData.get("member_id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!memberId || (role !== "admin" && role !== "member")) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId);
  if (error) console.error("[changeMemberRole]", error);

  revalidatePath("/team");
}

export async function removeMember(formData: FormData) {
  const memberId = String(formData.get("member_id") ?? "");
  if (!memberId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId);
  if (error) console.error("[removeMember]", error);

  revalidatePath("/team");
}

/**
 * Leave an organization (current user only). If the current-org cookie
 * pointed at the org being left, clear it so the user falls back to
 * personal workspace.
 */
export async function leaveOrganization(formData: FormData) {
  const orgId = String(formData.get("organization_id") ?? "");
  if (!orgId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", user.id);

  const store = await cookies();
  if (store.get(CURRENT_ORG_COOKIE)?.value === orgId) {
    await setCurrentOrgCookie(null);
  }

  revalidatePath("/team");
  revalidatePath("/inspections");
  redirect("/team");
}

/* =====================================================================
 * Org switcher
 * ===================================================================== */

export async function switchCurrentOrg(formData: FormData) {
  const orgIdRaw = String(formData.get("organization_id") ?? "");
  const orgId = orgIdRaw === "" || orgIdRaw === "personal" ? null : orgIdRaw;
  await setCurrentOrgCookie(orgId);
  revalidatePath("/inspections");
  revalidatePath("/team");
  redirect("/inspections");
}

/* =====================================================================
 * Slug helper
 * ===================================================================== */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}
