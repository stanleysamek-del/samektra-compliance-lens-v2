"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { PasswordInput } from "@/components/password-input";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  next?: string;
  error?: string;
  sent?: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {pending ? "Creating account..." : "Create account"}
    </button>
  );
}

export function SignupForm({ action, next, error, sent }: Props) {
  if (sent) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
        <p className="font-medium">Check your email.</p>
        <p className="mt-1">
          We&apos;ve sent a confirmation link to verify your address. Click it to finish creating your account, then come back and sign in.
        </p>
        <Link
          href="/login"
          className="mt-3 inline-block font-medium underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />

      <div className="flex flex-col gap-2">
        <label
          htmlFor="email"
          className="text-sm font-medium text-zinc-900 dark:text-zinc-50"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="h-11 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-600"
        />
      </div>

      <PasswordInput
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Minimum 8 characters."
      />

      <PasswordInput
        label="Confirm password"
        name="confirm_password"
        autoComplete="new-password"
        required
        minLength={8}
      />

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <SubmitButton />

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link
          href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-50"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
