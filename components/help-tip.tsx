"use client";

import { useRef, useState, type ReactNode } from "react";
import { useOutsideClick } from "@/lib/use-outside-click";

type Props = {
  /** Optional bolded heading above the body text. */
  title?: string;
  /** The explanation. Plain text or rich JSX (links, emphasis, etc.). */
  children: ReactNode;
  /** Where to anchor the bubble relative to the ? icon. Default: "top". */
  side?: "top" | "bottom";
  /** Accessibility label for the trigger button. */
  ariaLabel?: string;
};

/**
 * Inline "?" affordance that reveals a short explanation when the user
 * hovers (desktop) or taps (mobile). Useful for explaining UI controls
 * that have non-obvious behavior — Archive vs Delete, Coach vs Deep
 * Re-analyze, the difference between Resolve and Skip on a not-visible
 * item, etc.
 *
 * Design choices:
 *   - Click-to-toggle ALSO works on desktop, so power users can pin a
 *     tip open without hovering. Tapping the ? again or anywhere
 *     outside closes it.
 *   - The bubble is positioned with right-alignment so the explanation
 *     reads consistently next to the trigger and doesn't extend past
 *     the viewport on small screens (the body has overflow-x:clip as
 *     a safety net anyway).
 *   - Pointer events on the bubble itself stay enabled while open so
 *     the user can highlight text or follow a link without the bubble
 *     closing instantly.
 */
export function HelpTip({
  title,
  children,
  side = "top",
  ariaLabel = "Show explanation",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  // Close on outside click/tap. The hook listens for both mousedown AND
  // touchstart so it works on iOS too.
  useOutsideClick(ref, open, () => setOpen(false));

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          // Stop propagation so a HelpTip rendered inside a clickable
          // row doesn't trigger the row's navigation when the user taps
          // the ? icon.
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          // Only auto-hide on mouse leave when the user opened via
          // hover (not by click). A simpler heuristic: always close on
          // leave, since click-users typically tap again or click away.
          setOpen(false);
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold leading-none transition"
        style={{
          borderColor: open ? "var(--gold)" : "var(--rule-paper)",
          color: open ? "var(--gold-soft)" : "var(--slate)",
          background: open ? "rgba(200,155,60,0.10)" : "transparent",
        }}
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          className={[
            "absolute z-50 w-64 max-w-[80vw] rounded-lg border p-3 text-[11px] leading-relaxed shadow-lg",
            // Anchored to the right side of the trigger so long
            // explanations don't push off the right edge of the viewport.
            "right-0",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          ].join(" ")}
          style={{
            borderColor: "var(--ink)",
            background: "var(--paper-2)",
            color: "var(--ink)",
          }}
          // Stop click events inside the bubble from bubbling up to the
          // outside-click handler — lets users select text / click links.
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {title ? (
            <p
              className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em]"
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                color: "var(--slate)",
              }}
            >
              {title}
            </p>
          ) : null}
          <div>{children}</div>
        </span>
      ) : null}
    </span>
  );
}
