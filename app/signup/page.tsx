import { redirect } from "next/navigation";
import { getUserOrNullFast } from "@/lib/supabase/get-user-fast";
import { signUp } from "./actions";
import { SignupForm } from "./signup-form";
import { AuthLayout } from "@/components/auth-layout";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sent?: string }>;
}) {
  // Public page — render even if Supabase is slow so we never time out
  // the request at Vercel's gateway.
  const user = await getUserOrNullFast();

  const params = await searchParams;
  if (user) {
    redirect(params.next ?? "/inspections");
  }

  // Arriving from a team invite link: frame the page around joining.
  const isInvite = Boolean(params.next?.startsWith("/team/invite/"));

  return (
    <AuthLayout
      eyebrow={isInvite ? "§ 09 — Team invite" : "§ 09 — Sign up"}
      title={isInvite ? "Join your team on Compliance Lens" : "Create your account."}
      subtitle={
        isInvite
          ? "Create a free account to accept the invitation. Already have one? Sign in below."
          : "Free tier, free forever. No credit card."
      }
    >
      <SignupForm
        action={signUp}
        next={params.next}
        error={params.error}
        sent={params.sent === "1"}
      />
    </AuthLayout>
  );
}
