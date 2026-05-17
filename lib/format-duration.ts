/**
 * Format an AI-call duration (or any millisecond span) for compact
 * display in timing badges next to photos, findings, and inspections.
 *
 * Bands:
 *   < 1000 ms   → "780ms"    — sub-second, sometimes seen on cached
 *                              cache-hit re-analyses or detect calls
 *   < 60 s      → "8.4s"     — typical AI photo analysis
 *   >= 60 s     → "1m 22s"   — slow Sonnet runs or cumulative inspection
 *                              totals
 *
 * Returns "—" for non-finite / negative input so callers can safely
 * render the result without a guard.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${m}m ${s}s`;
}

/**
 * Shorten a verbose model id (e.g., "claude-haiku-4-5-20251001") to a
 * friendly badge label like "Haiku 4.5" for use inline next to durations.
 */
export function shortModelName(model: string | null | undefined): string {
  if (!model) return "";
  if (model.includes("haiku-4-5")) return "Haiku 4.5";
  if (model.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (model.includes("gpt-4o")) return "GPT-4o";
  if (model.includes("gemini-2.5-flash")) return "Gemini Flash";
  if (model.includes("gemini-2.5-pro")) return "Gemini Pro";
  // Fallback: trim trailing version stamp if obviously a date.
  return model.replace(/-\d{8}$/, "");
}
