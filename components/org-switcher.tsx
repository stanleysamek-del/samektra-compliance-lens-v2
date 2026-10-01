"use client";

import { useEffect, useRef, useState } from "react";
import { switchCurrentOrg } from "@/app/team/actions";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
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
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      // Phones: nothing to switch, so give the header space back.
      <div className="hidden items-center gap-1 sm:inline-flex">
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

  function switchTo(orgId: string) {
    if (!formRef.current || !inputRef.current) return;
    inputRef.current.value = orgId;
    formRef.current.requestSubmit();
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Menu
        label={`Workspace: ${label}. Switch workspace`}
        title="Switch workspace"
        width="w-64"
        triggerClassName="inline-flex min-h-11 max-w-[120px] items-center gap-1.5 rounded border border-[var(--rule-strong)] bg-[var(--bg-elevated)] px-2.5 text-xs font-medium text-[var(--fg)] transition hover:border-[var(--primary)] sm:max-w-[180px]"
        trigger={
          <>
            {ctx.current ? <TeamGlyph /> : <PersonGlyph />}
            <span className="truncate">{label}</span>
            <CaretIcon />
          </>
        }
      >
        <MenuLabel>Switch workspace</MenuLabel>
        {ctx.all.map((o) => (
          <MenuItem
            key={o.id}
            selected={ctx.current?.id === o.id}
            onSelect={() => switchTo(o.id)}
          >
            <TeamGlyph />
            <span className="truncate">{o.name}</span>
            <span className="ml-auto shrink-0 text-xs uppercase tracking-wider text-[var(--fg-subtle)]">
              {o.role}
            </span>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem selected={!ctx.current} onSelect={() => switchTo("personal")}>
          <PersonGlyph />
          Personal workspace
        </MenuItem>
      </Menu>
      <span className="hidden sm:inline-flex">{tip}</span>
      {/* Outside the menu so it survives the menu closing on select. */}
      <form ref={formRef} action={switchCurrentOrg} hidden>
        <input ref={inputRef} type="hidden" name="organization_id" defaultValue="" />
      </form>
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
