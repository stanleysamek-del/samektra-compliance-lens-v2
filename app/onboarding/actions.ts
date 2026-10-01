"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const organization = String(formData.get("organization") ?? "").trim();

  if (!fullName) {
    redirect(`/onboarding?error=${encodeURIComponent("Enter your full name.")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Existing profile → this is an edit from /profile, not first run.
  const { data: existing } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      full_name: fullName,
      phone: phone || null,
      title: title || null,
      organization: organization || null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[saveProfile]", error);
    redirect(
      `/onboarding?error=${encodeURIComponent(
        "Couldn't save your profile. Check your connection and try again.",
      )}`,
    );
  }

  if (existing) redirect("/profile");

  // Land first-time users on /welcome so they immediately understand what
  // they can do, instead of being dropped onto an empty Home screen.
  redirect("/welcome");
}
