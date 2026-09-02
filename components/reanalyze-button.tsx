"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { fetchWithRetry } from "@/lib/retry";
import { showToast } from "@/components/toaster";

type Props = {
  photoId: string;
  /** Default = Sonnet ('deep'). The button on the photo detail page is the
   *  premium upgrade path, so most callers will leave this unset. */
  tier?: "default" | "deep";
};

// Plain-language names only. Model cost is the operator's budget line, not
// something a facility manager should be asked to weigh on every click.
const TIER_LABELS: Record<"default" | "deep", { name: string }> = {
  default: { name: "the standard model" },
  deep: { name: "the deeper model" },
};

/** One wording for every re-analysis confirmation on the photo page. */
export const REANALYZE_CONFIRM =
  "Re-run the AI analysis on this photo? The AI's findings will be replaced with fresh ones. Findings you wrote or edited are always kept.";

export function ReanalyzeButton({ photoId, tier = "deep" }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = TIER_LABELS[tier];

  async function run() {
    if (busy) return;
    if (!window.confirm(REANALYZE_CONFIRM)) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetchWithRetry(
        `/api/photos/${photoId}/reanalyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        },
        {
          retries: 2,
          backoffMs: 1500,
          onAttempt: (attempt, reason) =>
            console.warn(`[reanalyze] retry ${attempt} (${reason})`),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        const message = json.error ?? `Re-analysis failed (HTTP ${res.status})`;
        setError(message);
        showToast({ kind: "error", message });
        setBusy(false);
        return;
      }
      // Reload the page to pick up new findings
      router.refresh();
      setBusy(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Re-analysis failed";
      setError(message);
      showToast({ kind: "error", message });
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-busy={busy}
        className="cl-btn-outline w-full sm:w-auto"
      >
        {busy ? (
          <>
            <Spinner /> Re-analyzing with {meta.name}…
          </>
        ) : (
          <>
            <SparkIcon /> Re-analyze with {meta.name}
          </>
        )}
      </button>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            borderColor: "rgba(168,54,43,0.4)",
            background: "rgba(168,54,43,0.08)",
            color: "#a8362b",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="9" stroke="rgba(148,163,184,0.25)" strokeWidth="2.4" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="var(--primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
