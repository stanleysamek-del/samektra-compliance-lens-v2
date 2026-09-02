"use server";

/**
 * Corrective-action workflow mutations (Phase 1, migration 0019).
 *
 * Lifecycle: open → in_progress → done → verified, plus wont_fix (note
 * required — the DB check enforces it too). All writes ride the user's
 * own session client, so RLS (can_write_inspection) is the enforcement
 * layer; these functions never bypass it.
 *
 * Emails are best-effort: a failed send never fails the mutation.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendActionEmail } from "@/lib/email/send-action-notification";

export type ActionStatus =
  | "open"
  | "in_progress"
  | "done"
  | "verified"
  | "wont_fix";

export type ActionPriority = "low" | "medium" | "high";

/**
 * Turn a raw Postgres / PostgREST error into something a facility manager
 * can act on. Unknown errors fall through to the raw message.
 */
function friendlyError(
  err: { code?: string; message?: string } | null | undefined,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!err) return fallback;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied")
  ) {
    return "You don't have permission to change this action.";
  }
  if (code === "23514" && msg.includes("closure_note")) {
    return "Won't-fix needs a written reason.";
  }
  if (code === "23514" || code === "22P02" || code === "22001") {
    return "Some of the values aren't valid. Check them and try again.";
  }
  if (code === "23503") return "That photo or person no longer exists.";
  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnrefused")
  ) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return err.message || fallback;
}

/** Everything the strip + board need to revalidate after a mutation. */
function revalidateFindingSurfaces(inspectionId: string, photoId: string | null) {
  revalidatePath("/actions", "page");
  revalidatePath(`/inspections/${inspectionId}`, "page");
  if (photoId) {
    revalidatePath(`/inspections/${inspectionId}/photos/${photoId}`, "page");
  }
}

async function getFindingContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  findingId: string,
) {
  const { data } = await supabase
    .from("findings")
    .select(
      "id, inspection_id, photo_id, title, severity, created_by, assigned_to, assigned_email, cap_target_date, inspections!inner(facility_name, organization_id)",
    )
    .eq("id", findingId)
    .maybeSingle();
  return data as unknown as {
    id: string;
    inspection_id: string;
    photo_id: string | null;
    title: string;
    severity: string;
    created_by: string;
    assigned_to: string | null;
    assigned_email: string | null;
    cap_target_date: string | null;
    inspections: { facility_name: string; organization_id: string | null } | null;
  } | null;
}

async function getActorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fallback: string,
) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.full_name ?? fallback;
}

/**
 * Assign (or reassign) a finding as a corrective action.
 * assigneeUserId targets an org member (email resolved via the
 * org_member_directory RPC); assigneeEmail covers non-members. Passing
 * neither clears the assignment.
 */
export async function assignAction(input: {
  findingId: string;
  inspectionId: string;
  assigneeUserId?: string | null;
  assigneeEmail?: string | null;
  priority: ActionPriority;
  dueDate?: string | null; // YYYY-MM-DD
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await getFindingContext(supabase, input.findingId);
  if (!ctx) return { ok: false as const, error: "Finding not found" };

  const assigneeUserId = input.assigneeUserId || null;
  let assigneeEmail = (input.assigneeEmail || "").trim().toLowerCase() || null;

  // Resolve a member assignee's email through the RLS-safe directory RPC.
  if (assigneeUserId && ctx.inspections?.organization_id) {
    const { data: directory } = await supabase.rpc("org_member_directory", {
      _org_id: ctx.inspections.organization_id,
    });
    const member = (directory as Array<{ user_id: string; email: string }> | null)?.find(
      (m) => m.user_id === assigneeUserId,
    );
    if (member?.email) assigneeEmail = member.email;
  }

  const clearing = !assigneeUserId && !assigneeEmail;

  const { error } = await supabase
    .from("findings")
    .update({
      assigned_to: assigneeUserId,
      assigned_email: assigneeEmail,
      assigned_by: clearing ? null : user.id,
      assigned_at: clearing ? null : new Date().toISOString(),
      priority: input.priority,
      cap_target_date: input.dueDate || null,
    })
    .eq("id", input.findingId);

  if (error) {
    console.error("[assignAction]", error);
    return { ok: false as const, error: friendlyError(error) };
  }

  // Notify the assignee — best-effort, never blocks. Skip self-assigns:
  // you don't need an email about the task you just gave yourself.
  if (!clearing && assigneeEmail && assigneeUserId !== user.id) {
    const actorName = await getActorName(supabase, user.id, user.email ?? "A teammate");
    await sendActionEmail({
      kind: "assigned",
      toEmail: assigneeEmail,
      findingTitle: ctx.title,
      severity: ctx.severity,
      facilityName: ctx.inspections?.facility_name ?? "your facility",
      dueDate: input.dueDate || null,
      actorName,
      inspectionId: input.inspectionId,
      photoId: ctx.photo_id,
      findingId: input.findingId,
    });
  }

  revalidateFindingSurfaces(input.inspectionId, ctx.photo_id);
  return { ok: true as const };
}

/**
 * Move a finding through the lifecycle. `done` and `wont_fix` should go
 * through closeAction (evidence rules live there); this handles
 * open / in_progress / verified / reopen transitions.
 */
export async function setActionStatus(input: {
  findingId: string;
  inspectionId: string;
  status: Exclude<ActionStatus, "done" | "wont_fix">;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ctx = await getFindingContext(supabase, input.findingId);
  if (!ctx) return { ok: false as const, error: "Finding not found" };

  const update: Record<string, unknown> = { cap_status: input.status };
  // Reopening clears the close-out trail so a second close is honest.
  if (input.status === "open" || input.status === "in_progress") {
    update.action_closed_at = null;
  }

  const { error } = await supabase
    .from("findings")
    .update(update)
    .eq("id", input.findingId);

  if (error) {
    console.error("[setActionStatus]", error);
    return { ok: false as const, error: friendlyError(error) };
  }

  revalidateFindingSurfaces(input.inspectionId, ctx.photo_id);
  return { ok: true as const };
}

/**
 * Close a finding: status `done` (fixed — needs a closure photo id OR an
 * explicit note describing why there's no photo) or `wont_fix` (note
 * always required; the DB constraint backs this up).
 *
 * On `done`, the inspector who created the finding gets a "verify it"
 * email if they're not the one closing it.
 */
export async function closeAction(input: {
  findingId: string;
  inspectionId: string;
  status: "done" | "wont_fix";
  closurePhotoId?: string | null;
  closureNote?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const note = (input.closureNote || "").trim() || null;
  const photoId = input.closurePhotoId || null;

  if (input.status === "wont_fix" && !note) {
    return { ok: false as const, error: "Won't-fix needs a written reason." };
  }
  if (input.status === "done" && !photoId && !note) {
    return {
      ok: false as const,
      error: "Close-out needs a photo or a written note.",
    };
  }

  const ctx = await getFindingContext(supabase, input.findingId);
  if (!ctx) return { ok: false as const, error: "Finding not found" };

  // A close-out photo must belong to THIS inspection — the picker only
  // offers those, but the id arrives from the client so we re-check.
  if (photoId) {
    const { data: photo } = await supabase
      .from("photos")
      .select("id")
      .eq("id", photoId)
      .eq("inspection_id", input.inspectionId)
      .maybeSingle();
    if (!photo) {
      return {
        ok: false as const,
        error: "That close-out photo isn't part of this inspection.",
      };
    }
  }

  const { error } = await supabase
    .from("findings")
    .update({
      cap_status: input.status,
      action_closed_at: new Date().toISOString(),
      closure_photo_id: photoId,
      closure_note: note,
    })
    .eq("id", input.findingId);

  if (error) {
    console.error("[closeAction]", error);
    return { ok: false as const, error: friendlyError(error) };
  }

  if (input.status === "done" && ctx.created_by !== user.id) {
    // Tell the finding's author it's ready to verify. Their email comes
    // from the org directory when available; personal-workspace findings
    // have no directory, so we skip silently there.
    if (ctx.inspections?.organization_id) {
      const { data: directory } = await supabase.rpc("org_member_directory", {
        _org_id: ctx.inspections.organization_id,
      });
      const author = (directory as Array<{ user_id: string; email: string }> | null)?.find(
        (m) => m.user_id === ctx.created_by,
      );
      if (author?.email) {
        const actorName = await getActorName(supabase, user.id, user.email ?? "A teammate");
        await sendActionEmail({
          kind: "done",
          toEmail: author.email,
          findingTitle: ctx.title,
          severity: ctx.severity,
          facilityName: ctx.inspections?.facility_name ?? "your facility",
          dueDate: ctx.cap_target_date,
          actorName,
          inspectionId: input.inspectionId,
          photoId: ctx.photo_id,
          findingId: input.findingId,
        });
      }
    }
  }

  revalidateFindingSurfaces(input.inspectionId, ctx.photo_id);
  return { ok: true as const };
}

/** Append a comment to a finding's action thread. */
export async function addFindingComment(input: {
  findingId: string;
  inspectionId: string;
  body: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const body = input.body.trim();
  if (!body) return { ok: false as const, error: "Empty comment" };

  const { error } = await supabase.from("finding_comments").insert({
    finding_id: input.findingId,
    inspection_id: input.inspectionId,
    body: body.slice(0, 4000),
  });

  if (error) {
    console.error("[addFindingComment]", error);
    return { ok: false as const, error: friendlyError(error) };
  }

  const ctx = await getFindingContext(supabase, input.findingId);
  revalidateFindingSurfaces(input.inspectionId, ctx?.photo_id ?? null);
  return { ok: true as const };
}
