import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";
import { ProfileForm } from "./profile-form";
import { AuthLayout } from "@/components/auth-layout";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, title, organization")
    .eq("user_id", user.id)
    .maybeSingle();

  const params = await searchParams;

  return (
    <AuthLayout
      title={profile ? "Update your profile" : "Tell us about you"}
      subtitle={
        profile
          ? "Edit the details that appear on inspection reports."
          : "One quick step before your first inspection. These details show up on signed reports."
      }
    >
      <ProfileForm
        action={saveProfile}
        email={user.email ?? ""}
        error={params.error}
        initial={profile ?? undefined}
      />
    </AuthLayout>
  );
}
