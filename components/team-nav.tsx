"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Two-tab nav shared between /team (dashboard) and /team/members
 * (members management). Lives at the top of each page so the team
 * area feels cohesive.
 */
export function TeamNav() {
  const pathname = usePathname();
  const tabs = [
    { href: "/team", label: "Dashboard" },
    { href: "/team/members", label: "Members" },
    { href: "/team/rules", label: "Chip's rules" },
  ];

  return (
    <nav className="flex gap-1 border-b border-[var(--border)]">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={[
              "relative px-3 py-2 text-sm font-medium transition",
              active
                ? "text-[var(--fg)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            ].join(" ")}
          >
            {t.label}
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full"
                style={{ background: "var(--primary)" }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
