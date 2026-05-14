/**
 * Small client-side retry helper for fetch calls. Retries on:
 *  - Network failures (the fetch promise rejects, no response)
 *  - Server-side transient errors: 502, 503, 504
 *  - Optional: 429 (rate limited) — retried with longer backoff
 *
 * Does NOT retry on 4xx (other than 429) because those are client errors and
 * retrying won't change the outcome — surface them to the caller immediately.
 *
 * Usage:
 *   const res = await fetchWithRetry("/api/photos/upload", { method: "POST", body }, {
 *     retries: 2,
 *     onAttempt: (n) => setStatus({ kind: "retrying", attempt: n }),
 *   });
 */

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export type RetryOpts = {
  /** Number of retry attempts AFTER the initial call. Default 2 (so up to 3 total). */
  retries?: number;
  /** Base backoff in ms; doubles each attempt. Default 800. */
  backoffMs?: number;
  /** Hard ceiling on per-attempt backoff. Default 4000. */
  maxBackoffMs?: number;
  /** Whether to retry on HTTP 429. Default true, with double the backoff. */
  retryOn429?: boolean;
  /** Called before each retry. attempt is 1-indexed. */
  onAttempt?: (attempt: number, reason: string) => void;
};

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: RetryOpts = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 800;
  const maxBackoffMs = opts.maxBackoffMs ?? 4000;
  const retryOn429 = opts.retryOn429 ?? true;

  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;

      // Soft transient — retry.
      const is429 = res.status === 429 && retryOn429;
      const isTransient = TRANSIENT_STATUSES.has(res.status) || is429;
      if (!isTransient || attempt === retries) {
        return res; // Return the non-OK response so caller can surface it.
      }

      const wait = Math.min(
        maxBackoffMs,
        backoffMs * Math.pow(2, attempt) * (is429 ? 2 : 1),
      );
      opts.onAttempt?.(attempt + 1, `HTTP ${res.status}`);
      await sleep(wait + jitter());
    } catch (err) {
      // Network-level failure (fetch rejected before any response).
      lastErr = err;
      if (attempt === retries) throw err;
      const wait = Math.min(maxBackoffMs, backoffMs * Math.pow(2, attempt));
      opts.onAttempt?.(
        attempt + 1,
        err instanceof Error ? err.message : "network error",
      );
      await sleep(wait + jitter());
    }
  }

  // Unreachable — the loop either returns or throws.
  throw lastErr ?? new Error("fetchWithRetry: exhausted retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(): number {
  return Math.floor(Math.random() * 250);
}
