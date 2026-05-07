"use client";

import { useEffect, useRef, useState } from "react";

export type Bbox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Props = {
  /** Signed URL of the photo to draw on. */
  src: string;
  /** Initial bbox (normalized 0..1). If set, the picker shows it on mount. */
  initial?: Bbox | null;
  /** Called every time the box changes — final value on mouse-up. */
  onChange: (bbox: Bbox | null) => void;
};

// 8-directional resize handles + body for moving + empty for drawing new.
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Mode =
  | { kind: "idle" }
  | { kind: "drawing"; start: Pt }
  | { kind: "moving"; pointerStart: Pt; bboxStart: Bbox }
  | { kind: "resizing"; handle: Handle; bboxStart: Bbox };

type Pt = { x: number; y: number };

/**
 * Click-and-drag bbox picker with move + resize.
 *
 * Behavior:
 *   - No box yet → click-drag to draw a new one.
 *   - Box exists, click inside it → drag to move.
 *   - Box exists, click a handle → drag to resize from that corner / edge.
 *   - Click outside the box (and not on a handle) → start drawing a new
 *     box; the old one is replaced.
 *
 * Handles are sized 14px so they are tappable on tablets and touch screens.
 * All coords are normalized to [0, 1] so they round-trip cleanly with the
 * findings.bbox_x1..y2 columns and the PhotoWithBoxes renderer.
 */
export function BboxPicker({ src, initial, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bbox, setBbox] = useState<Bbox | null>(initial ?? null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const draftRef = useRef<Bbox | null>(initial ?? null);

  // --- Coordinate helpers ---
  function pointToNorm(clientX: number, clientY: number): Pt | null {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01((clientY - r.top) / r.height),
    };
  }

  function pickHandleAt(p: Pt, b: Bbox): Handle | null {
    // Hit-test handles in normalized space, with a tolerance based on the
    // container size. We'll use 0.025 (~2.5% of width) which feels generous.
    const tol = 0.03;
    const corners: Array<[Handle, Pt]> = [
      ["nw", { x: b.x1, y: b.y1 }],
      ["n",  { x: (b.x1 + b.x2) / 2, y: b.y1 }],
      ["ne", { x: b.x2, y: b.y1 }],
      ["e",  { x: b.x2, y: (b.y1 + b.y2) / 2 }],
      ["se", { x: b.x2, y: b.y2 }],
      ["s",  { x: (b.x1 + b.x2) / 2, y: b.y2 }],
      ["sw", { x: b.x1, y: b.y2 }],
      ["w",  { x: b.x1, y: (b.y1 + b.y2) / 2 }],
    ];
    for (const [name, c] of corners) {
      if (Math.abs(p.x - c.x) <= tol && Math.abs(p.y - c.y) <= tol) {
        return name;
      }
    }
    return null;
  }

  function pointInside(p: Pt, b: Bbox): boolean {
    return p.x > b.x1 && p.x < b.x2 && p.y > b.y1 && p.y < b.y2;
  }

  // --- Pointer event entry point ---
  function onPointerDown(clientX: number, clientY: number) {
    const p = pointToNorm(clientX, clientY);
    if (!p) return;

    // If a bbox already exists, check for handle hit-test first, then body.
    if (bbox) {
      const handle = pickHandleAt(p, bbox);
      if (handle) {
        setMode({ kind: "resizing", handle, bboxStart: bbox });
        return;
      }
      if (pointInside(p, bbox)) {
        setMode({ kind: "moving", pointerStart: p, bboxStart: bbox });
        return;
      }
    }

    // Empty area or outside box — start a new draw.
    const seed: Bbox = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    setBbox(seed);
    draftRef.current = seed;
    setMode({ kind: "drawing", start: p });
  }

  function onPointerMove(clientX: number, clientY: number) {
    const p = pointToNorm(clientX, clientY);
    if (!p) return;

    if (mode.kind === "drawing") {
      const next: Bbox = normalize(mode.start, p);
      setBbox(next);
      draftRef.current = next;
      return;
    }

    if (mode.kind === "moving") {
      const dx = p.x - mode.pointerStart.x;
      const dy = p.y - mode.pointerStart.y;
      const w = mode.bboxStart.x2 - mode.bboxStart.x1;
      const h = mode.bboxStart.y2 - mode.bboxStart.y1;
      let nx1 = mode.bboxStart.x1 + dx;
      let ny1 = mode.bboxStart.y1 + dy;
      // Clamp so the box stays inside [0, 1].
      nx1 = Math.max(0, Math.min(1 - w, nx1));
      ny1 = Math.max(0, Math.min(1 - h, ny1));
      const next: Bbox = { x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h };
      setBbox(next);
      draftRef.current = next;
      return;
    }

    if (mode.kind === "resizing") {
      const next = applyResize(mode.bboxStart, mode.handle, p);
      setBbox(next);
      draftRef.current = next;
      return;
    }
  }

  function onPointerUp() {
    if (mode.kind === "idle") return;

    const b = draftRef.current;
    if (b) {
      // Reject tiny accidental boxes (< 1% area on either side).
      if (b.x2 - b.x1 < 0.01 || b.y2 - b.y1 < 0.01) {
        setBbox(null);
        draftRef.current = null;
        onChange(null);
      } else {
        // Ensure x1<x2 and y1<y2 (resize/draw could have flipped).
        const tidy: Bbox = {
          x1: Math.min(b.x1, b.x2),
          y1: Math.min(b.y1, b.y2),
          x2: Math.max(b.x1, b.x2),
          y2: Math.max(b.y1, b.y2),
        };
        setBbox(tidy);
        draftRef.current = tidy;
        onChange(tidy);
      }
    }
    setMode({ kind: "idle" });
  }

  // Mouse handlers (window-level so a drag that exits the picker still tracks).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (mode.kind !== "idle") onPointerMove(e.clientX, e.clientY);
    };
    const onUp = () => {
      if (mode.kind !== "idle") onPointerUp();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind]);

  // Touch handlers
  useEffect(() => {
    const onTMove = (e: TouchEvent) => {
      if (mode.kind === "idle" || e.touches.length === 0) return;
      e.preventDefault();
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTEnd = () => {
      if (mode.kind !== "idle") onPointerUp();
    };
    window.addEventListener("touchmove", onTMove, { passive: false });
    window.addEventListener("touchend", onTEnd);
    window.addEventListener("touchcancel", onTEnd);
    return () => {
      window.removeEventListener("touchmove", onTMove);
      window.removeEventListener("touchend", onTEnd);
      window.removeEventListener("touchcancel", onTEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind]);

  function clear() {
    setBbox(null);
    draftRef.current = null;
    setMode({ kind: "idle" });
    onChange(null);
  }

  // Cursor hint based on what's under the pointer when hovering (best-effort,
  // re-evaluated on render). For mobile, this is moot — touch ignores cursor.
  function cursorForPoint(p: Pt | null): string {
    if (!p || !bbox) return "crosshair";
    const h = pickHandleAt(p, bbox);
    if (h) {
      const map: Record<Handle, string> = {
        nw: "nwse-resize",
        ne: "nesw-resize",
        sw: "nesw-resize",
        se: "nwse-resize",
        n: "ns-resize",
        s: "ns-resize",
        e: "ew-resize",
        w: "ew-resize",
      };
      return map[h];
    }
    if (pointInside(p, bbox)) return "move";
    return "crosshair";
  }

  // We keep cursor dynamic via onMouseMove on the container itself (not the
  // window-level handler, which is for the active drag).
  const [cursor, setCursor] = useState<string>("crosshair");

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        onMouseMove={(e) => {
          if (mode.kind === "idle") {
            const p = pointToNorm(e.clientX, e.clientY);
            setCursor(cursorForPoint(p));
          }
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          onPointerDown(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 0) return;
          onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }}
        className="relative w-full overflow-hidden rounded-lg border border-[var(--border-strong)] bg-black"
        style={{ touchAction: "none", cursor }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="block w-full h-auto select-none"
        />
        {bbox ? (
          <>
            {/* The box outline */}
            <div
              className="pointer-events-none absolute"
              style={{
                left: `${bbox.x1 * 100}%`,
                top: `${bbox.y1 * 100}%`,
                width: `${(bbox.x2 - bbox.x1) * 100}%`,
                height: `${(bbox.y2 - bbox.y1) * 100}%`,
                border: "3px solid #f87171",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.55), 0 0 12px rgba(248,113,113,0.5)",
              }}
            />
            {/* 8 resize handles */}
            {(
              [
                ["nw", bbox.x1, bbox.y1],
                ["n",  (bbox.x1 + bbox.x2) / 2, bbox.y1],
                ["ne", bbox.x2, bbox.y1],
                ["e",  bbox.x2, (bbox.y1 + bbox.y2) / 2],
                ["se", bbox.x2, bbox.y2],
                ["s",  (bbox.x1 + bbox.x2) / 2, bbox.y2],
                ["sw", bbox.x1, bbox.y2],
                ["w",  bbox.x1, (bbox.y1 + bbox.y2) / 2],
              ] as Array<[Handle, number, number]>
            ).map(([name, hx, hy]) => (
              <div
                key={name}
                className="pointer-events-none absolute"
                style={{
                  left: `${hx * 100}%`,
                  top: `${hy * 100}%`,
                  width: 14,
                  height: 14,
                  marginLeft: -7,
                  marginTop: -7,
                  borderRadius: 3,
                  background: "#ffffff",
                  border: "2px solid #f87171",
                  boxShadow: "0 0 4px rgba(0,0,0,0.5)",
                }}
              />
            ))}
          </>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[var(--fg-subtle)]">
          {bbox
            ? `Box: ${(bbox.x1 * 100).toFixed(0)}%, ${(bbox.y1 * 100).toFixed(0)}% → ${(bbox.x2 * 100).toFixed(0)}%, ${(bbox.y2 * 100).toFixed(0)}% — drag inside to move, corners to resize`
            : "Click and drag on the photo to mark the deficiency."}
        </span>
        {bbox ? (
          <button
            type="button"
            onClick={clear}
            className="rounded-full px-2 py-0.5 text-[var(--fg-muted)] underline-offset-2 hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------- helpers (module-scope) -------------------- */

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalize(a: Pt, b: Pt): Bbox {
  return {
    x1: Math.min(a.x, b.x),
    y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x),
    y2: Math.max(a.y, b.y),
  };
}

/** Apply a resize-handle drag to the starting bbox. */
function applyResize(start: Bbox, handle: Handle, p: Pt): Bbox {
  let { x1, y1, x2, y2 } = start;
  if (handle.includes("n")) y1 = p.y;
  if (handle.includes("s")) y2 = p.y;
  if (handle.includes("w")) x1 = p.x;
  if (handle.includes("e")) x2 = p.x;
  // Allow the user to drag a handle past the opposite side (we'll tidy on
  // pointer-up). Clamp to viewport.
  return {
    x1: clamp01(x1),
    y1: clamp01(y1),
    x2: clamp01(x2),
    y2: clamp01(y2),
  };
}
