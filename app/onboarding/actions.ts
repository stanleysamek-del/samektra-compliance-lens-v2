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
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  // Land first-time users on /welcome so they immediately understand what
  // they can do, instead of being dropped onto an empty Home screen.
  redirect("/welcome");
}
