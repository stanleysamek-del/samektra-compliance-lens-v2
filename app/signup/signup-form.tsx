"use client";

import { useFormStatus } from "react-dom";
import {
  EditorialTextInput,
  EditorialPasswordInput,
  EditorialPrimaryButton,
  EditorialErrorBanner,
  EditorialSuccessBanner,
  EditorialFootnote,
  EditorialSerifLink,
} from "@/components/auth-editorial-inputs";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  next?: string;
  error?: string;
  sent?: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <EditorialPrimaryButton pending={pending}>
      {pending ? "Creating account" : "Create account"}
    </EditorialPrimaryButton>
  );
}

export function SignupForm({ action, next, error, sent }: Props) {
  if (sent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EditorialSuccessBanner message="Check your email. We've sent a confirmation link to verify your address. Click it to finish creating your account, then come back and sign in." />
        <EditorialFootnote>
          Back to{" "}
          <EditorialSerifLink href="/login">Sign in</EditorialSerifLink>
        </EditorialFootnote>
      </div>
    );
  }

  return (
    <form
      action={action}
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <input type="hidden" name="next" value={next ?? ""} />

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
        autoComplete="new-password"
        required
        minLength={8}
        hint="Minimum 8 characters."
      />

      <EditorialPasswordInput
        label="Confirm password"
        name="confirm_password"
        autoComplete="new-password"
        required
        minLength={8}
      />

      {error ? <EditorialErrorBanner message={error} /> : null}

      <SubmitButton />

      <EditorialFootnote>
        Already have an account?{" "}
        <EditorialSerifLink
          href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
        >
          Sign in
        </EditorialSerifLink>
      </EditorialFootnote>
    </form>
  );
}
