"use client";

import { useEffect, useRef, useState } from "react";
import { switchCurrentOrg } from "@/app/team/actions";
import { useOutsideClick } from "@/lib/use-outside-click";
import { HelpTip } from "@/components/help-tip";

type Role = "admin" | "member" | "viewer";
type Org = { id: string; name: string; role: Role };

type Ctx = {
  current: { id: string; name: string; role: Role } | null;
  all: Org[];
};

/**
 * Compact workspace indicator + switcher mounted in the AppShell header.
 * Fetches its data on first mount via /api/team/context.
 *
 * Always renders once loaded — even for a user with zero teams — because
 * the "workspace" concept otherwise appears out of nowhere the first time
 * an invite is accepted. With no teams it's a static "Personal workspace"
 * pill plus a ? explaining what a workspace is; with teams it becomes a
 * dropdown listing every team plus the personal option.
 */
export function OrgSwitcher() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/team/context")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setCtx(data as Ctx);
      })
      .catch(() => {
        /* ignore — switcher just stays hidden on error */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click — touch-aware so iOS taps close the menu.
  useOutsideClick(menuRef, open, () => setOpen(false));

  if (!ctx) return null;

  const label = ctx.current ? ctx.current.name : "Personal workspace";
  const hasTeams = ctx.all.length > 0;

  const tip = (
    <HelpTip title="Workspaces" side="bottom" ariaLabel="What is a workspace?">
      <p>
        <span className="font-medium">Personal workspace</span> is yours
        alone — nobody else sees those inspections.
      </p>
      <p className="mt-1.5">
        A <span className="font-medium">team workspace</span> is shared:
        every member sees the team&apos;s inspections, folders, findings,
        and Chip&apos;s rules.
      </p>
      <p className="mt-1.5">
        Switching changes what you see everywhere and where new inspections
        are saved.
      </p>
    </HelpTip>
  );

  // No teams yet: a static pill, not a dropdown with one dead option.
  if (!hasTeams) {
    return (
      <div className="inline-flex items-center gap-1">
        <span
          className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--fg-muted)]"
          title="You're in your personal workspace"
        >
          <PersonGlyph />
          <span className="truncate">Personal workspace</span>
        </span>
        {tip}
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-1" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--fg)] transition hover:border-[var(--primary)]"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch workspace"
      >
        {ctx.current ? <TeamGlyph /> : <PersonGlyph />}
        <span className="truncate">{label}</span>
        <CaretIcon />
      </button>
      {tip}

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-lg"
        >
          <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
            Switch workspace
          </div>
          <ul className="flex flex-col pb-1">
            {ctx.all.map((o) => {
              const isCurrent = ctx.current?.id === o.id;
              return (
                <li key={o.id}>
                  <form action={switchCurrentOrg}>
                    <input type="hidden" name="organization_id" value={o.id} />
                    <button
                      type="submit"
                      role="menuitem"
                      className={[
                        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-white/[0.05]",
                        isCurrent
                          ? "font-semibold text-[var(--primary)]"
                          : "text-[var(--fg)]",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <TeamGlyph />
                        <span className="truncate">{o.name}</span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--fg-subtle)]">
                        {o.role}
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
            <li>
              <form action={switchCurrentOrg}>
                <input
                  type="hidden"
                  name="organization_id"
                  value="personal"
                />
                <button
                  type="submit"
                  role="menuitem"
                  className={[
                    "flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-1.5 text-left text-xs transition hover:bg-white/[0.05]",
                    !ctx.current
                      ? "font-semibold text-[var(--primary)]"
                      : "text-[var(--fg-muted)]",
                  ].join(" ")}
                >
                  <PersonGlyph />
                  Personal workspace
                </button>
              </form>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TeamGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 19a6 6 0 0 1 12 0M14 19a4 4 0 0 1 7 0" />
    </svg>
  );
}
function PersonGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
function CaretIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
