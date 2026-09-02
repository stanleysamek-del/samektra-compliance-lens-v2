import { lswLinksForCitation } from "@/lib/lsw-links";

/**
 * "On LifeSafetyWiki" row — deep links from a finding's code citation into
 * the exact section of LSW's decoded-standard readers. Pure (no fetch), so
 * it renders anywhere: client finding cards, checklist rows, server pages.
 * Renders nothing when the citation isn't one LSW has decoded — a missing
 * row beats a guessed link.
 */
export function LswLinks({
  code,
  compact = false,
}: {
  code: string | null | undefined;
  compact?: boolean;
}) {
  const links = lswLinksForCitation(code);
  if (links.length === 0) return null;
  return (
    <p
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${compact ? "text-[11px]" : "text-xs"} text-[var(--fg-subtle)]`}
    >
      <span className="font-medium uppercase tracking-wider">On LifeSafetyWiki ·</span>
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {l.label} ↗
        </a>
      ))}
    </p>
  );
}
