"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";
import { ScrollToTop } from "@/components/scroll-to-top";
import { SessionGuard } from "@/components/session-guard";
import { OrgSwitcher } from "@/components/org-switcher";
import { HelpDrawer } from "@/components/help-drawer";
import { ContrastToggle } from "@/components/contrast-toggle";
import { Toaster } from "@/components/toaster";
import { ConfirmHost } from "@/components/ui/confirm-dialog";
import { SectionTabs } from "@/components/section-tabs";
import { MoreSheet } from "@/components/more-sheet";
import { NAV_SECTIONS, START_INSPECTION_HREF, sectionFor, type NavSection } from "@/lib/nav";
import { useCanCreate } from "@/lib/org/workspace-client";

import { Building2, ChartColumn, ClipboardCheck, Ellipsis, Flag, House, LogOut, Plus, Settings } from "lucide-react";
/* =====================================================================
 * AppShell
 *
 * Mobile/tablet first. Renders a sticky header at the top, a centered
 * content column, and a bottom tab bar for primary navigation. On
 * desktop (≥ lg, 1024px) a left sidebar appears alongside, the bottom
 * tab bar hides, and content is constrained to a comfortable column.
 * ===================================================================== */

type Props = PropsWithChildren<{
  user: {
    fullName: string;
    organization?: string | null;
    email?: string | null;
  };
}>;

/**
 * Content width by page type: review/list pages (tables, dashboards,
 * boards) get room on desktop; working screens (an inspection, forms,
 * the template editor) stay at a comfortable reading width.
 */
const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);
function contentWidth(path: string): string {
  if (/^\/templates\/.+/.test(path)) return "max-w-3xl"; // the template editor
  if (/^\/(assets|facilities)\/[^/]+$/.test(path)) return "max-w-4xl"; // one facility / item
  if (["/dashboard", "/findings", "/actions", "/inspections/history", "/assets", "/facilities", "/admin", "/team", "/schedules", "/templates"].some((r) => under(path, r))) {
    return "max-w-6xl"; // boards, lists, dashboards
  }
  if (path === "/inspections") return "max-w-4xl"; // Home
  return "max-w-3xl"; // an inspection, forms
}

export function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  return (
    // .cl-app switches on the field-tuned tokens (app/globals.css).
    <div className="cl-app min-h-dvh">
      <SessionGuard />
      {/* ===== Header ===== */}
      <header
        className="sticky top-0 z-30 border-b border-[var(--ink)]"
        style={{
          background: "rgba(250, 248, 242, 0.92)",
          backdropFilter: "blur(8px) saturate(120%)",
          WebkitBackdropFilter: "blur(8px) saturate(120%)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:pl-72">
          {/* Editorial wordmark — replaces the old SamektraMark glyph.
              On phones <640px we hide the "Samektra ·" eyebrow so the
              wordmark fits next to the action cluster on the right
              without pushing the OrgSwitcher off-screen. */}
          <Link
            href="/inspections"
            className="inline-flex min-w-0 items-baseline gap-2"
            style={{ color: "var(--ink)", textDecoration: "none" }}
          >
            <span
              className="hidden sm:inline"
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--slate)",
              }}
            >
              Samektra
            </span>
            <span
              aria-hidden
              className="hidden sm:inline"
              style={{ color: "var(--rule-paper)", fontSize: 12 }}
            >
              ·
            </span>
            <span
              className="truncate"
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 18,
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}
            >
              Compliance{" "}
              <em style={{ fontStyle: "italic", color: "var(--gold-soft)" }}>
                Lens
              </em>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <OrgSwitcher />
            <ContrastToggle />
            <HelpDrawer />
            <div className="hidden flex-col items-end leading-tight sm:flex">
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                {user.fullName}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  color: "var(--slate)",
                }}
              >
                {user.organization || user.email || ""}
              </span>
            </div>
            <UserAvatar name={user.fullName} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-screen-2xl">
        {/* ===== Sidebar (desktop only) ===== */}
        <aside
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 px-4 py-6 lg:block"
          style={{ borderRight: "1px solid var(--ink)" }}
        >
          <SidebarNav />
          <div
            className="mt-6 pt-4"
            style={{ borderTop: "1px solid var(--rule-paper)" }}
          >
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-sm transition"
                style={{
                  color: "var(--slate)",
                  background: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(15, 21, 24, 0.04)";
                  e.currentTarget.style.color = "var(--ink)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--slate)";
                }}
              >
                <SignOutIcon />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </aside>

        {/* ===== Main content ===== */}
        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:pb-10 lg:pl-8">
          <div className={`mx-auto w-full ${contentWidth(pathname)}`}>
            <SectionTabs />
            {children}
          </div>
        </main>
      </div>

      {/* ===== Bottom tab bar (mobile + tablet) ===== */}
      <BottomTabBar />

      {/* ===== Floating scroll-to-top (appears after ~400px scroll) ===== */}
      <ScrollToTop />

      {/* ===== App-wide toast stack (showToast() from any client component) ===== */}
      <Toaster />
      {/* confirmDialog() renders here (replaces window.confirm). */}
      <ConfirmHost />
    </div>
  );
}

/* --------------------------------------------------------------------- */

function SidebarNav() {
  const pathname = usePathname();
  const current = sectionFor(pathname);
  const canCreate = useCanCreate();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {/* The primary action, above the sections (not for viewers). */}
      {canCreate ? (
      <Link
        href={START_INSPECTION_HREF}
        className="mb-4 flex min-h-11 items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition hover:brightness-95"
        style={{ background: "var(--gold)", color: "var(--ink)", border: "1px solid var(--gold-soft)" }}
      >
        <PlusGlyph />
        Start inspection
      </Link>
      ) : null}
      {NAV_SECTIONS.map((section) => {
        const active = current?.key === section.key && pathname !== START_INSPECTION_HREF;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className="group flex min-h-11 items-center gap-3 px-3 transition hover:bg-[var(--paper-3)]"
            style={{
              background: active ? "var(--paper-3)" : undefined,
              color: active ? "var(--ink)" : "var(--slate)",
              borderLeft: active ? "3px solid var(--ink)" : "3px solid transparent",
              fontFamily: "var(--font-geist-sans)",
              fontSize: 14,
              fontWeight: active ? 600 : 500,
              textDecoration: "none",
            }}
          >
            <SectionIcon section={section.key} />
            <span>{section.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Phone/tablet tab bar: the daily loop — Home · Inspections · [Start] ·
 * Actions · More. "More" opens a sheet with Assets, Analytics and
 * Settings (and sign out), so nothing needs a permanent strip on screen.
 */
function BottomTabBar() {
  const pathname = usePathname();
  const current = sectionFor(pathname);
  const daily = ["home", "inspections", "actions"];
  const primary = NAV_SECTIONS.filter((s) => daily.includes(s.key));
  const more = NAV_SECTIONS.filter((s) => !daily.includes(s.key));
  const moreActive = more.some((s) => s.key === current?.key);
  const canCreate = useCanCreate();

  const tab = (section: NavSection) => {
    const active = current?.key === section.key && pathname !== START_INSPECTION_HREF;
    return (
      <Link
        key={section.key}
        href={section.href}
        aria-current={active ? "page" : undefined}
        className="flex h-14 flex-col items-center justify-center gap-1 text-[11px] transition"
        style={{
          color: active ? "var(--ink)" : "var(--slate)",
          fontFamily: "var(--font-geist-sans)",
          fontWeight: active ? 700 : 500,
          // Non-color active cue: a bar along the top edge.
          borderTop: active ? "3px solid var(--ink)" : "3px solid transparent",
        }}
      >
        <SectionIcon section={section.key} />
        <span>{section.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
      style={{
        borderTop: "1px solid var(--ink)",
        background: "rgba(250, 248, 242, 0.94)",
        backdropFilter: "blur(8px) saturate(120%)",
        WebkitBackdropFilter: "blur(8px) saturate(120%)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
      }}
    >
      <div className="mx-auto grid max-w-screen-sm grid-cols-5">
        {tab(primary[0])}
        {tab(primary[1])}
        <div className="flex justify-center">
          {/* Viewers: an empty slot keeps the other tabs where thumbs expect them. */}
          {canCreate ? (
          <Link
            href={START_INSPECTION_HREF}
            aria-label="Start inspection"
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded transition active:translate-y-px"
            style={{
              background: "var(--gold)",
              color: "var(--ink)",
              border: "1px solid var(--gold-soft)",
              boxShadow: "0 12px 24px -10px rgba(200, 155, 60, 0.55)",
            }}
          >
            <PlusGlyph size={24} />
          </Link>
          ) : null}
        </div>
        {tab(primary[2])}
        <MoreSheet sections={more} active={moreActive} icons={Object.fromEntries(more.map((s) => [s.key, <SectionIcon key={s.key} section={s.key} />]))}>
          <MoreIcon />
        </MoreSheet>
      </div>
    </nav>
  );
}

function UserAvatar({ name }: { name: string }) {
  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "·";
  // A LINK, not a div: on phones this is the only route to Profile (and
  // from there Team, Templates, and Sign out) — the tab bar has no room.
  return (
    <Link
      href="/profile"
      className="flex h-11 w-11 items-center justify-center rounded-full text-xs transition hover:opacity-90"
      style={{
        background: "var(--gold)",
        color: "var(--ink)",
        border: "1px solid var(--ink)",
        fontFamily: "var(--font-instrument-serif)",
        fontSize: 13,
        lineHeight: 1,
        textDecoration: "none",
      }}
      title={`${name} · Profile, team, templates, sign out`}
      aria-label={`Open profile for ${name} — team, templates, and sign out`}
    >
      {initials}
    </Link>
  );
}

/* ===== Icons (lucide-react) — one distinct glyph per section ===== */

function SectionIcon({ section }: { section: NavSection["key"] }) {
  const props = { size: 22, strokeWidth: 1.7, "aria-hidden": true } as const;
  switch (section) {
    case "home":
      return <House {...props} />;
    case "inspections":
      return <ClipboardCheck {...props} />;
    case "actions":
      return <Flag {...props} />;
    case "assets":
      return <Building2 {...props} />;
    case "analytics":
      return <ChartColumn {...props} />;
    case "settings":
      return <Settings {...props} />;
  }
}

function MoreIcon() {
  return <Ellipsis size={22} aria-hidden />;
}

function PlusGlyph({ size = 14 }: { size?: number }) {
  return <Plus size={size} strokeWidth={2.5} aria-hidden />;
}

function SignOutIcon() {
  return <LogOut size={20} strokeWidth={1.7} aria-hidden />;
}
