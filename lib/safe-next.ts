/**
 * Validate a post-auth `next` redirect target. Only same-origin relative
 * paths pass — "//evil.com", "/\evil.com", "javascript:" and header-splitting
 * newlines all fall back — so a crafted sign-in link can't bounce a user to
 * another site after they authenticate.
 */
export function safeNext(
  raw: string | null | undefined,
  fallback = "/inspections",
): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/^\/[^/]*:/.test(value) || /[\r\n]/.test(value)) return fallback;
  return value;
}
