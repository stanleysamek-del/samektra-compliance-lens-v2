import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signUp } from "./actions";
import { SignupForm } from "./signup-form";
import { AuthLayout } from "@/components/auth-layout";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sent?: string }>;
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
      title="Create your account"
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
