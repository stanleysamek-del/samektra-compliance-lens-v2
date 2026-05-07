"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  updatePhotoAnnotations,
  type Annotation,
} from "@/app/inspections/[id]/photos/[photoId]/actions";

type Tool = "select" | "rect" | "circle" | "arrow" | "text";
type Pt = { x: number; y: number };
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Mode =
  | { kind: "idle" }
  | { kind: "drawing"; start: Pt }
  | { kind: "moving"; pointerStart: Pt; shapeStart: Annotation }
  | { kind: "resizing"; handle: Handle; shapeStart: Annotation };

const COLORS = [
  { hex: "#f87171", label: "Red" },
  { hex: "#fb923c", label: "Orange" },
  { hex: "#fbbf24", label: "Yellow" },
  { hex: "#34d399", label: "Green" },
  { hex: "#60a5fa", label: "Blue" },
  { hex: "#ffffff", label: "White" },
];

type Props = {
  src: string;
  inspectionId: string;
  photoId: string;
  initial: Annotation[];
};

export function PhotoAnnotator({
  src,
  inspectionId,
  photoId,
  initial,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>(initial);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>("#f87171");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // ---- Helpers ----
  function pointToNorm(clientX: number, clientY: number): Pt | null {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01((clientY - r.top) / r.height),
    };
  }

  function selectedShape(): Annotation | null {
    return annotations.find((a) => a.id === selectedId) ?? null;
  }

  function pickHandleAt(p: Pt, a: Annotation): Handle | null {
    const tol = 0.025;
    const corners: Array<[Handle, number, number]> = [
      ["nw", a.x1, a.y1],
      ["n",  (a.x1 + a.x2) / 2, a.y1],
      ["ne", a.x2, a.y1],
      ["e",  a.x2, (a.y1 + a.y2) / 2],
      ["se", a.x2, a.y2],
      ["s",  (a.x1 + a.x2) / 2, a.y2],
      ["sw", a.x1, a.y2],
      ["w",  a.x1, (a.y1 + a.y2) / 2],
    ];
    for (const [name, hx, hy] of corners) {
      if (Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol) return name;
    }
    return null;
  }

  function pointInShape(p: Pt, a: Annotation): boolean {
    const minX = Math.min(a.x1, a.x2);
    const maxX = Math.max(a.x1, a.x2);
    const minY = Math.min(a.y1, a.y2);
    const maxY = Math.max(a.y1, a.y2);
    return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  }

  function topShapeAt(p: Pt): Annotation | null {
    // Iterate in reverse so the most recently drawn (top of z-order) wins.
    for (let i = annotations.length - 1; i >= 0; i--) {
      if (pointInShape(p, annotations[i])) return annotations[i];
    }
    return null;
  }

  // ---- Pointer entry ----
  function onDown(clientX: number, clientY: number) {
    const p = pointToNorm(clientX, clientY);
    if (!p) return;

    if (tool === "select") {
      // Try handles on the selected shape first.
      const sel = selectedShape();
      if (sel) {
        const handle = pickHandleAt(p, sel);
        if (handle) {
          setMode({ kind: "resizing", handle, shapeStart: sel });
          return;
        }
      }
      // Then try clicking any shape (hit-test top-down).
      const hit = topShapeAt(p);
      if (hit) {
        setSelectedId(hit.id);
        setMode({ kind: "moving", pointerStart: p, shapeStart: hit });
        return;
      }
      // Click on empty area: deselect.
      setSelectedId(null);
      return;
    }

    // A drawing tool is active — start a new shape.
    if (tool === "text") {
      const text = window.prompt("Text:");
      if (!text || !text.trim()) return;
      const newA: Annotation = {
        id: makeId(),
        type: "text",
        color,
        x1: p.x,
        y1: p.y,
        x2: Math.min(1, p.x + 0.18),
        y2: Math.min(1, p.y + 0.04),
        text: text.trim(),
      };
      setAnnotations([...annotations, newA]);
      setSelectedId(newA.id);
      setTool("select");
      return;
    }

    const newA: Annotation = {
      id: makeId(),
      type: tool,
      color,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
    };
    setAnnotations([...annotations, newA]);
    setSelectedId(newA.id);
    setMode({ kind: "drawing", start: p });
  }

  function onMove(clientX: number, clientY: number) {
    const p = pointToNorm(clientX, clientY);
    if (!p) return;

    if (mode.kind === "drawing") {
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === selectedId ? { ...a, x2: p.x, y2: p.y } : a,
        ),
      );
      return;
    }

    if (mode.kind === "moving") {
      const dx = p.x - mode.pointerStart.x;
      const dy = p.y - mode.pointerStart.y;
      const w = mode.shapeStart.x2 - mode.shapeStart.x1;
      const h = mode.shapeStart.y2 - mode.shapeStart.y1;
      let nx1 = mode.shapeStart.x1 + dx;
      let ny1 = mode.shapeStart.y1 + dy;
      // Clamp inside [0,1].
      nx1 = Math.max(Math.min(0, w), Math.min(1 - Math.max(0, w), nx1));
      ny1 = Math.max(Math.min(0, h), Math.min(1 - Math.max(0, h), ny1));
      setAnnotations((prev) =>
        prev.map((a) =>
          a.id === selectedId
            ? { ...a, x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h }
            : a,
        ),
      );
      return;
    }

    if (mode.kind === "resizing") {
      const next = applyResize(mode.shapeStart, mode.handle, p);
      setAnnotations((prev) =>
        prev.map((a) => (a.id === selectedId ? next : a)),
      );
      return;
    }
  }

  function onUp() {
    if (mode.kind === "idle") return;
    // Clean up drawn shapes that ended up too small.
    setAnnotations((prev) =>
      prev.flatMap((a) => {
        if (a.id !== selectedId) return [a];
        // Don't reject text shapes by size.
        if (a.type === "text") return [a];
        const dw = Math.abs(a.x2 - a.x1);
        const dh = Math.abs(a.y2 - a.y1);
        if (dw < 0.01 && dh < 0.01) return [];
        // Tidy so x1<x2, y1<y2 for rect/circle (arrow keeps direction).
        if (a.type === "rect" || a.type === "circle") {
          return [{
            ...a,
            x1: Math.min(a.x1, a.x2),
            y1: Math.min(a.y1, a.y2),
            x2: Math.max(a.x1, a.x2),
            y2: Math.max(a.y1, a.y2),
          }];
        }
        return [a];
      }),
    );
    setMode({ kind: "idle" });
  }

  // Window-level move/up listeners during a drag.
  useEffect(() => {
    const m = (e: MouseEvent) => mode.kind !== "idle" && onMove(e.clientX, e.clientY);
    const u = () => mode.kind !== "idle" && onUp();
    window.addEventListener("mousemove", m);
    window.addEventListener("mouseup", u);
    return () => {
      window.removeEventListener("mousemove", m);
      window.removeEventListener("mouseup", u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, selectedId]);

  // Touch listeners
  useEffect(() => {
    const m = (e: TouchEvent) => {
      if (mode.kind === "idle" || e.touches.length === 0) return;
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const u = () => mode.kind !== "idle" && onUp();
    window.addEventListener("touchmove", m, { passive: false });
    window.addEventListener("touchend", u);
    window.addEventListener("touchcancel", u);
    return () => {
      window.removeEventListener("touchmove", m);
      window.removeEventListener("touchend", u);
      window.removeEventListener("touchcancel", u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, selectedId]);

  // Keyboard: Delete / Backspace removes selected.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't hijack while typing.
        const tag = (document.activeElement?.tagName ?? "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function deleteSelected() {
    if (!selectedId) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  }

  function changeSelectedColor(c: string) {
    setColor(c);
    if (!selectedId) return;
    setAnnotations((prev) =>
      prev.map((a) => (a.id === selectedId ? { ...a, color: c } : a)),
    );
  }

  function editSelectedText() {
    const sel = selectedShape();
    if (!sel || sel.type !== "text") return;
    const next = window.prompt("Text:", sel.text ?? "");
    if (next == null) return;
    setAnnotations((prev) =>
      prev.map((a) => (a.id === selectedId ? { ...a, text: next } : a)),
    );
  }

  function clearAll() {
    if (!confirm("Clear all annotations on this photo?")) return;
    setAnnotations([]);
    setSelectedId(null);
  }

  function save() {
    startTransition(async () => {
      await updatePhotoAnnotations(photoId, inspectionId, annotations);
      setSavedAt(Date.now());
    });
  }

  const sel = selectedShape();

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
        <ToolBtn label="Select" active={tool === "select"} onClick={() => setTool("select")}>
          <SelectIcon />
        </ToolBtn>
        <ToolBtn label="Rectangle" active={tool === "rect"} onClick={() => setTool("rect")}>
          <RectIcon />
        </ToolBtn>
        <ToolBtn label="Circle" active={tool === "circle"} onClick={() => setTool("circle")}>
          <CircleIcon />
        </ToolBtn>
        <ToolBtn label="Arrow" active={tool === "arrow"} onClick={() => setTool("arrow")}>
          <ArrowIcon />
        </ToolBtn>
        <ToolBtn label="Text" active={tool === "text"} onClick={() => setTool("text")}>
          <TextIcon />
        </ToolBtn>

        <span className="mx-1 h-6 w-px bg-[var(--border)]" />

        {COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.label}
            onClick={() => changeSelectedColor(c.hex)}
            className="h-6 w-6 rounded-full border-2 transition"
            style={{
              background: c.hex,
              borderColor: color === c.hex ? "#ffffff" : "transparent",
              boxShadow: color === c.hex ? "0 0 0 2px rgba(20,184,166,0.6)" : "none",
            }}
            aria-pressed={color === c.hex}
          />
        ))}

        <span className="mx-1 h-6 w-px bg-[var(--border)]" />

        <button
          type="button"
          disabled={!sel}
          onClick={deleteSelected}
          className="rounded-md px-2 py-1 text-xs font-medium text-[#fca5a5] disabled:opacity-30 hover:bg-[rgba(239,68,68,0.08)]"
        >
          Delete
        </button>
        {sel && sel.type === "text" ? (
          <button
            type="button"
            onClick={editSelectedText}
            className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] hover:bg-white/5 hover:text-[var(--fg)]"
          >
            Edit text
          </button>
        ) : null}
        <button
          type="button"
          onClick={clearAll}
          disabled={annotations.length === 0}
          className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] disabled:opacity-30 hover:bg-white/5 hover:text-[var(--fg)]"
        >
          Clear all
        </button>

        <span className="ml-auto flex items-center gap-2 text-[11px] text-[var(--fg-subtle)]">
          {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : null}
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="cl-btn-accent !px-3 !py-1 !text-xs"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          e.preventDefault();
          onDown(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 0) return;
          onDown(e.touches[0].clientX, e.touches[0].clientY);
        }}
        className="relative w-full overflow-hidden rounded-lg border border-[var(--border-strong)] bg-black"
        style={{
          touchAction: "none",
          cursor: tool === "select" ? "default" : "crosshair",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="block w-full h-auto select-none"
        />
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          <defs>
            {COLORS.map((c) => (
              <marker
                key={c.hex}
                id={`arrowhead-${c.hex.slice(1)}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c.hex} />
              </marker>
            ))}
          </defs>
          {annotations.map((a) => (
            <ShapeSvg key={a.id} a={a} selected={a.id === selectedId} />
          ))}
        </svg>

        {/* Selected-shape resize handles (HTML overlay) */}
        {sel ? <ResizeHandles a={sel} /> : null}
      </div>

      <p className="text-[11px] text-[var(--fg-subtle)]">
        Pick a tool, then click and drag on the photo. Switch to Select to
        click a shape and drag inside to move, or grab a corner to resize.
        Delete or Backspace removes the selected shape. Save persists to the
        photo so it appears in the report and PDF export.
      </p>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function ShapeSvg({ a, selected }: { a: Annotation; selected: boolean }) {
  const stroke = a.color;
  const strokeWidth = selected ? 0.005 : 0.0035;
  const minX = Math.min(a.x1, a.x2);
  const maxX = Math.max(a.x1, a.x2);
  const minY = Math.min(a.y1, a.y2);
  const maxY = Math.max(a.y1, a.y2);
  const w = maxX - minX;
  const h = maxY - minY;

  if (a.type === "rect") {
    return (
      <rect
        x={minX}
        y={minY}
        width={w}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        style={{ filter: selected ? "drop-shadow(0 0 4px rgba(255,255,255,0.6))" : undefined }}
      />
    );
  }
  if (a.type === "circle") {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = w / 2;
    const ry = h / 2;
    return (
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (a.type === "arrow") {
    return (
      <line
        x1={a.x1}
        y1={a.y1}
        x2={a.x2}
        y2={a.y2}
        stroke={stroke}
        strokeWidth={strokeWidth * 1.4}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        markerEnd={`url(#arrowhead-${a.color.slice(1)})`}
      />
    );
  }
  if (a.type === "text") {
    const cx = (a.x1 + a.x2) / 2;
    const cy = (a.y1 + a.y2) / 2;
    const fontSize = Math.max(0.018, Math.abs(a.y2 - a.y1));
    return (
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={stroke}
        fontSize={fontSize}
        fontFamily="system-ui, sans-serif"
        fontWeight={600}
        style={{
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.7)",
          strokeWidth: 0.002,
          strokeLinejoin: "round",
        }}
      >
        {(a.text ?? "").slice(0, 80)}
      </text>
    );
  }
  return null;
}

function ResizeHandles({ a }: { a: Annotation }) {
  const handles: Array<[Handle, number, number]> = [
    ["nw", a.x1, a.y1],
    ["n",  (a.x1 + a.x2) / 2, a.y1],
    ["ne", a.x2, a.y1],
    ["e",  a.x2, (a.y1 + a.y2) / 2],
    ["se", a.x2, a.y2],
    ["s",  (a.x1 + a.x2) / 2, a.y2],
    ["sw", a.x1, a.y2],
    ["w",  a.x1, (a.y1 + a.y2) / 2],
  ];
  return (
    <>
      {handles.map(([name, x, y]) => (
        <div
          key={name}
          className="pointer-events-none absolute"
          style={{
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: 2,
            background: "#ffffff",
            border: `2px solid ${a.color}`,
            boxShadow: "0 0 4px rgba(0,0,0,0.55)",
          }}
        />
      ))}
    </>
  );
}

function ToolBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={[
        "flex h-8 w-8 items-center justify-center rounded-md border transition",
        active
          ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
          : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/5 hover:text-[var(--fg)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/* ---------- Icons ---------- */

function SelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m4 4 6 16 2-6 6-2L4 4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function RectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function CircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 19 19 5M19 5h-7M19 5v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 6h14M12 6v14M9 20h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- helpers ---------- */

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function applyResize(start: Annotation, handle: Handle, p: Pt): Annotation {
  let { x1, y1, x2, y2 } = start;
  if (handle.includes("n")) y1 = p.y;
  if (handle.includes("s")) y2 = p.y;
  if (handle.includes("w")) x1 = p.x;
  if (handle.includes("e")) x2 = p.x;
  return {
    ...start,
    x1: clamp01(x1),
    y1: clamp01(y1),
    x2: clamp01(x2),
    y2: clamp01(y2),
  };
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 12);
}
