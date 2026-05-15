"use client";

import { useFormStatus } from "react-dom";
import {
  EditorialTextInput,
  EditorialPrimaryButton,
  EditorialErrorBanner,
  EditorialSuccessBanner,
  EditorialFootnote,
  EditorialSerifLink,
} from "@/components/auth-editorial-inputs";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  sent?: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <EditorialPrimaryButton pending={pending}>
      {pending ? "Sending" : "Send reset link"}
    </EditorialPrimaryButton>
  );
}

export function ForgotPasswordForm({ action, error, sent }: Props) {
  if (sent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EditorialSuccessBanner message="Check your email. If an account exists for that address, we've sent a reset link. The link expires in 1 hour." />
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
      <EditorialTextInput
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />

      {error ? <EditorialErrorBanner message={error} /> : null}

      <SubmitButton />

      <EditorialFootnote>
        Remembered it?{" "}
        <EditorialSerifLink href="/login">Sign in</EditorialSerifLink>
      </EditorialFootnote>
    </form>
  );
}
