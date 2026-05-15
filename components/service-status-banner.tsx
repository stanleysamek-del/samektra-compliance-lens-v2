"use client";

import { useEffect, useState } from "react";

type Health =
  | { kind: "unknown" }
  | { kind: "up"; latencyMs: number }
  | { kind: "slow"; latencyMs: number }
  | { kind: "down" };

const POLL_INTERVAL_MS = 60_000; // 60s
const FIRST_PROBE_DELAY_MS = 2_000; // wait 2s after mount so we don't pile on with the page load

/**
 * Polls /api/health every minute and shows a small banner at the top of the
 * viewport when Supabase looks degraded. Renders nothing in the happy path.
 *
 * The banner is dismissible per-session — once the user X's it out, we stay
 * quiet until the page reloads. Keeps us from being annoying during a known
 * outage they're already aware of.
 */
export function ServiceStatusBanner() {
  const [health, setHealth] = useState<Health>({ kind: "unknown" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setHealth({ kind: "down" });
          return;
        }
        const json = (await res.json()) as {
          ok?: boolean;
          latencyMs?: number;
          supabase?: "up" | "slow" | "down";
        };
        if (cancelled) return;
        if (json.supabase === "up") {
          setHealth({ kind: "up", latencyMs: json.latencyMs ?? 0 });
        } else if (json.supabase === "slow") {
          setHealth({ kind: "slow", latencyMs: json.latencyMs ?? 0 });
        } else {
          setHealth({ kind: "down" });
        }
      } catch {
        if (!cancelled) setHealth({ kind: "down" });
      }
    }

    const startTimer = setTimeout(probe, FIRST_PROBE_DELAY_MS);
    const pollTimer = setInterval(probe, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      clearInterval(pollTimer);
    };
  }, []);

  if (dismissed) return null;
  if (health.kind === "unknown" || health.kind === "up") return null;

  const isDown = health.kind === "down";
  const message = isDown
    ? "Service is unreachable right now. Some actions may fail — we're retrying automatically."
    : `Service is responding slowly (${health.kind === "slow" ? `${health.latencyMs}ms` : ""}). Saving may take longer than usual.`;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b px-4 py-2 text-xs font-medium"
      style={{
        borderColor: isDown ? "rgba(168,54,43,0.45)" : "rgba(184,118,42,0.45)",
        background: isDown ? "rgba(168,54,43,0.10)" : "rgba(184,118,42,0.10)",
        color: isDown ? "#a8362b" : "#b8762a",
        fontFamily: "var(--font-jetbrains-mono)",
        letterSpacing: "0.04em",
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{
            background: isDown ? "#a8362b" : "#b8762a",
          }}
        />
        <span className="truncate">{message}</span>
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline"
        aria-label="Dismiss service status banner"
      >
        Dismiss
      </button>
    </div>
  );
}
