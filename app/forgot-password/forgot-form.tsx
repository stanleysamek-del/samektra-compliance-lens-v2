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
  notFoundEmail?: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <EditorialPrimaryButton pending={pending}>
      {pending ? "Sending" : "Send reset link"}
    </EditorialPrimaryButton>
  );
}

export function ForgotPasswordForm({ action, error, sent, notFoundEmail }: Props) {
  if (notFoundEmail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EditorialErrorBanner
          message={`No account found for ${notFoundEmail}. Double-check the address, or create an account to get started.`}
        />
        <a
          href="/signup"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            width: "100%",
            padding: "13px 22px",
            fontFamily: "var(--font-geist-sans)",
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "0.01em",
            border: "1px solid #0f1518",
            background: "#0f1518",
            color: "#ece8da",
            textDecoration: "none",
          }}
        >
          Create an account
          <span
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontStyle: "italic",
              color: "#c89b3c",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            →
          </span>
        </a>
        <EditorialFootnote>
          Try a{" "}
          <EditorialSerifLink href="/forgot-password">
            different email
          </EditorialSerifLink>{" "}
          · Already have one?{" "}
          <EditorialSerifLink href="/login">Sign in</EditorialSerifLink>
        </EditorialFootnote>
      </div>
    );
  }

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
