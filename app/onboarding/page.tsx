import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";
import { ProfileForm } from "./profile-form";

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Samektra · Compliance Lens v2
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {profile ? "Update your profile" : "Tell us about you"}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {profile
              ? "Edit the details that appear on inspection reports."
              : "One quick step before your first inspection. These details show up on signed reports."}
          </p>
        </div>

        <ProfileForm
          action={saveProfile}
          email={user.email ?? ""}
          error={params.error}
          initial={profile ?? undefined}
        />
      </div>
    </div>
  );
}
