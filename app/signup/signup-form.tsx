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
      className="cl-btn-primary w-full"
    >
      {pending ? "Creating account…" : "Create account"}
    </button>
  );
}

export function SignupForm({ action, next, error, sent }: Props) {
  if (sent) {
    return (
      <div
        className="rounded-lg border px-4 py-4 text-sm"
        style={{
          borderColor: "rgba(34,197,94,0.3)",
          background: "rgba(34,197,94,0.08)",
          color: "#bbf7d0",
        }}
      >
        <p className="font-medium text-[var(--fg)]">Check your email.</p>
        <p className="mt-1.5 text-[var(--fg-muted)]">
          We&apos;ve sent a confirmation link to verify your address. Click it
          to finish creating your account, then come back and sign in.
        </p>
        <Link
          href="/login"
          className="mt-3 inline-block font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
        >
          Back to sign in →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />

      <div className="flex flex-col">
        <label htmlFor="email" className="cl-label">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="cl-input"
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
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.08)",
            color: "#fca5a5",
          }}
        >
          {error}
        </p>
      ) : null}

      <SubmitButton />

      <p className="text-center text-sm text-[var(--fg-muted)]">
        Already have an account?{" "}
        <Link
          href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-[var(--fg)] transition hover:text-[var(--primary)]"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
