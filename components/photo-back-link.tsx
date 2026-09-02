"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * Context-aware back link for the photo page. A facility manager arrives
 * here from an assignment email (deep-linked to #finding-…) or from the
 * Actions board — for them "← Inspection" is the wrong way home. When the
 * URL hash targets a finding, or the referrer is the Actions board, show
 * "← Back to my actions" above the usual inspection link.
 *
 * Hash + referrer only exist in the browser, so this reads them through
 * useSyncExternalStore with a `false` server snapshot: SSR and hydration
 * render nothing, the first client render shows the link. No effect, no
 * setState, no hydration mismatch.
 */

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSnapshot(): boolean {
  try {
    if ((window.location.hash || "").startsWith("#finding-")) return true;
    const ref = document.referrer || "";
    if (!ref) return false;
    return new URL(ref).pathname.startsWith("/actions");
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function PhotoBackLink() {
  const fromActions = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!fromActions) return null;

  return (
    <Link
      href="/actions?who=me&status=active"
      className="mb-2 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition"
      style={{
        borderColor: "var(--gold)",
        background: "rgba(200,155,60,0.10)",
        color: "var(--ink)",
        textDecoration: "none",
      }}
    >
      ← Back to my actions
    </Link>
  );
}
