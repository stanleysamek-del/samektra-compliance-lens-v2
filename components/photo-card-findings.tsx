"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { deleteFinding } from "@/app/inspections/[id]/photos/[photoId]/actions";
import { HelpTip } from "@/components/help-tip";
import { severityColor } from "@/lib/severity";

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
const ADVISORY_EVENT = "cl-advisories-changed";

/* The "show advisories" preference is a tiny external store: localStorage
   + a window event so every PhotoCardFindings on the page re-reads it.
   useSyncExternalStore keeps SSR (true) and client in step without an
   effect that sets state on mount. */
function subscribeAdvisories(onChange: () => void) {
  window.addEventListener(ADVISORY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ADVISORY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readAdvisories(): boolean {
  try {
    return window.localStorage.getItem(ADVISORY_KEY) !== "0";
  } catch {
    return true;
  }
}
function readAdvisoriesServer(): boolean {
  return true;
}

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
  const includeAdvisories = useSyncExternalStore(
    subscribeAdvisories,
    readAdvisories,
    readAdvisoriesServer,
  );

  // Persist + notify every other PhotoCardFindings on the page.
  const toggle = () => {
    const next = !includeAdvisories;
    try {
      window.localStorage.setItem(ADVISORY_KEY, next ? "1" : "0");
    } catch {
      /* localStorage unavailable — the event still flips the others */
    }
    window.dispatchEvent(new CustomEvent(ADVISORY_EVENT));
  };

  if (findings.length === 0) {
    return (
      <p className="px-4 pb-3 text-xs text-[var(--fg-subtle)]">
        No findings on this photo.
      </p>
    );
  }

  // Sort High → Medium → Low. We keep ALL findings in the array but apply the
  // visibility filter at render time so findings retain their numbering
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
          <span className="inline-flex items-center gap-1 text-[var(--fg-subtle)]">
            {includeAdvisories
              ? `Showing all · ${advisoryCount} advisor${advisoryCount === 1 ? "y" : "ies"}`
              : `Hiding ${advisoryCount} advisor${advisoryCount === 1 ? "y" : "ies"}`}
            <HelpTip title="Advisory" side="bottom">
              Low-severity notes worth fixing but unlikely to be cited on a
              survey. Hidden by default so the real deficiencies stand out.
            </HelpTip>
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
          // (findings always #1..#N regardless of advisory toggle).
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
  // Shared palette — Medium used to render identical to High here.
  const m = severityColor(severity);
  const label = severity === "Low" ? "Advisory" : severity;
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={{ background: m.bg, color: m.fg }}
      title={label}
      aria-label={label}
    >
      {m.letter}
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
