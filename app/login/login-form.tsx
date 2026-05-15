"use client";

import { useFormStatus } from "react-dom";
import {
  EditorialTextInput,
  EditorialPasswordInput,
  EditorialPrimaryButton,
  EditorialErrorBanner,
  EditorialSuccessBanner,
  EditorialFootnote,
  EditorialMonoLink,
  EditorialSerifLink,
} from "@/components/auth-editorial-inputs";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  next?: string;
  error?: string;
  reset?: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <EditorialPrimaryButton pending={pending}>
      {pending ? "Signing in" : "Sign in"}
    </EditorialPrimaryButton>
  );
}

export function LoginForm({ action, next, error, reset }: Props) {
  return (
    <form
      action={action}
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <input type="hidden" name="next" value={next ?? ""} />

      {reset ? (
        <EditorialSuccessBanner message="Password updated. Sign in with your new password." />
      ) : null}

      <EditorialTextInput
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />

      <EditorialPasswordInput
        label="Password"
        name="password"
        autoComplete="current-password"
        required
      />

      {error ? <EditorialErrorBanner message={error} /> : null}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <EditorialMonoLink href="/forgot-password">
          Forgot password?
        </EditorialMonoLink>
      </div>

      <SubmitButton />

      <EditorialFootnote>
        New here?{" "}
        <EditorialSerifLink
          href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
        >
          Create an account
        </EditorialSerifLink>
      </EditorialFootnote>
    </form>
  );
}
