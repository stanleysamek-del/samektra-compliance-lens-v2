"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deleteFinding } from "@/app/inspections/[id]/photos/[photoId]/actions";

export type CompactFinding = {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
};

type Props = {
  inspectionId: string;
  photoId: string;
  findings: CompactFinding[];
};

const ADVISORY_KEY = "cl-include-advisories";

/**
 * Concise findings list shown directly on the photo card on the inspection
 * detail page. Each row has its own kebab menu so the user can edit or
 * delete a finding without opening the photo detail page.
 *
 *   - Edit  → jumps to /inspections/<id>/photos/<photoId>#finding-<fid>
 *             which scrolls to the matching FindingCard (which has full edit UI)
 *   - Delete → confirm() prompt + server action
 *
 * The "Show advisories" toggle (persisted in localStorage) lets the user
 * include or exclude Low-severity advisory entries from the report list.
 * Setting is global per browser — applies to every photo card.
 */
export function PhotoCardFindings({ inspectionId, photoId, findings }: Props) {
  const [includeAdvisories, setIncludeAdvisories] = useState(true);

  // Read persisted preference on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(ADVISORY_KEY);
      if (v === "0") setIncludeAdvisories(false);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Persist whenever the user toggles.
  const toggle = () => {
    setIncludeAdvisories((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ADVISORY_KEY, next ? "1" : "0");
        // Notify any other PhotoCardFindings on the page to re-read the value.
        window.dispatchEvent(new CustomEvent("cl-advisories-changed"));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Listen for changes from other instances of this component.
  useEffect(() => {
    const handler = () => {
      try {
        const v = window.localStorage.getItem(ADVISORY_KEY);
        setIncludeAdvisories(v !== "0");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("cl-advisories-changed", handler);
    return () => window.removeEventListener("cl-advisories-changed", handler);
  }, []);

  if (findings.length === 0) {
    return (
      <p className="px-4 pb-3 text-xs text-[var(--fg-subtle)]">
        No deficiencies detected.
      </p>
    );
  }

  // Sort High → Medium → Low. We keep ALL findings in the array but apply the
  // visibility filter at render time so deficiencies retain their numbering
  // (#1, #2, …) which matches the badges drawn on the photo.
  const order = { High: 0, Medium: 1, Low: 2 } as const;
  const sorted = [...findings].sort(
    (a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3),
  );
  const visible = includeAdvisories
    ? sorted
    : sorted.filter((f) => f.severity !== "Low");

  const advisoryCount = sorted.filter((f) => f.severity === "Low").length;

  return (
    <div className="border-t border-[var(--border)]">
      {/* Toggle row */}
      {advisoryCount > 0 ? (
        <div className="flex items-center justify-between gap-2 px-4 pb-1.5 pt-2 text-[11px]">
          <span className="text-[var(--fg-subtle)]">
            {includeAdvisories
              ? `Showing all · ${advisoryCount} advisor${advisoryCount === 1 ? "y" : "ies"}`
              : `Hiding ${advisoryCount} advisor${advisoryCount === 1 ? "y" : "ies"}`}
          </span>
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-[var(--fg-muted)] transition hover:bg-white/5 hover:text-[var(--fg)]"
            aria-pressed={includeAdvisories}
          >
            <span
              className={[
                "relative inline-block h-3.5 w-6 rounded-full transition",
                includeAdvisories ? "bg-[var(--primary)]" : "bg-white/15",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition",
                  includeAdvisories ? "left-3" : "left-0.5",
                ].join(" ")}
              />
            </span>
            Advisories
          </button>
        </div>
      ) : null}

      {/* Findings list */}
      <ul className="divide-y divide-[var(--border)]">
        {visible.map((f) => {
          // Index uses the original sorted order so numbering stays stable
          // (deficiencies always #1..#N regardless of advisory toggle).
          const idx = sorted.indexOf(f);
          return (
            <li
              key={f.id}
              className="flex items-center gap-2 px-4 py-2 transition hover:bg-white/[0.02]"
            >
              <SeverityPill severity={f.severity} />
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--fg)]">
                <span className="text-[var(--fg-subtle)]">#{idx + 1}</span>{" "}
                {f.title}
              </span>
              <FindingRowMenu
                findingId={f.id}
                inspectionId={inspectionId}
                photoId={photoId}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SeverityPill({ severity }: { severity: "Low" | "Medium" | "High" }) {
  const map = {
    High: { bg: "rgba(248,113,113,0.14)", fg: "#a8362b", label: "H" },
    Medium: { bg: "rgba(248,113,113,0.10)", fg: "#a8362b", label: "M" },
    Low: { bg: "rgba(52,211,153,0.12)", fg: "#6ee7b7", label: "L" },
  } as const;
  const m = map[severity];
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={{ background: m.bg, color: m.fg }}
      title={severity}
      aria-label={severity}
    >
      {m.label}
    </span>
  );
}

function FindingRowMenu({
  findingId,
  inspectionId,
  photoId,
}: {
  findingId: string;
  inspectionId: string;
  photoId: string;
}) {
  const [open, setOpen] = useState(false);
  // Anchor coordinates for the FIXED-positioned menu. We use fixed positioning
  // so the dropdown escapes any parent that has overflow:hidden (e.g. the
  // photo card on the inspection page). Without this, the menu was being
  // clipped at the card border.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Recompute position when opening; close on outside click / escape / scroll.
  useEffect(() => {
    if (!open) return;

    const place = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      // Anchor below the button, right-aligned. If too close to bottom of
      // viewport, anchor above instead.
      const menuH = 80; // approx height of the 2-item menu
      const below = r.bottom + 4;
      const above = r.top - menuH - 4;
      const useAbove = window.innerHeight - r.bottom < menuH + 16;
      setPos({
        top: useAbove ? above : below,
        right: window.innerWidth - r.right,
      });
    };
    place();

    // Touch-aware outside-click: iOS Safari doesn't reliably synthesize
    // mousedown from a tap, so we listen for both event types. The
    // handler skips clicks/taps inside the menu OR the toggle button so
    // the same tap that opens the menu doesn't immediately close it.
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (
        menuRef.current?.contains(t) ||
        buttonRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScrollOrResize = () => place();

    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Finding actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--accent)] bg-[var(--accent)]/15 transition hover:bg-[var(--accent)]/30"
        style={{ color: "#ffffff" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" aria-hidden>
          <circle cx="5" cy="12" r="2.5" />
          <circle cx="12" cy="12" r="2.5" />
          <circle cx="19" cy="12" r="2.5" />
        </svg>
      </button>

      {open && pos ? (
        <div
          ref={menuRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1 shadow-2xl"
          style={{ top: pos.top, right: pos.right }}
        >
          <Link
            href={`/inspections/${inspectionId}/photos/${photoId}#finding-${findingId}`}
            className="block px-3 py-1.5 text-xs text-[var(--fg)] transition hover:bg-white/5"
            onClick={() => setOpen(false)}
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={async () => {
              if (
                !window.confirm("Delete this finding? This cannot be undone.")
              ) {
                return;
              }
              setOpen(false);
              await deleteFinding(findingId, inspectionId);
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-[#a8362b] transition hover:bg-[rgba(168,54,43,0.08)]"
          >
            Delete
          </button>
        </div>
      ) : null}
    </>
  );
}
