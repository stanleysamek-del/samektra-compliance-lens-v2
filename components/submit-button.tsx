"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { confirmDialog } from "@/components/ui/confirm-dialog";

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
  confirmTitle,
  confirmLabel,
  confirmTone = "default",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  className?: string;
  /**
   * If set, the click asks for confirmation (app dialog) before the form
   * submits. Shown as the dialog body under `confirmTitle`, or as the
   * title when no title is given.
   */
  confirmMessage?: string;
  confirmTitle?: string;
  confirmLabel?: string;
  /** "danger" for destructive actions — red confirm, focus on Cancel. */
  confirmTone?: "default" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={className}
      onClick={async (e) => {
        if (!confirmMessage || pending) return;
        e.preventDefault();
        const button = e.currentTarget;
        const ok = await confirmDialog({
          title: confirmTitle ?? confirmMessage,
          message: confirmTitle ? confirmMessage : undefined,
          confirmLabel,
          tone: confirmTone,
        });
        // requestSubmit(button) keeps the button's name/value and runs
        // the form action exactly like the original click would have.
        if (ok) button.form?.requestSubmit(button);
      }}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
