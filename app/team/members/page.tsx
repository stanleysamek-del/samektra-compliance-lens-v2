import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { TeamNav } from "@/components/team-nav";
import { DeleteTeamDialog } from "@/components/delete-team-dialog";
import { SubmitButton } from "@/components/submit-button";
import { HelpTip } from "@/components/help-tip";
import { formatDate } from "@/lib/format-date";
import { getCurrentOrg, listMyOrganizations } from "@/lib/org/current";
import {
  inviteMember,
  revokeInvite,
  changeMemberRole,
  removeMember,
  leaveOrganization,
  switchCurrentOrg,
  deleteOrganization,
  transferAdminRole,
} from "../actions";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://compliancelens.app";

/** Same wording as the invite email + the HelpTip, so the three agree. */
const ROLE_HELP = (
  <>
    <p>
      <span className="font-medium">Admin:</span> invite and remove people,
      edit Chip&apos;s rules, delete the team.
    </p>
    <p className="mt-1">
      <span className="font-medium">Member:</span> create and edit
      inspections, assign corrective actions, close them out.
    </p>
    <p className="mt-1">
      <span className="font-medium">Viewer:</span> read inspections and
      download exports, cannot change anything.
    </p>
  </>
);

export default async function TeamMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const userShell = {
    fullName: profile.full_name,
    organization: profile.organization,
    email: user.email ?? null,
  };

  const { error } = await searchParams;
  const currentOrg = await getCurrentOrg();
  const allOrgs = await listMyOrganizations();

  // Send to /team if no team is selected — that page handles
  // the no-team / pick-a-team flows.
  if (!currentOrg) {
    redirect("/team");
  }

  const org = currentOrg!;
  const isAdmin = org.role === "admin";

  const { data: members } = await supabase
    .from("organization_members")
    .select("id, role, joined_at, user_id, profiles:user_id (full_name)")
    .eq("organization_id", org.id)
    .order("joined_at", { ascending: true });

  const { data: invites } = isAdmin
    ? await supabase
        .from("organization_invites")
        .select("id, email, role, token, expires_at, accepted_at, created_at")
        .eq("organization_id", org.id)
        .is("accepted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] as never[] };

  const adminCount = (members ?? []).filter((m) => m.role === "admin").length;

  // Eligible targets for "transfer admin role": members of this org who
  // are not the current user. Includes existing admins (transferring to
  // them just no-ops the promote step, then demotes the caller — useful
  // when you want to step down without leaving outright).
  const transferTargets = (members ?? []).filter(
    (m) => m.user_id !== user.id,
  );

  return (
    <AppShell user={userShell}>
      <div className="flex flex-col gap-5">
        {/* Header — same shape on every Team tab: eyebrow = team name,
            h1 = the tab you're on. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
              {org.name}
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Members
            </h1>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
              You are {org.role === "admin" ? "an" : "a"}{" "}
              <span className="font-medium text-[var(--fg)]">{org.role}</span> ·{" "}
              {(members ?? []).length}{" "}
              {(members ?? []).length === 1 ? "member" : "members"}
            </p>
          </div>

          {allOrgs.length > 1 ? (
            <form action={switchCurrentOrg} className="flex shrink-0 items-center gap-1.5">
              <select
                name="organization_id"
                defaultValue={org.id}
                aria-label="Switch team"
                className="cl-input py-1 text-xs"
              >
                {allOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                <option value="personal">Personal workspace</option>
              </select>
              <SubmitButton className="cl-btn-outline px-2.5 py-1 text-xs" pendingLabel="…">
                Switch
              </SubmitButton>
            </form>
          ) : null}
        </div>

        <TeamNav />

        {error ? (
          <div
            role="alert"
            className="rounded-lg border px-3 py-2 text-xs"
            style={{
              borderColor: "rgba(168,54,43,0.4)",
              background: "rgba(168,54,43,0.08)",
              color: "#a8362b",
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Invite member — admins only */}
        {isAdmin ? (
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Invite a member
            </h2>
            <form action={inviteMember} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="organization_id" value={org.id} />
              <input
                type="email"
                name="email"
                required
                placeholder="inspector@example.com"
                aria-label="Email address to invite"
                className="cl-input flex-1"
              />
              <div className="flex items-center gap-1.5">
                <select
                  name="role"
                  defaultValue="member"
                  aria-label="Role for the invited person"
                  className="cl-input sm:w-40"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer (read-only)</option>
                </select>
                <HelpTip title="What each role can do" side="bottom">
                  {ROLE_HELP}
                </HelpTip>
              </div>
              <SubmitButton className="cl-btn-accent shrink-0" pendingLabel="Sending…">
                Send invite
              </SubmitButton>
            </form>
            <p className="mt-2 text-[11px] text-[var(--fg-subtle)]">
              We email the invite. The link that appears under Pending invites
              is a backup you can paste into Slack or a text.
            </p>
          </Card>
        ) : null}

        {isAdmin && invites && invites.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Pending invites · {invites.length}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {invites.map((inv) => {
                const link = `${siteUrl}/team/invite/${inv.token}`;
                return (
                  <li
                    key={inv.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--fg)]">
                          {inv.email}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">
                          {inv.role} · emailed · expires {formatDate(inv.expires_at)}
                        </p>
                        <p className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                          Backup link
                        </p>
                        <code className="mt-0.5 block break-all rounded bg-[#0a0d12]/60 px-2 py-1 text-[10px] text-[var(--fg-muted)]">
                          {link}
                        </code>
                      </div>
                      <form action={revokeInvite}>
                        <input type="hidden" name="invite_id" value={inv.id} />
                        <SubmitButton
                          className="rounded px-2 py-1.5 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[#a8362b] disabled:opacity-50"
                          pendingLabel="Revoking…"
                          confirmMessage={`Revoke the invite for ${inv.email}? The link they were sent will stop working.`}
                        >
                          Revoke
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Members · {(members ?? []).length}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {(members ?? []).map((m) => {
              const isMe = m.user_id === user.id;
              const isOnlyAdmin = m.role === "admin" && adminCount === 1;
              const memberProfile = m.profiles as unknown as {
                full_name: string;
              } | null;
              const displayName = memberProfile?.full_name ?? "this member";
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--fg)]">
                        {memberProfile?.full_name ?? "—"}
                        {isMe ? (
                          <span className="ml-1.5 text-[10px] font-normal text-[var(--fg-subtle)]">
                            (you)
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-[var(--fg-subtle)]">
                        {m.role} · joined {formatDate(m.joined_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isAdmin && !isOnlyAdmin ? (
                        // Explicit Save — a role change is a permissions
                        // change, so it must never fire on a stray scroll
                        // or arrow-key inside the select.
                        <form action={changeMemberRole} className="flex items-center gap-1">
                          <input type="hidden" name="member_id" value={m.id} />
                          <select
                            name="role"
                            defaultValue={m.role}
                            aria-label={`Role for ${displayName}`}
                            className="cl-input py-1 text-[11px]"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="viewer">Viewer (read-only)</option>
                          </select>
                          <SubmitButton
                            className="rounded border border-[var(--border-strong)] px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:border-[var(--primary)] hover:text-[var(--fg)] disabled:opacity-50"
                            pendingLabel="Saving…"
                          >
                            Save
                          </SubmitButton>
                        </form>
                      ) : null}

                      {isMe ? (
                        !isOnlyAdmin ? (
                          <form action={leaveOrganization}>
                            <input
                              type="hidden"
                              name="organization_id"
                              value={org.id}
                            />
                            <SubmitButton
                              className="rounded px-2 py-1.5 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[#a8362b] disabled:opacity-50"
                              pendingLabel="Leaving…"
                              confirmMessage={`Leave ${org.name}? You'll lose access to the team's inspections until someone invites you again.`}
                            >
                              Leave team
                            </SubmitButton>
                          </form>
                        ) : null
                      ) : isAdmin ? (
                        <form action={removeMember}>
                          <input type="hidden" name="member_id" value={m.id} />
                          <SubmitButton
                            className="rounded px-2 py-1.5 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[#a8362b] disabled:opacity-50"
                            pendingLabel="Removing…"
                            confirmMessage={`Remove ${displayName} from ${org.name}? They'll lose access to the team's inspections immediately.`}
                          >
                            Remove
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Transfer admin role — admins only, requires another member */}
        {isAdmin && transferTargets.length > 0 ? (
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Transfer admin role
            </h2>
            <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
              Promote another member to admin and step down to member in
              one operation.{" "}
              {adminCount === 1
                ? "You're the only admin right now, so this is the way to unblock leaving the team."
                : "Useful when handing off the team or rotating ownership."}
            </p>
            <form
              action={transferAdminRole}
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <input type="hidden" name="organization_id" value={org.id} />
              <select
                name="member_id"
                defaultValue=""
                required
                aria-label="Member to promote to admin"
                className="cl-input flex-1"
              >
                <option value="" disabled>
                  Select a member…
                </option>
                {transferTargets.map((m) => {
                  const p = m.profiles as unknown as {
                    full_name: string;
                  } | null;
                  return (
                    <option key={m.id} value={m.id}>
                      {p?.full_name ?? "—"} ({m.role})
                    </option>
                  );
                })}
              </select>
              <SubmitButton
                className="cl-btn-outline shrink-0"
                pendingLabel="Transferring…"
                confirmMessage="Promote the selected member to admin and step yourself down to member? You can be re-promoted by any admin later."
              >
                Transfer &amp; step down
              </SubmitButton>
            </form>
          </Card>
        ) : null}

        <Card>
          <form action={switchCurrentOrg} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--fg)]">
                Switch to personal workspace
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--fg-muted)]">
                Inspections you create in personal mode aren&apos;t visible
                to team members. You can switch back any time.
              </p>
            </div>
            <input type="hidden" name="organization_id" value="personal" />
            <SubmitButton className="cl-btn-outline shrink-0" pendingLabel="Switching…">
              Switch
            </SubmitButton>
          </form>
        </Card>

        {/* Danger zone — admins only */}
        {isAdmin ? (
          <section className="mt-2 flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "#a8362b" }}>
              Danger zone
            </h2>
            <div
              className="rounded-lg border px-4 py-4"
              style={{
                borderColor: "rgba(168,54,43,0.35)",
                background: "rgba(168,54,43,0.03)",
              }}
            >
              <DeleteTeamDialog
                orgId={org.id}
                orgName={org.name}
                action={deleteOrganization}
              />
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
