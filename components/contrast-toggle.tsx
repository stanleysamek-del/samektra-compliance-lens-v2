"use client";

import { useSyncExternalStore } from "react";

/**
 * ☀ High-sun mode: maximum contrast for outdoor glare (tokens in
 * globals.css under [data-contrast="high"]). A per-device preference in
 * localStorage, applied before first paint by the inline script in the
 * root layout. Devices set to "increase contrast" start in high-sun mode;
 * turning it off here records "normal" so that choice sticks.
 */

const KEY = "cl-contrast";
const EVENT = "cl:contrast";

function isHigh(): boolean {
  const el = document.documentElement;
  if (el.dataset.contrast === "high") return true;
  if (el.dataset.contrast === "normal") return false;
  return window.matchMedia?.("(prefers-contrast: more)").matches ?? false;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  const mq = window.matchMedia?.("(prefers-contrast: more)");
  mq?.addEventListener?.("change", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    mq?.removeEventListener?.("change", cb);
  };
}

export function ContrastToggle() {
  // Server render: unknown → show the "off" state; the real value arrives
  // on hydration (the page itself is already styled by the head script).
  const high = useSyncExternalStore(subscribe, isHigh, () => false);

  function toggle() {
    const next = high ? "normal" : "high";
    document.documentElement.dataset.contrast = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode / blocked storage: still applies for this page view.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={high}
      aria-label="High-sun mode (maximum contrast)"
      title={high ? "High-sun mode is on — tap for normal contrast" : "High-sun mode: maximum contrast for bright light"}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition ${
        high
          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
          : "border-[var(--rule-strong)] bg-[var(--bg-elevated)] text-[var(--fg-muted)] hover:border-[var(--primary)] hover:text-[var(--fg)]"
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4" fill={high ? "currentColor" : "none"} />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
      </svg>
    </button>
  );
}
