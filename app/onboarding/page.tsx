import Link from "next/link";
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
  // A profile already exists → the user came here from /profile to edit,
  // not from first-run. Give them a way back so the page isn't a dead end.
  const isEditing = Boolean(profile);

  return (
    <AuthLayout
      eyebrow={isEditing ? "§ Profile — Edit" : "§ Profile — Setup"}
      title={isEditing ? "Update your profile" : "Tell us about you"}
      subtitle={
        isEditing
          ? "Edit the details that appear on inspection reports."
          : "One quick step before your first inspection. These details show up on signed reports."
      }
    >
      {isEditing ? (
        <Link
          href="/profile"
          className="mb-4 inline-block"
          style={{
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#5f6b72",
            textDecoration: "none",
          }}
        >
          ← Back to profile
        </Link>
      ) : null}
      <ProfileForm
        action={saveProfile}
        email={user.email ?? ""}
        error={params.error}
        initial={profile ?? undefined}
        submitLabel={isEditing ? "Save changes" : "Save and continue"}
      />
    </AuthLayout>
  );
}
