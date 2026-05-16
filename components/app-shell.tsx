"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PropsWithChildren, ReactNode } from "react";
import { SamektraMark } from "@/components/logo";
import { ScrollToTop } from "@/components/scroll-to-top";
import { OrgSwitcher } from "@/components/org-switcher";
import { HelpDrawer } from "@/components/help-drawer";

/* =====================================================================
 * AppShell
 *
 * Mobile/tablet first. Renders a sticky header at the top, a centered
 * content column, and a bottom tab bar for primary navigation. On
 * desktop (≥ lg, 1024px) a left sidebar appears alongside, the bottom
 * tab bar hides, and content is constrained to a comfortable column.
 * ===================================================================== */

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Renders the centered raised orange button on mobile / accented in sidebar. */
  accent?: boolean;
};

const NAV: NavItem[] = [
  { href: "/inspections", label: "Home", icon: <HomeIcon /> },
  { href: "/inspections/history", label: "History", icon: <HistoryIcon /> },
  {
    href: "/inspections/new",
    label: "Upload",
    icon: <UploadIcon />,
    accent: true,
  },
  { href: "/findings", label: "Findings", icon: <FindingsIcon /> },
  { href: "/team", label: "Team", icon: <TeamIcon /> },
  { href: "/profile", label: "Profile", icon: <ProfileIcon /> },
];

/**
 * Mobile tab bar shows 5 items max, with Upload in the center as the
 * raised gold button. Profile lives in the header avatar dropdown on
 * mobile, so it's omitted here — desktop sidebar still shows it via NAV.
 * Order matters: the .accent item MUST be at index 2 (the middle slot)
 * for the raised-button styling to position correctly.
 */
const MOBILE_NAV: NavItem[] = [
  { href: "/inspections", label: "Home", icon: <HomeIcon /> },
  { href: "/inspections/history", label: "History", icon: <HistoryIcon /> },
  {
    href: "/inspections/new",
    label: "Upload",
    icon: <UploadIcon />,
    accent: true,
  },
  { href: "/findings", label: "Findings", icon: <FindingsIcon /> },
  { href: "/team", label: "Team", icon: <TeamIcon /> },
];

type Props = PropsWithChildren<{
  user: {
    fullName: string;
    organization?: string | null;
    email?: string | null;
  };
}>;

export function AppShell({ user, children }: Props) {
  return (
    <div className="min-h-dvh">
      {/* ===== Header ===== */}
      <header
        className="sticky top-0 z-30 border-b border-[var(--ink)]"
        style={{
          background: "rgba(236, 232, 218, 0.92)",
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
            {/* Persistent primary action — always one click away. */}
            <Link
              href="/inspections/new"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold transition sm:px-2.5"
              style={{
                background: "var(--gold)",
                color: "var(--ink)",
                border: "1px solid var(--gold)",
                fontFamily: "var(--font-geist-sans)",
              }}
              title="Start a new inspection"
              aria-label="New inspection"
            >
              <PlusGlyph />
              <span className="hidden sm:inline">New</span>
            </Link>
            <OrgSwitcher />
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
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>
      </div>

      {/* ===== Bottom tab bar (mobile + tablet) ===== */}
      <BottomTabBar />

      {/* ===== Floating scroll-to-top (appears after ~400px scroll) ===== */}
      <ScrollToTop />
    </div>
  );
}

/* --------------------------------------------------------------------- */

function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/inspections" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group flex items-center gap-3 px-3 py-2.5 transition"
            style={{
              background: active ? "rgba(15, 21, 24, 0.04)" : "transparent",
              color: active
                ? "var(--ink)"
                : item.accent
                  ? "var(--gold-soft)"
                  : "var(--slate)",
              borderLeft: active
                ? "2px solid var(--gold)"
                : "2px solid transparent",
              fontFamily: "var(--font-geist-sans)",
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              textDecoration: "none",
            }}
          >
            <span
              style={{
                color: item.accent
                  ? "var(--gold-soft)"
                  : active
                    ? "var(--gold-soft)"
                    : "var(--slate)",
              }}
            >
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
      style={{
        borderTop: "1px solid var(--ink)",
        background: "rgba(236, 232, 218, 0.94)",
        backdropFilter: "blur(8px) saturate(120%)",
        WebkitBackdropFilter: "blur(8px) saturate(120%)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
      }}
    >
      <div className="mx-auto grid max-w-screen-sm grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/inspections" && pathname.startsWith(item.href));

          if (item.accent) {
            // Raised gold Upload button — middle slot, square-edged.
            return (
              <div key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="-mt-5 flex h-14 w-14 items-center justify-center transition active:translate-y-px"
                  style={{
                    background: "var(--gold)",
                    color: "var(--ink)",
                    border: "1px solid var(--gold-soft)",
                    boxShadow:
                      "0 12px 24px -10px rgba(200, 155, 60, 0.55)",
                  }}
                >
                  {item.icon}
                </Link>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className="flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition"
              style={{
                color: active ? "var(--ink)" : "var(--slate)",
                fontFamily: "var(--font-geist-sans)",
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
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
  return (
    <div
      className="flex h-9 w-9 items-center justify-center text-xs"
      style={{
        background: "var(--gold)",
        color: "var(--ink)",
        border: "1px solid var(--ink)",
        fontFamily: "var(--font-instrument-serif)",
        fontSize: 13,
        lineHeight: 1,
      }}
      title={name}
    >
      {initials}
    </div>
  );
}

/* ===== Icons (inline SVG, 22px) ===== */

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function HistoryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4m0 0L7 9m5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ProfileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.5 20a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function PlusGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function TeamIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 19a6 6 0 0 1 12 0M14 19a4 4 0 0 1 7 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function FindingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5h16v14H4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M4 9h16M9 5v14"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m11 13 1.5 1.5L16 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="m15 8 4 4-4 4M19 12H9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
