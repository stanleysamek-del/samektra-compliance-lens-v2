"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const SIGN_UP_TIMEOUT_MS = 15_000;

function isRedirectThrow(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const next = String(formData.get("next") ?? "");

  const buildRedirect = (qs: string) =>
    `/signup?${qs}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  const fail = (message: string): never => {
    redirect(buildRedirect(`error=${encodeURIComponent(message)}`));
  };

  if (!email || !email.includes("@")) {
    fail("Enter a valid email address.");
  }
  if (password.length < 8) {
    fail("Password must be at least 8 characters.");
  }
  if (password !== confirm) {
    fail("Passwords don't match.");
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("[signup] Missing Supabase env vars on server");
    fail("Server configuration error. Please contact support.");
  }

  let data:
    | Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["signUp"]>>["data"]
    | null = null;

  try {
    const supabase = await createClient();
    const headerList = await headers();
    const origin = headerList.get("origin") ?? `https://${headerList.get("host")}`;
    const callbackUrl = new URL("/auth/callback", origin);
    if (next) callbackUrl.searchParams.set("next", next);

    const signUpPromise = supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    const result = await Promise.race([
      signUpPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("sign-up-timeout")),
          SIGN_UP_TIMEOUT_MS,
        ),
      ),
    ]);

    if (result.error) {
      fail(result.error.message);
    }
    data = result.data;
  } catch (err) {
    if (isRedirectThrow(err)) throw err;

    const raw = err instanceof Error ? err.message : String(err);
    console.error("[signup] signUp failed:", raw);

    let message = raw;
    if (raw === "sign-up-timeout") {
      message = "Sign-up is taking too long. Please try again in a moment.";
    } else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(raw)) {
      message = "Can't reach the auth service right now. Please try again shortly.";
    }
    fail(message);
  }

  // If email confirmation is disabled in Supabase, signUp also signs the user in.
  if (data?.session) {
    redirect(next || "/onboarding");
  }

  // Otherwise: confirmation email sent, ask user to check inbox.
  redirect(buildRedirect("sent=1"));
}
