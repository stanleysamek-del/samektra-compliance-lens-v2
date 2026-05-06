"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { PasswordInput } from "@/components/password-input";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  next?: string;
  error?: string;
  reset?: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cl-btn-primary w-full"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ action, next, error, reset }: Props) {
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />

      {reset ? (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "rgba(34,197,94,0.3)",
            background: "rgba(34,197,94,0.08)",
            color: "#86efac",
          }}
        >
          Password updated. Sign in with your new password.
        </p>
      ) : null}

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
        autoComplete="current-password"
        required
      />

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
        >
          Forgot password?
        </Link>
      </div>

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
        New here?{" "}
        <Link
          href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-[var(--fg)] transition hover:text-[var(--primary)]"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
