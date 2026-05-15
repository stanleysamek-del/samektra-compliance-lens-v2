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

  return (
    <AuthLayout
      eyebrow="§ 09 — Sign in"
      title="Welcome back."
      subtitle="Sign in to continue your inspection."
    >
      <LoginForm
        action={signInWithPassword}
        next={params.next}
        error={params.error}
        reset={params.reset === "1"}
      />
    </AuthLayout>
  );
}
