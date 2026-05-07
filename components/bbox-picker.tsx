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

/**
 * Click-and-drag bbox picker. Inspector clicks-and-drags on the photo to
 * mark where a deficiency is. Returns normalized [0,1] coordinates so they
 * line up with the existing bbox renderer (PhotoWithBoxes).
 *
 * Mouse + touch supported for tablet use.
 */
export function BboxPicker({ src, initial, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bbox, setBbox] = useState<Bbox | null>(initial ?? null);
  const [drawing, setDrawing] = useState<Bbox | null>(null);
  const draggingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  // Normalize a pointer event to [0..1] coords inside the container.
  function pointToNorm(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  function startDraw(clientX: number, clientY: number) {
    const p = pointToNorm(clientX, clientY);
    if (!p) return;
    startRef.current = p;
    draggingRef.current = true;
    setDrawing({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  }

  function moveDraw(clientX: number, clientY: number) {
    if (!draggingRef.current || !startRef.current) return;
    const p = pointToNorm(clientX, clientY);
    if (!p) return;
    const s = startRef.current;
    setDrawing({
      x1: Math.min(s.x, p.x),
      y1: Math.min(s.y, p.y),
      x2: Math.max(s.x, p.x),
      y2: Math.max(s.y, p.y),
    });
  }

  function endDraw() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (drawing) {
      // Reject tiny accidental clicks (< 0.5% area).
      const w = drawing.x2 - drawing.x1;
      const h = drawing.y2 - drawing.y1;
      if (w < 0.01 || h < 0.01) {
        setDrawing(null);
        return;
      }
      setBbox(drawing);
      onChange(drawing);
    }
    setDrawing(null);
  }

  // Mouse handlers
  useEffect(() => {
    const onMove = (e: MouseEvent) => moveDraw(e.clientX, e.clientY);
    const onUp = () => endDraw();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);

  // Touch handlers
  useEffect(() => {
    const onTMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      e.preventDefault();
      moveDraw(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTEnd = () => endDraw();
    window.addEventListener("touchmove", onTMove, { passive: false });
    window.addEventListener("touchend", onTEnd);
    window.addEventListener("touchcancel", onTEnd);
    return () => {
      window.removeEventListener("touchmove", onTMove);
      window.removeEventListener("touchend", onTEnd);
      window.removeEventListener("touchcancel", onTEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);

  function clear() {
    setBbox(null);
    setDrawing(null);
    onChange(null);
  }

  const showBox = drawing ?? bbox;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          e.preventDefault();
          startDraw(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 0) return;
          startDraw(e.touches[0].clientX, e.touches[0].clientY);
        }}
        className="relative w-full overflow-hidden rounded-lg border border-[var(--border-strong)] bg-black"
        style={{ touchAction: "none", cursor: "crosshair" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="block w-full h-auto select-none"
        />
        {showBox ? (
          <div
            className="pointer-events-none absolute"
            style={{
              left: `${showBox.x1 * 100}%`,
              top: `${showBox.y1 * 100}%`,
              width: `${(showBox.x2 - showBox.x1) * 100}%`,
              height: `${(showBox.y2 - showBox.y1) * 100}%`,
              border: "3px solid #f87171",
              boxShadow:
                "0 0 0 1px rgba(0,0,0,0.55), 0 0 12px rgba(248,113,113,0.5)",
            }}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[var(--fg-subtle)]">
          {bbox
            ? `Box: ${(bbox.x1 * 100).toFixed(0)}%, ${(bbox.y1 * 100).toFixed(0)}% → ${(bbox.x2 * 100).toFixed(0)}%, ${(bbox.y2 * 100).toFixed(0)}%`
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
