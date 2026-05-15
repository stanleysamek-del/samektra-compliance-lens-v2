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

  return (
    <AuthLayout
      eyebrow="§ 09 — Sign up"
      title="Create your account."
      subtitle="Free during the v2 staging build."
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
