"use client";

import { useEffect, useState } from "react";

/**
 * App-wide toast. Any client component calls `showToast({...})`; the single
 * `<Toaster />` mounted in AppShell renders the stack. Event-bus based so
 * callers never need a provider or a hook — server-action result handling
 * stays a one-liner: `if (!res.ok) showToast({ kind: "error", message: res.error })`.
 */

export type ToastKind = "success" | "error" | "info";
export type ToastInput = { kind?: ToastKind; message: string; durationMs?: number };

type Toast = ToastInput & { id: number; kind: ToastKind };

const EVENT = "cl:toast";
let seq = 0;

export function showToast(input: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(EVENT, { detail: input }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastInput>).detail;
      const id = ++seq;
      const kind: ToastKind = detail.kind ?? "info";
      const duration = detail.durationMs ?? (kind === "error" ? 6000 : 3500);
      setToasts((prev) => [...prev, { ...detail, id, kind }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      // Above the mobile tab bar AND the iPhone home indicator.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className="pointer-events-auto max-w-sm rounded border px-4 py-3 text-sm shadow-lg"
          style={{
            background:
              t.kind === "error"
                ? "#fdecea"
                : t.kind === "success"
                  ? "#eaf5ea"
                  : "#ffffff",
            borderColor:
              t.kind === "error"
                ? "#b42318"
                : t.kind === "success"
                  ? "#2f6b2f"
                  : "var(--ink, #0f1518)",
            color: "#0f1518",
          }}
        >
          <div className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 text-xs">
              {t.kind === "error" ? "✕" : t.kind === "success" ? "✓" : "ⓘ"}
            </span>
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="ml-2 text-xs text-[var(--fg-muted)]"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
