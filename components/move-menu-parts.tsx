/** Shared trigger chip + glyphs for the "Move to …" menus. */

export const moveChipClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded border border-[var(--rule-strong)] bg-[var(--paper-2)] px-3 text-xs font-medium text-[var(--fg-muted)] transition hover:border-[var(--ink)] hover:text-[var(--fg)] disabled:opacity-60";

export function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

export function CaretIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
