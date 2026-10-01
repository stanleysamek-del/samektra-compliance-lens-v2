"use client";

import { useEffect, useRef, useState } from "react";

/**
 * App-wide confirmation dialog — replaces window.confirm().
 *
 *   if (!(await confirmDialog({ title: "Delete this finding?", tone: "danger" }))) return;
 *
 * Same event-bus shape as showToast(): any client component can call it,
 * and the single <ConfirmHost /> in AppShell renders it. Built on the
 * native <dialog> element, so focus is trapped, Esc cancels, and the rest
 * of the page is inert while it's open. Pages without the host (e.g. auth
 * screens) fall back to window.confirm, so a call never silently no-ops.
 */

export type ConfirmOptions = {
  title: string;
  /** Supporting detail under the title. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" renders the confirm button red — use for deletes. */
  tone?: "default" | "danger";
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

const EVENT = "cl:confirm";
let hostCount = 0;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (hostCount === 0) {
    const text = options.message ? `${options.title}\n\n${options.message}` : options.title;
    return Promise.resolve(window.confirm(text));
  }
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent<Request>(EVENT, { detail: { ...options, resolve } }),
    );
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The element focused before opening, so focus returns there on close.
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    hostCount += 1;
    function onRequest(e: Event) {
      const detail = (e as CustomEvent<Request>).detail;
      // A second request while one is open: settle the old one as cancel.
      setRequest((prev) => {
        prev?.resolve(false);
        return detail;
      });
    }
    window.addEventListener(EVENT, onRequest);
    return () => {
      hostCount -= 1;
      window.removeEventListener(EVENT, onRequest);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!request || !dialog) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    // Destructive actions default focus to Cancel so a stray Enter is safe.
    (request.tone === "danger" ? cancelRef : confirmRef).current?.focus();
  }, [request]);

  function settle(ok: boolean) {
    request?.resolve(ok);
    setRequest(null);
    dialogRef.current?.close();
    returnFocus.current?.focus?.();
  }

  const danger = request?.tone === "danger";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cl-confirm-title"
      aria-describedby={request?.message ? "cl-confirm-message" : undefined}
      // Esc fires "cancel" — treat it as No.
      onCancel={(e) => {
        e.preventDefault();
        settle(false);
      }}
      // Click on the backdrop (the dialog element itself, outside the panel).
      onClick={(e) => {
        if (e.target === dialogRef.current) settle(false);
      }}
      className="cl-dialog"
    >
      {request ? (
        <div className="cl-dialog-panel">
          <h2 id="cl-confirm-title" className="text-lg font-semibold text-[var(--ink)]">
            {request.title}
          </h2>
          {request.message ? (
            <p id="cl-confirm-message" className="mt-2 whitespace-pre-line text-sm text-[var(--fg-muted)]">
              {request.message}
            </p>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              className="cl-btn-outline"
              onClick={() => settle(false)}
            >
              {request.cancelLabel ?? "Cancel"}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={danger ? "cl-btn-danger" : "cl-btn-primary"}
              onClick={() => settle(true)}
            >
              {request.confirmLabel ?? (danger ? "Delete" : "Confirm")}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
