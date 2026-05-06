import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInWithPassword } from "./actions";
import { LoginForm } from "./login-form";
import { AuthLayout } from "@/components/auth-layout";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const params = await searchParams;
  if (user) {
    redirect(params.next ?? "/inspections");
  }

  return (
    <AuthLayout
      title="Welcome back"
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
