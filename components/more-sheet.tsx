"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import type { NavSection } from "@/lib/nav";

/**
 * The phone tab bar's "More" slot: a bottom sheet (native <dialog> — focus
 * trapped, Esc and backdrop close) listing the sections that don't fit in
 * the bar, each with its sub-pages, plus sign out.
 */
export function MoreSheet({
  sections,
  active,
  icons,
  children,
}: {
  sections: NavSection[];
  /** The current page is in one of these sections. */
  active: boolean;
  icons: Record<string, ReactNode>;
  /** The tab's icon. */
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        aria-current={active ? "page" : undefined}
        className="flex h-14 flex-col items-center justify-center gap-1 text-[11px] transition"
        style={{
          color: active ? "var(--ink)" : "var(--slate)",
          fontFamily: "var(--font-geist-sans)",
          fontWeight: active ? 700 : 500,
          borderTop: active ? "3px solid var(--ink)" : "3px solid transparent",
        }}
      >
        {children}
        <span>More</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="More"
        className="cl-dialog"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="cl-dialog-panel">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--ink)]">More</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--paper-3)]"
            >
              ✕
            </button>
          </div>
          <ul className="mt-2 flex flex-col divide-y divide-[var(--rule-paper)]">
            {sections.map((s) => (
              <li key={s.key} className="py-2">
                <Link
                  href={s.href}
                  onClick={close}
                  className="flex min-h-11 items-center gap-3 text-[var(--ink)]"
                >
                  <span aria-hidden className="text-[var(--slate)]">
                    {icons[s.key]}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-base font-semibold">{s.label}</span>
                    <span className="text-xs text-[var(--fg-muted)]">{s.blurb}</span>
                  </span>
                </Link>
                {s.tabs && s.tabs.length > 1 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5 pl-9">
                    {s.tabs.map((t) => (
                      <Link
                        key={t.href}
                        href={t.href}
                        onClick={close}
                        className="inline-flex min-h-11 items-center rounded border border-[var(--rule-strong)] px-3 text-sm text-[var(--ink)] hover:bg-[var(--paper-3)]"
                      >
                        {t.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <form action="/auth/sign-out" method="post" className="mt-3 border-t border-[var(--rule-paper)] pt-3">
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center rounded border border-[var(--rule-strong)] text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper-3)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
