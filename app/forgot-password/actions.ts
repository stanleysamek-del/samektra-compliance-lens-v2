"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    redirect(`/forgot-password?error=${encodeURIComponent("Enter a valid email address.")}`);
  }

  const supabase = await createClient();

  // Tell the visitor when no account exists for that email and point them to
  // sign-up (product decision — note this trades away account-enumeration
  // protection). Backed by the public.email_exists() SECURITY DEFINER RPC
  // (migration 0018). If the RPC is missing/errors, fail open and proceed to
  // the normal "sent" flow rather than blocking a legitimate reset.
  const { data: exists, error: lookupError } = await supabase.rpc(
    "email_exists",
    { p_email: email },
  );
  if (!lookupError && exists === false) {
    redirect(`/forgot-password?notfound=${encodeURIComponent(email)}`);
  }

  const headerList = await headers();
  const origin = headerList.get("origin") ?? `https://${headerList.get("host")}`;

  // Send reset email with redirect to /auth/callback?next=/reset-password.
  // The callback exchanges the recovery code for a session, then bounces to /reset-password.
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", "/reset-password");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl.toString(),
  });

  if (error) {
    const message =
      error.message?.trim() ||
      "Couldn't send the reset email. Please try again.";
    redirect(`/forgot-password?error=${encodeURIComponent(message)}`);
  }

  redirect(`/forgot-password?sent=1`);
}
