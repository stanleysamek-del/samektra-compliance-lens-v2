import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthLayout } from "@/components/auth-layout";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/format-date";
import { acceptInvite } from "@/app/team/actions";

type InvitePeek = {
  email: string;
  role: "admin" | "member" | "viewer";
  expires_at: string;
  accepted_at: string | null;
  org_name: string;
  org_slug: string;
};

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  // peek_invite() is an RPC granted to both anon and authenticated, so
  // this page works whether or not the user is logged in.
  const supabase = await createClient();
  const { data: peekRaw } = await supabase.rpc("peek_invite", { _token: token });
  const peek = peekRaw as InvitePeek | null;

  if (!peek) {
    return (
      <AuthLayout
        title="Invite not found"
        subtitle="The link may have expired, been revoked, or never existed."
      >
        <Link href="/login" className="cl-btn-outline w-full text-center">
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  if (peek.accepted_at) {
    return (
      <AuthLayout
        title="Invite already used"
        subtitle="This invite has been accepted already."
      >
        <Link href="/team" className="cl-btn-primary w-full text-center">
          Open your team
        </Link>
      </AuthLayout>
    );
  }

  if (new Date(peek.expires_at) < new Date()) {
    return (
      <AuthLayout
        title="Invite expired"
        subtitle="Ask the team admin to send a fresh link."
      >
        <Link href="/login" className="cl-btn-outline w-full text-center">
          Go to sign in
        </Link>
      </AuthLayout>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nextPath = `/team/invite/${token}`;
  const roleBlurb: Record<InvitePeek["role"], string> = {
    admin: "an admin — you can invite people, edit Chip's rules, and manage the team",
    member: "a member — you can create and edit inspections and work corrective actions",
    viewer: "a viewer — you can read inspections and download exports",
  };

  return (
    <AuthLayout
      title={`Join ${peek.org_name}`}
      subtitle={`You've been invited as ${roleBlurb[peek.role] ?? `a ${peek.role}`}.`}
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs text-[var(--fg-muted)]">
          Sent to{" "}
          <span className="font-medium text-[var(--fg)]">{peek.email}</span>
        </div>

        {error ? (
          <p
            className="rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: "rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.08)",
              color: "#fca5a5",
            }}
          >
            {error}
          </p>
        ) : null}

        {user ? (
          <form action={acceptInvite}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton className="cl-btn-primary w-full" pendingLabel="Joining…">
              Accept invite
            </SubmitButton>
          </form>
        ) : (
          <>
            {/* Most invitees are brand new to the app, so account creation
                is the primary path; existing users get the secondary link.
                Both carry ?next= so they land back here after auth. */}
            <Link
              href={`/signup?next=${encodeURIComponent(nextPath)}`}
              className="cl-btn-primary w-full text-center"
            >
              Create an account
            </Link>
            <Link
              href={`/login?next=${encodeURIComponent(nextPath)}`}
              className="cl-btn-outline w-full text-center"
            >
              Sign in
            </Link>
            <p className="text-center text-[11px] text-[var(--fg-subtle)]">
              Already have a Compliance Lens account? Use Sign in. Either way
              you&apos;ll come straight back here to accept.
            </p>
          </>
        )}

        <p className="text-center text-[11px] text-[var(--fg-subtle)]">
          Expires {formatDate(peek.expires_at)}
        </p>
      </div>
    </AuthLayout>
  );
}
