"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * Submit button with a real pending state for server-action forms.
 * Disables itself while the action runs (kills double-submit) and swaps
 * its label so the user sees the request is in flight.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "cl-btn-accent",
  confirmMessage,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  /** If set, the click asks for confirmation before the form submits. */
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
      onClick={(e) => {
        if (confirmMessage && !pending && !window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
