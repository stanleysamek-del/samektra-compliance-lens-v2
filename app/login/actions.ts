"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Next.js implements `redirect()` by throwing a sentinel error whose `digest`
 * starts with "NEXT_REDIRECT". We must NOT swallow that in our catch block,
 * or the redirect won't happen. We don't import the internal helper because
 * its path moves between Next minor versions — we check the digest ourselves.
 */
function isRedirectThrow(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

const SIGN_IN_TIMEOUT_MS = 15_000;

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const fail = (message: string): never => {
    redirect(
      `/login?error=${encodeURIComponent(message)}${
        next ? `&next=${encodeURIComponent(next)}` : ""
      }`,
    );
  };

  if (!email || !password) {
    fail("Enter your email and password.");
  }

  // Belt-and-suspenders: surface missing env vars as a clear error instead
  // of an opaque "fetch failed" from the Supabase client.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("[login] Missing Supabase env vars on server");
    fail("Server configuration error. Please contact support.");
  }

  try {
    const supabase = await createClient();
    const signInPromise = supabase.auth.signInWithPassword({ email, password });

    // Race against a generous timeout so we return a clean error rather
    // than letting Vercel's gateway time out the request at 15s.
    const result = await Promise.race([
      signInPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("sign-in-timeout")),
          SIGN_IN_TIMEOUT_MS,
        ),
      ),
    ]);

    if (result.error) {
      fail(result.error.message);
    }
  } catch (err) {
    // `redirect()` throws a special internal error to short-circuit — we
    // must rethrow it so Next.js can perform the redirect.
    if (isRedirectThrow(err)) throw err;

    const raw = err instanceof Error ? err.message : String(err);
    console.error("[login] signInWithPassword failed:", raw);

    // Map common low-level network errors to a friendlier message.
    let message = raw;
    if (raw === "sign-in-timeout") {
      message = "Sign-in is taking too long. Please try again in a moment.";
    } else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(raw)) {
      message = "Can't reach the auth service right now. Please try again shortly.";
    }
    fail(message);
  }

  redirect(next || "/inspections");
}
