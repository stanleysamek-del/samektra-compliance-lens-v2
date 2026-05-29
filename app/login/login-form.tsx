"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
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

// sessionStorage flag written at sign-in when "remember me" is off.
// The SessionGuard component (mounted in app-shell) reads this and
// signs the user out when the tab/window closes.
export const SESSION_ONLY_KEY = "cl_session_only";

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
  const [remember, setRemember] = useState(true);

  // Write/clear the session-only flag before the server action fires.
  function handleSubmit() {
    if (!remember) {
      sessionStorage.setItem(SESSION_ONLY_KEY, "1");
    } else {
      sessionStorage.removeItem(SESSION_ONLY_KEY);
    }
  }

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
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

      {/* Remember me + Forgot password row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
          <span
            role="checkbox"
            aria-checked={remember}
            tabIndex={0}
            onClick={() => setRemember((v) => !v)}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setRemember((v) => !v); } }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              flexShrink: 0,
              border: `1px solid ${remember ? "#0f1518" : "#8a9097"}`,
              background: remember ? "#0f1518" : "transparent",
              transition: "background 0.15s ease, border-color 0.15s ease",
              cursor: "pointer",
            }}
          >
            {remember && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                <path d="M1 4l3 3 5-6" stroke="#ece8da" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: remember ? "#0f1518" : "#8a9097",
              transition: "color 0.15s ease",
            }}
          >
            Remember me
          </span>
        </label>

        <EditorialMonoLink href="/forgot-password">
          Forgot password?
        </EditorialMonoLink>
      </div>

      <SubmitButton />

      <EditorialFootnote>
        New here?{" "}
        <EditorialSerifLink href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
          Create an account
        </EditorialSerifLink>
      </EditorialFootnote>
    </form>
  );
}
