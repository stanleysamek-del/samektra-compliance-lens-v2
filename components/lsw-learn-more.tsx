import { Card, CardTitle } from "@/components/card";
import { fetchLswReference } from "@/lib/lsw-reference";

/**
 * "Learn more on LifeSafetyWiki" — async server component. Given the
 * findings on a photo, asks LSW's knowledge base for the decoded sections
 * behind their citations plus the wiki articles that cover the topic.
 * Renders nothing when there's nothing to show (or LSW is unreachable).
 */
export async function LswLearnMore({
  findings,
}: {
  findings: Array<{ title: string | null; code: string | null }>;
}) {
  if (findings.length === 0) return null;
  const topic = findings
    .map((f) => f.title ?? "")
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  const code = findings
    .map((f) => f.code ?? "")
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
  const ref = await fetchLswReference({ q: topic, code });
  if (ref.articles.length === 0 && ref.sections.length === 0) return null;

  return (
    <Card>
      <CardTitle>Learn more on LifeSafetyWiki</CardTitle>
      <p className="mt-1 text-xs text-[var(--fg-muted)]">
        The code sections behind these findings, decoded in plain language,
        and the articles that cover the topic — from Samektra&apos;s free
        safety encyclopedia.
      </p>

      {ref.sections.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {ref.sections.map((s) => (
            <li key={s.url} className="rounded border border-[var(--border)] px-3 py-2 text-sm">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--accent)] underline decoration-dotted underline-offset-2"
              >
                {s.standard} §{s.section}
                {s.title ? ` — ${s.title}` : ""} ↗
              </a>
              {s.summary ? (
                <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">{s.summary}</p>
              ) : null}
              {s.edition ? (
                <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--fg-subtle)]">
                  {s.edition}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {ref.articles.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {ref.articles.map((a) => (
            <a
              key={a.slug}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {a.title} ↗
            </a>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
