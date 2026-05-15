"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LS_KEY = "cl_dismissed_team_tip";

/**
 * One-time, dismissible tip on the Home page nudging personal-workspace
 * users toward creating a team. Renders nothing when:
 *  - the user has dismissed it (localStorage flag is set), or
 *  - the user is already in a team (we infer this by hitting
 *    /api/team/context — `all.length > 0` means they belong to a team)
 *
 * Quiet enough to ignore on the second visit, useful for the first.
 */
export function TeamTipBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // localStorage may be unavailable in some browsing modes — guard it.
    try {
      if (localStorage.getItem(LS_KEY) === "1") return;
    } catch {
      /* ignore — we just won't remember the dismissal */
    }

    fetch("/api/team/context")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { all: unknown[] } | null) => {
        if (cancelled) return;
        if (!data) return;
        if (Array.isArray(data.all) && data.all.length === 0) {
          setShow(true);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(LS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs"
      style={{
        borderColor: "rgba(200,155,60,0.35)",
        background: "rgba(200,155,60,0.06)",
        color: "var(--fg-muted)",
      }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: "rgba(200,155,60,0.18)", color: "#b8902f" }}
        >
          💡
        </span>
        <span>
          <strong className="text-[var(--fg)]">Working with a team?</strong>{" "}
          Create a team workspace to share inspections, folders, and
          findings with coworkers.
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href="/team"
          className="rounded-md border border-[var(--primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-[#0a0d12]"
        >
          Set up team
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--fg-subtle)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
