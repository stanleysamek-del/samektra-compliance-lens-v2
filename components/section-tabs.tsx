"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabsFor } from "@/lib/nav";

/**
 * Sub-page tabs at the top of a section — e.g. Inspections:
 * History · Schedules · Templates. Rendered by AppShell above every page,
 * so pages don't each carry their own sub-navigation; renders nothing on
 * pages outside a tabbed section (and on an inspection's detail screen).
 */
export function SectionTabs() {
  const pathname = usePathname();
  const hit = tabsFor(pathname);
  if (!hit) return null;
  const { section, active } = hit;
  return (
    <nav
      aria-label={`${section.label} pages`}
      className="-mx-1 mb-5 flex overflow-x-auto border-b border-[var(--rule-paper)]"
    >
      {section.tabs!.map((t) => {
        const isActive = t.href === active.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-[3px] px-3 text-sm transition ${
              isActive
                ? "border-[var(--ink)] font-semibold text-[var(--ink)]"
                : "border-transparent text-[var(--fg-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
