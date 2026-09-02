import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserOrNullFast } from "@/lib/supabase/get-user-fast";
import { signInWithPassword } from "./actions";
import { LoginForm } from "./login-form";
import { AuthLayout } from "@/components/auth-layout";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  // Public page — if Supabase is slow, just render the form instead of
  // hanging the request. Loses the "already signed in, redirect away"
  // shortcut on outages, which is fine.
  const user = await getUserOrNullFast();

  const params = await searchParams;
  if (user) {
    redirect(params.next ?? "/inspections");
  }

  // An invitee arriving from a /team/invite/<token> link is usually NOT an
  // existing user — "Welcome back" reads as "wrong door". Reframe the page
  // around the invite and make account creation the obvious path.
  const isInvite = Boolean(params.next?.startsWith("/team/invite/"));

  return (
    <AuthLayout
      eyebrow={isInvite ? "§ 09 — Team invite" : "§ 09 — Sign in"}
      title={isInvite ? "Join your team on Compliance Lens" : "Welcome back."}
      subtitle={
        isInvite
          ? "Sign in, or create a free account, to accept the invitation."
          : "Sign in to continue your inspection."
      }
    >
      {isInvite ? (
        <div
          className="mb-5 flex flex-col gap-2 border px-3 py-3"
          style={{
            borderColor: "#c89b3c",
            background: "rgba(200,155,60,0.08)",
          }}
        >
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "#0f1518" }}>
            <strong>New to Compliance Lens?</strong> Create a free account
            first — you&apos;ll land right back on the invite.
          </p>
          <Link
            href={`/signup?next=${encodeURIComponent(params.next ?? "")}`}
            className="inline-block self-start px-3 py-1.5 text-xs font-semibold"
            style={{
              background: "#c89b3c",
              color: "#0f1518",
              border: "1px solid #c89b3c",
              textDecoration: "none",
            }}
          >
            Create a free account →
          </Link>
        </div>
      ) : null}
      <LoginForm
        action={signInWithPassword}
        next={params.next}
        error={params.error}
        reset={params.reset === "1"}
      />
    </AuthLayout>
  );
}
