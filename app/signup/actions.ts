"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const next = String(formData.get("next") ?? "");

  const buildRedirect = (qs: string) =>
    `/signup?${qs}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  if (!email || !email.includes("@")) {
    redirect(buildRedirect(`error=${encodeURIComponent("Enter a valid email address.")}`));
  }
  if (password.length < 8) {
    redirect(buildRedirect(`error=${encodeURIComponent("Password must be at least 8 characters.")}`));
  }
  if (password !== confirm) {
    redirect(buildRedirect(`error=${encodeURIComponent("Passwords don't match.")}`));
  }

  const supabase = await createClient();
  const headerList = await headers();
  const origin = headerList.get("origin") ?? `https://${headerList.get("host")}`;
  const callbackUrl = new URL("/auth/callback", origin);
  if (next) callbackUrl.searchParams.set("next", next);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl.toString() },
  });

  if (error) {
    redirect(buildRedirect(`error=${encodeURIComponent(error.message)}`));
  }

  // If email confirmation is disabled in Supabase, signUp also signs the user in.
  if (data.session) {
    redirect(next || "/onboarding");
  }

  // Otherwise: confirmation email sent, ask user to check inbox.
  redirect(buildRedirect("sent=1"));
}
