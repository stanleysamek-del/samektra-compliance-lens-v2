import { ChevronDown, Folder } from "lucide-react";

/** Shared trigger chip + glyphs for the "Move to …" menus. */

export const moveChipClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded border border-[var(--rule-strong)] bg-[var(--paper-2)] px-3 text-xs font-medium text-[var(--fg-muted)] transition hover:border-[var(--ink)] hover:text-[var(--fg)] disabled:opacity-60";

export function FolderIcon() {
  return <Folder size={12} strokeWidth={2} aria-hidden />;
}

export function CaretIcon() {
  return <ChevronDown size={12} strokeWidth={2} aria-hidden />;
}
