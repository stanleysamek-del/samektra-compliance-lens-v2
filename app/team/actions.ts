"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email/send-invite";

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
  if (role !== "admin" && role !== "member" && role !== "viewer") return;
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

  // Insert the invite row AND select back the generated token so we can
  // build the link + send the email in one pass. The token is created
  // server-side via the gen_random_uuid default in the schema.
  const { data: insertedInvite, error } = await supabase
    .from("organization_invites")
    .insert({
      organization_id: orgId,
      email: emailRaw,
      role,
    })
    .select("token")
    .maybeSingle();
  if (error) {
    console.error("[inviteMember]", error);
    redirect(`/team?error=${encodeURIComponent(error.message)}`);
  }

  // Best-effort email delivery via Resend. Failures don't block the invite
  // itself — the admin can still copy the link manually from the pending-
  // invites list. RESEND_API_KEY missing → no-op + console log.
  if (insertedInvite?.token) {
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    await sendInviteEmail({
      toEmail: emailRaw,
      inviterName: inviterProfile?.full_name ?? user.email ?? "A teammate",
      orgName: orgRow?.name ?? "Compliance Lens",
      role: role as "admin" | "member",
      token: insertedInvite.token as string,
    });
  }

  revalidatePath("/team");
  revalidatePath("/team/members");
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

/**
 * Transfer admin role: promote the target member to admin AND demote the
 * acting user to member, in one operation. Useful when the sole admin
 * wants to leave the team — they hand off, then the "Leave team" button
 * unblocks (since adminCount is no longer 1 and they are no longer admin).
 *
 * Not strictly atomic (two updates, not a transaction), but ordering is
 * safe: we promote the target FIRST so the org always has at least one
 * admin throughout the operation. If the demote-self step fails, the
 * caller can re-run the demote manually via the role dropdown.
 */
export async function transferAdminRole(formData: FormData) {
  const targetMemberId = String(formData.get("member_id") ?? "");
  const orgId = String(formData.get("organization_id") ?? "");
  if (!targetMemberId || !orgId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Look up the target row to make sure it belongs to this org and to
  // grab the user_id (so we can reject self-transfer cleanly).
  const { data: target } = await supabase
    .from("organization_members")
    .select("id, user_id, organization_id, role")
    .eq("id", targetMemberId)
    .maybeSingle();

  if (!target || target.organization_id !== orgId) {
    redirect(
      `/team/members?error=${encodeURIComponent("Member not found in this team")}`,
    );
  }

  if (target!.user_id === user.id) {
    redirect(
      `/team/members?error=${encodeURIComponent("Pick someone else to transfer admin role to")}`,
    );
  }

  // Step 1: promote target to admin.
  const { error: promoteErr } = await supabase
    .from("organization_members")
    .update({ role: "admin" })
    .eq("id", targetMemberId);
  if (promoteErr) {
    console.error("[transferAdminRole:promote]", promoteErr);
    redirect(
      `/team/members?error=${encodeURIComponent(
        promoteErr.message || "Couldn't promote member. Are you an admin?",
      )}`,
    );
  }

  // Step 2: demote self to member.
  const { error: demoteErr } = await supabase
    .from("organization_members")
    .update({ role: "member" })
    .eq("organization_id", orgId)
    .eq("user_id", user.id);
  if (demoteErr) {
    // Promote already succeeded, so the org isn't admin-less. Surface
    // the partial state instead of failing silently.
    console.error("[transferAdminRole:demote]", demoteErr);
    redirect(
      `/team/members?error=${encodeURIComponent(
        "Promoted them to admin, but couldn't step down. Use the role dropdown to demote yourself.",
      )}`,
    );
  }

  revalidatePath("/team");
  revalidatePath("/team/members");
  redirect("/team/members");
}

/**
 * Permanently delete an organization. Admin-only — RLS policy
 * `orgs_admin_delete` enforces this server-side. Cascade FKs handle
 * organization_members, organization_invites, and inspection_folders.
 * Inspections previously assigned to the org have their organization_id
 * set to NULL by the FK (so they become personal-workspace items for
 * whoever created them) — they are NOT destroyed.
 *
 * Type-to-confirm: the form must include `confirm_name` matching the
 * org name exactly. This prevents reflexive clicks on the wrong row.
 */
export async function deleteOrganization(formData: FormData) {
  const orgId = String(formData.get("organization_id") ?? "");
  const confirmName = String(formData.get("confirm_name") ?? "").trim();
  if (!orgId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Re-fetch the org to verify the typed name matches. Doing this
  // server-side prevents a stale client-side comparison from passing.
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) {
    redirect(
      `/team/members?error=${encodeURIComponent("Team not found or you don't have access")}`,
    );
  }

  if (confirmName !== org!.name) {
    redirect(
      `/team/members?error=${encodeURIComponent(
        `Type the team name exactly to confirm: ${org!.name}`,
      )}`,
    );
  }

  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", orgId);

  if (error) {
    console.error("[deleteOrganization]", error);
    redirect(
      `/team/members?error=${encodeURIComponent(
        error.message || "Couldn't delete team. You must be an admin.",
      )}`,
    );
  }

  // If the deleted org was the active one, drop the cookie so the user
  // falls back to personal workspace rather than a dangling reference.
  const store = await cookies();
  if (store.get(CURRENT_ORG_COOKIE)?.value === orgId) {
    await setCurrentOrgCookie(null);
  }

  revalidatePath("/team");
  revalidatePath("/team/members");
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
