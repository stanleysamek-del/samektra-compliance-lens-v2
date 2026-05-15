import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { getCurrentOrg, listMyOrganizations } from "@/lib/org/current";
import {
  createOrganization,
  inviteMember,
  revokeInvite,
  changeMemberRole,
  removeMember,
  leaveOrganization,
  switchCurrentOrg,
} from "./actions";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://compliancelens.app";

export default async function TeamPage({
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

  // === No team yet — show create form ===
  if (allOrgs.length === 0) {
    return (
      <AppShell user={userShell}>
        <div className="flex flex-col gap-5">
          <div className="px-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Team
            </h1>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
              Create a team to share inspections with coworkers.
            </p>
          </div>

          <Card>
            <h2 className="text-base font-semibold text-[var(--fg)]">
              Create your team
            </h2>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              You&apos;ll be the first admin. Add other inspectors after.
            </p>
            <form action={createOrganization} className="mt-4 flex flex-col gap-3">
              <label className="cl-label" htmlFor="name">
                Team name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Acme Inspection Services"
                className="cl-input"
              />
              {error ? (
                <p className="text-xs" style={{ color: "#fca5a5" }}>
                  {error}
                </p>
              ) : null}
              <button type="submit" className="cl-btn-primary self-start">
                Create team
              </button>
            </form>
          </Card>

          <Card variant="tinted-teal">
            <p className="text-xs text-[var(--fg-muted)]">
              <span className="font-medium text-[var(--fg)]">
                Already invited?
              </span>{" "}
              Open the invite link from your email — you&apos;ll be added
              automatically.
            </p>
          </Card>
        </div>
      </AppShell>
    );
  }

  // === User is in at least one org but cookie doesn't point at any — switch ===
  if (!currentOrg && allOrgs.length > 0) {
    return (
      <AppShell user={userShell}>
        <div className="flex flex-col gap-5">
          <div className="px-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Choose a team
            </h1>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">
              You&apos;re a member of {allOrgs.length}{" "}
              {allOrgs.length === 1 ? "team" : "teams"}.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {allOrgs.map((o) => (
              <li key={o.id}>
                <form action={switchCurrentOrg}>
                  <input type="hidden" name="organization_id" value={o.id} />
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-left transition hover:border-[var(--primary)]"
                  >
                    <span className="font-medium text-[var(--fg)]">{o.name}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--fg-subtle)]">
                      {o.role}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <Card>
            <form action={createOrganization} className="flex flex-col gap-2">
              <label className="cl-label" htmlFor="name">
                Or create another team
              </label>
              <div className="flex gap-2">
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  placeholder="Team name"
                  className="cl-input"
                />
                <button type="submit" className="cl-btn-outline shrink-0">
                  Create
                </button>
              </div>
            </form>
          </Card>
        </div>
      </AppShell>
    );
  }

  // === In a team — show members + invites + admin tools ===
  // currentOrg is guaranteed non-null here.
  const org = currentOrg!;
  const isAdmin = org.role === "admin";

  // Members + invites
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

  return (
    <AppShell user={userShell}>
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
              Current team
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--fg)]">
              {org.name}
            </h1>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
              You are an <span className="font-medium text-[var(--fg)]">{org.role}</span> ·{" "}
              {(members ?? []).length}{" "}
              {(members ?? []).length === 1 ? "member" : "members"}
            </p>
          </div>

          {/* Org switcher when user has multiple teams */}
          {allOrgs.length > 1 ? (
            <form action={switchCurrentOrg}>
              <select
                name="organization_id"
                defaultValue={org.id}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="cl-input py-1 text-xs"
              >
                {allOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                <option value="personal">Personal workspace</option>
              </select>
              {/* No-JS fallback: submit button */}
              <noscript>
                <button type="submit" className="cl-btn-outline">
                  Switch
                </button>
              </noscript>
            </form>
          ) : null}
        </div>

        {error ? (
          <div
            className="rounded-lg border px-3 py-2 text-xs"
            style={{
              borderColor: "rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.08)",
              color: "#fca5a5",
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
            <form
              action={inviteMember}
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <input
                type="hidden"
                name="organization_id"
                value={org.id}
              />
              <input
                type="email"
                name="email"
                required
                placeholder="inspector@example.com"
                className="cl-input flex-1"
              />
              <select name="role" defaultValue="member" className="cl-input sm:w-32">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="cl-btn-accent shrink-0">
                Send invite
              </button>
            </form>
            <p className="mt-2 text-[11px] text-[var(--fg-subtle)]">
              You&apos;ll get a shareable link after sending. Forward it manually
              for now — automated email delivery comes in a later iteration.
            </p>
          </Card>
        ) : null}

        {/* Pending invites */}
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
                          {inv.role} · expires{" "}
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </p>
                        <code className="mt-1.5 block break-all rounded bg-[#0a0d12]/60 px-2 py-1 text-[10px] text-[var(--fg-muted)]">
                          {link}
                        </code>
                      </div>
                      <form action={revokeInvite}>
                        <input type="hidden" name="invite_id" value={inv.id} />
                        <button
                          type="submit"
                          className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[#fca5a5]"
                        >
                          Revoke
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Members */}
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
                        {m.role} · joined{" "}
                        {new Date(m.joined_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {/* Role toggle — admin only, can't demote the last admin */}
                      {isAdmin && !isOnlyAdmin ? (
                        <form action={changeMemberRole}>
                          <input type="hidden" name="member_id" value={m.id} />
                          <select
                            name="role"
                            defaultValue={m.role}
                            onChange={(e) =>
                              e.currentTarget.form?.requestSubmit()
                            }
                            className="cl-input py-1 text-[11px]"
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        </form>
                      ) : null}

                      {/* Leave / Remove */}
                      {isMe ? (
                        !isOnlyAdmin ? (
                          <form action={leaveOrganization}>
                            <input
                              type="hidden"
                              name="organization_id"
                              value={org.id}
                            />
                            <button
                              type="submit"
                              className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[#fca5a5]"
                            >
                              Leave team
                            </button>
                          </form>
                        ) : null
                      ) : isAdmin ? (
                        <form action={removeMember}>
                          <input type="hidden" name="member_id" value={m.id} />
                          <button
                            type="submit"
                            className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[#fca5a5]"
                          >
                            Remove
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Personal workspace toggle */}
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
            <button type="submit" className="cl-btn-outline shrink-0">
              Switch
            </button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
