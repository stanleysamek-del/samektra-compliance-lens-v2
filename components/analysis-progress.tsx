"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Counts = { queued: number; analyzing: number; failed: number };

type Props = {
  inspectionId: string;
  /** Server-rendered counts so the strip is right on first paint. */
  initial: Counts;
};

const POLL_MS = 5000;
/** Stop polling after this long even if something looks stuck — the cron
 *  sweeper will sort it out and a page reload picks it up. */
const MAX_POLL_MS = 15 * 60 * 1000;

/**
 * "2 photos analyzing · 1 queued" strip for the inspection page.
 *
 * Polls `GET /api/photos/[inspectionId]/status?inspection=1` every 5s
 * while any photo on the inspection is queued or analyzing, and calls
 * router.refresh() whenever the pending count DROPS (a photo finished —
 * its findings need to appear on the card below). Renders nothing once
 * everything is done; failed photos are shown on their own cards.
 */
export function AnalysisProgress({ inspectionId, initial }: Props) {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>(initial);
  // A fresh server render (after router.refresh) hands us a new `initial`
  // object — trust it over whatever the last poll said. Render-time
  // derive-from-props (React docs pattern), not an effect.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    setCounts(initial);
  }
  // First poll start — set inside the effect, never during render.
  const startedRef = useRef<number | null>(null);

  const pending = counts.queued + counts.analyzing;

  useEffect(() => {
    if (pending === 0) return;
    let cancelled = false;
    if (startedRef.current === null) startedRef.current = Date.now();
    const started = startedRef.current;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - started > MAX_POLL_MS) return;
      try {
        const res = await fetch(`/api/photos/${inspectionId}/status?inspection=1`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as Partial<Counts>;
        if (cancelled) return;
        const next: Counts = {
          queued: json.queued ?? 0,
          analyzing: json.analyzing ?? 0,
          failed: json.failed ?? 0,
        };
        const nextPending = next.queued + next.analyzing;
        // `pending` is the value this effect was set up with; the effect
        // re-runs whenever it changes, so the comparison is always current.
        const finished = nextPending < pending;
        setCounts(next);
        if (finished) router.refresh();
      } catch {
        // Network blip — try again on the next tick.
      }
    };

    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pending, inspectionId, router]);

  if (pending === 0) return null;

  const parts: string[] = [];
  if (counts.analyzing > 0) {
    parts.push(`${counts.analyzing} photo${counts.analyzing === 1 ? "" : "s"} analyzing`);
  }
  if (counts.queued > 0) parts.push(`${counts.queued} queued`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--fg-muted)]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="animate-spin">
        <circle cx="12" cy="12" r="9" stroke="rgba(15,21,24,0.18)" strokeWidth="2.4" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--gold)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span>
        <strong className="font-medium text-[var(--fg)]">Chip is working</strong> · {parts.join(" · ")}
        {" "}— findings appear on the cards below as each photo finishes.
      </span>
    </div>
  );
}
