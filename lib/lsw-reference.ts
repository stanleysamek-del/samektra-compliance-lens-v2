import { LSW_BASE } from "@/lib/lsw-links";

/**
 * Live "learn more" lookups against LifeSafetyWiki's public knowledge-base
 * endpoint (GET /api/kb/reference on LSW). Server-side only; cached by
 * Next's fetch cache for a day — the wiki registry changes on deploy, not
 * per request. A network failure returns empty arrays, never throws:
 * a missing "learn more" card must never break a finding page.
 */

export type LswArticle = { slug: string; title: string; category: string | null; url: string };
export type LswSection = {
  standard: string;
  edition: string | null;
  section: string;
  title: string | null;
  summary: string | null;
  url: string;
};
export type LswCitation = { condition: string | null; code: string | null; url: string };
export type LswReference = { articles: LswArticle[]; sections: LswSection[]; citations: LswCitation[] };

const EMPTY: LswReference = { articles: [], sections: [], citations: [] };

export async function fetchLswReference(input: {
  q?: string | null;
  code?: string | null;
}): Promise<LswReference> {
  const q = (input.q ?? "").trim().slice(0, 200);
  const code = (input.code ?? "").trim().slice(0, 200);
  if (!q && !code) return EMPTY;
  const base = process.env.LSW_KB_URL ?? LSW_BASE;
  const url = `${base}/api/kb/reference?q=${encodeURIComponent(q)}&code=${encodeURIComponent(code)}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Partial<LswReference>;
    return {
      articles: Array.isArray(data.articles) ? data.articles : [],
      sections: Array.isArray(data.sections) ? data.sections : [],
      citations: Array.isArray(data.citations) ? data.citations : [],
    };
  } catch {
    return EMPTY;
  }
}
