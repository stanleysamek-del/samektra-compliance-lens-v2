"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  updatePhotoState,
  type Annotation,
  type FindingBboxPatch,
} from "@/app/inspections/[id]/photos/[photoId]/actions";

/* =====================================================================
 *  Unified photo viewer + annotation editor.
 *
 *  - View mode (default): shows the photo with AI-finding bboxes (red,
 *    numbered badges) and inspector annotations (rect/circle/arrow/text)
 *    overlaid on top. Click "Annotate" to enter edit mode.
 *  - Edit mode: toolbar appears, every shape (AI bbox AND annotation)
 *    becomes selectable/movable/resizable. New shapes can be drawn with
 *    rect/circle/arrow/text tools. Save persists annotations + per-finding
 *    bbox updates in one round-trip.
 *
 *  AI bboxes keep their severity color (red) and finding badge number.
 *  Their handles are visible only when selected. Deleting an AI bbox
 *  in edit mode CLEARS its bbox columns on the finding (the finding
 *  itself is preserved — to delete the finding, use the FindingCard).
 * ===================================================================== */

export type Bbox = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  index: number;
  severity: "Low" | "Medium" | "High";
  title: string;
  /** Stroke-width override (1 thin, 2 medium, 3 thick). Default 2. */
  strokeWidth?: number;
  /** Color override (hex). Undefined means use the severity default. */
  color?: string;
  /** Fill override (hex). Undefined means no fill. Rendered at 25% opacity. */
  fill?: string;
};

type Tool = "select" | "rect" | "circle" | "arrow" | "text";
type Pt = { x: number; y: number };
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type EditableShape =
  | (Annotation & { kind: "annotation" })
  | {
      kind: "bbox";
      id: string;          // findingId
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      severity: "Low" | "Medium" | "High";
      index: number;
      title: string;
      strokeWidth?: number; // mirrors annotation strokeWidth
      color?: string;       // optional color override; undefined = severity default
      fill?: string;        // optional fill (hex); undefined = no fill
      cleared?: boolean;   // user wants to clear this bbox on save
    };

type Mode =
  | { kind: "idle" }
  | { kind: "drawing"; start: Pt }
  | { kind: "moving"; pointerStart: Pt; shapeStart: EditableShape }
  | { kind: "resizing"; handle: Handle; shapeStart: EditableShape };

const COLORS = [
  { hex: "#f87171", label: "Red" },
  { hex: "#fb923c", label: "Orange" },
  { hex: "#b8762a", label: "Yellow" },
  { hex: "#34d399", label: "Green" },
  { hex: "#60a5fa", label: "Blue" },
  { hex: "#ffffff", label: "White" },
];

const SEVERITY_COLOR: Record<"Low" | "Medium" | "High", string> = {
  High: "#f87171",
  Medium: "#f87171",
  Low: "#34d399",
};

type Props = {
  src: string;
  inspectionId: string;
  photoId: string;
  bboxes: Bbox[];
  annotations: Annotation[];
};

export function PhotoEditor({
  src,
  inspectionId,
  photoId,
  bboxes,
  annotations,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // While editing we render as a fullscreen overlay with the toolbar
  // pinned to the bottom — the mobile-thumb-zone-friendly pattern that
  // every photo annotation app converges on. Lock body scroll so the
  // page doesn't move underneath, and ESC cancels back to view mode.
  useEffect(() => {
    if (!editing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancelEditing();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
    // cancelEditing is stable (function declaration); intentionally omit
    // it from deps so the lock setup runs exactly once per editing toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Build the "shapes" working set when editing starts (we keep view-mode and
  // edit-mode state separate so cancelling fully discards drafts).
  const initialShapes: EditableShape[] = [
    ...bboxes.map((b) => ({
      kind: "bbox" as const,
      id: b.id,
      x1: b.x1,
      y1: b.y1,
      x2: b.x2,
      y2: b.y2,
      severity: b.severity,
      index: b.index,
      title: b.title,
      strokeWidth: typeof b.strokeWidth === "number" ? b.strokeWidth : 2,
      color: typeof b.color === "string" ? b.color : undefined,
      fill: typeof b.fill === "string" ? b.fill : undefined,
    })),
    ...annotations.map((a) => ({ kind: "annotation" as const, ...a })),
  ];

  const [shapes, setShapes] = useState<EditableShape[]>(initialShapes);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>("#f87171");
  /** Line thickness multiplier 1 (thin) | 2 (medium) | 3 (thick). */
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  /** Text size multiplier 1 (small) | 2 (medium) | 3 (large). */
  const [fontSize, setFontSize] = useState<number>(2);
  /** Fill color (hex). undefined means no-fill. */
  const [fill, setFill] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEditing() {
    setShapes(initialShapes);
    setEditing(true);
    setSelectedId(null);
    setTool("select");
  }
  function cancelEditing() {
    setEditing(false);
    setSelectedId(null);
    setMode({ kind: "idle" });
  }
  function saveAndExit() {
    // Diff bboxes vs original to determine which findings need updates.
    const original = new Map<string, Bbox>(bboxes.map((b) => [b.id, b]));
    const bboxUpdates: FindingBboxPatch[] = [];
    const stillPresent = new Set<string>();
    for (const s of shapes) {
      if (s.kind !== "bbox") continue;
      stillPresent.add(s.id);
      if (s.cleared) {
        bboxUpdates.push({ findingId: s.id, bbox: null });
        continue;
      }
      const o = original.get(s.id);
      if (!o) continue;
      const coordChanged =
        Math.abs(o.x1 - s.x1) > 1e-4 ||
        Math.abs(o.y1 - s.y1) > 1e-4 ||
        Math.abs(o.x2 - s.x2) > 1e-4 ||
        Math.abs(o.y2 - s.y2) > 1e-4;
      const swChanged =
        (o.strokeWidth ?? 2) !== (s.strokeWidth ?? 2);
      const colorChanged = (o.color ?? undefined) !== (s.color ?? undefined);
      const fillChanged = (o.fill ?? undefined) !== (s.fill ?? undefined);
      if (coordChanged || swChanged || colorChanged || fillChanged) {
        bboxUpdates.push({
          findingId: s.id,
          bbox: coordChanged
            ? { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }
            : { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 },
          strokeWidth: swChanged ? s.strokeWidth : undefined,
          color: colorChanged ? (s.color ?? null) : undefined,
          fill: fillChanged ? (s.fill ?? null) : undefined,
        });
      }
    }
    // Bboxes that were entirely removed from `shapes` array → clear too.
    for (const b of bboxes) {
      if (!stillPresent.has(b.id)) {
        bboxUpdates.push({ findingId: b.id, bbox: null });
      }
    }

    const ann = shapes
      .filter((s): s is Annotation & { kind: "annotation" } => s.kind === "annotation")
      .map(({ kind: _kind, ...a }) => a);

    startTransition(async () => {
      await updatePhotoState(photoId, inspectionId, ann, bboxUpdates);
      setEditing(false);
      setSelectedId(null);
      setMode({ kind: "idle" });
    });
  }

  /* ---------- coordinate helpers ---------- */

  function pointToNorm(clientX: number, clientY: number): Pt | null {
    const el = containerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01((clientY - r.top) / r.height),
    };
  }

  function pickHandleAt(p: Pt, s: EditableShape): Handle | null {
    const tol = 0.025;
    const corners: Array<[Handle, number, number]> = [
      ["nw", s.x1, s.y1],
      ["n",  (s.x1 + s.x2) / 2, s.y1],
      ["ne", s.x2, s.y1],
      ["e",  s.x2, (s.y1 + s.y2) / 2],
      ["se", s.x2, s.y2],
      ["s",  (s.x1 + s.x2) / 2, s.y2],
      ["sw", s.x1, s.y2],
      ["w",  s.x1, (s.y1 + s.y2) / 2],
    ];
    for (const [name, hx, hy] of corners) {
      if (Math.abs(p.x - hx) <= tol && Math.abs(p.y - hy) <= tol) return name;
    }
    return null;
  }

  function pointInShape(p: Pt, s: EditableShape): boolean {
    const minX = Math.min(s.x1, s.x2);
    const maxX = Math.max(s.x1, s.x2);
    const minY = Math.min(s.y1, s.y2);
    const maxY = Math.max(s.y1, s.y2);
    return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  }

  function topShapeAt(p: Pt): EditableShape | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.kind === "bbox" && s.cleared) continue;
      if (pointInShape(p, s)) return s;
    }
    return null;
  }

  /* ---------- pointer entry (edit mode only) ---------- */

  function onDown(clientX: number, clientY: number) {
    if (!editing) return;
    const p = pointToNorm(clientX, clientY);
    if (!p) return;

    if (tool === "select") {
      const sel = shapes.find((s) => s.id === selectedId);
      if (sel) {
        const handle = pickHandleAt(p, sel);
        if (handle) {
          setMode({ kind: "resizing", handle, shapeStart: sel });
          return;
        }
      }
      const hit = topShapeAt(p);
      if (hit) {
        setSelectedId(hit.id);
        setMode({ kind: "moving", pointerStart: p, shapeStart: hit });
        return;
      }
      setSelectedId(null);
      return;
    }

    if (tool === "text") {
      const text = window.prompt("Text:");
      if (!text || !text.trim()) return;
      const newA: EditableShape = {
        kind: "annotation",
        id: makeId(),
        type: "text",
        color,
        x1: p.x,
        y1: p.y,
        x2: Math.min(1, p.x + 0.18),
        y2: Math.min(1, p.y + 0.04),
        text: text.trim(),
        strokeWidth,
        fontSize,
      };
      setShapes([...shapes, newA]);
      setSelectedId(newA.id);
      setTool("select");
      return;
    }

    const newA: EditableShape = {
      kind: "annotation",
      id: makeId(),
      type: tool,
      color,
      x1: p.x,
      y1: p.y,
      x2: p.x,
      y2: p.y,
      strokeWidth,
      fontSize,
      fill: tool === "rect" || tool === "circle" ? fill : undefined,
    };
    setShapes([...shapes, newA]);
    setSelectedId(newA.id);
    setMode({ kind: "drawing", start: p });
  }

  function onMove(clientX: number, clientY: number) {
    if (!editing) return;
    const p = pointToNorm(clientX, clientY);
    if (!p) return;

    if (mode.kind === "drawing") {
      setShapes((prev) =>
        prev.map((s) => (s.id === selectedId ? { ...s, x2: p.x, y2: p.y } : s)),
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
      nx1 = Math.max(Math.min(0, w), Math.min(1 - Math.max(0, w), nx1));
      ny1 = Math.max(Math.min(0, h), Math.min(1 - Math.max(0, h), ny1));
      setShapes((prev) =>
        prev.map((s) =>
          s.id === selectedId
            ? { ...s, x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h }
            : s,
        ),
      );
      return;
    }
    if (mode.kind === "resizing") {
      const next = applyResize(mode.shapeStart, mode.handle, p);
      setShapes((prev) =>
        prev.map((s) => (s.id === selectedId ? next : s)),
      );
      return;
    }
  }

  function onUp() {
    if (!editing || mode.kind === "idle") return;
    setShapes((prev) =>
      prev.flatMap((s) => {
        if (s.id !== selectedId) return [s];
        // Reject too-small new annotations.
        if (s.kind === "annotation" && s.type !== "text") {
          const dw = Math.abs(s.x2 - s.x1);
          const dh = Math.abs(s.y2 - s.y1);
          if (dw < 0.01 && dh < 0.01) return [];
        }
        // Tidy x1<x2, y1<y2 for rect/circle (and bboxes).
        if (s.kind === "bbox" || (s.kind === "annotation" && (s.type === "rect" || s.type === "circle"))) {
          return [{
            ...s,
            x1: Math.min(s.x1, s.x2),
            y1: Math.min(s.y1, s.y2),
            x2: Math.max(s.x1, s.x2),
            y2: Math.max(s.y1, s.y2),
          } as EditableShape];
        }
        return [s];
      }),
    );
    setMode({ kind: "idle" });
  }

  /* ---------- effects ---------- */

  useEffect(() => {
    if (!editing) return;
    const m = (e: MouseEvent) => mode.kind !== "idle" && onMove(e.clientX, e.clientY);
    const u = () => mode.kind !== "idle" && onUp();
    window.addEventListener("mousemove", m);
    window.addEventListener("mouseup", u);
    return () => {
      window.removeEventListener("mousemove", m);
      window.removeEventListener("mouseup", u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, mode.kind, selectedId]);

  useEffect(() => {
    if (!editing) return;
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
  }, [editing, mode.kind, selectedId]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const tag = (document.activeElement?.tagName ?? "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === "Escape") setSelectedId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, selectedId]);

  // When the user picks a shape, sync the editor's defaults to that shape's
  // properties so the toolbar reflects the active selection and further edits
  // continue from there.
  useEffect(() => {
    if (!editing || !selectedId) return;
    const sel = shapes.find((s) => s.id === selectedId);
    if (!sel) return;
    if (sel.kind === "annotation") {
      setColor(sel.color);
      if (typeof sel.strokeWidth === "number") setStrokeWidth(sel.strokeWidth);
      if (typeof sel.fontSize === "number") setFontSize(sel.fontSize);
      setFill(sel.fill);
    } else if (sel.kind === "bbox") {
      // Mirror thickness, color, and fill for bboxes. Color falls back to
      // the severity default; fill defaults to undefined (no fill).
      if (typeof sel.strokeWidth === "number") setStrokeWidth(sel.strokeWidth);
      setColor(sel.color ?? SEVERITY_COLOR[sel.severity]);
      setFill(sel.fill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((prev) => {
      const sel = prev.find((s) => s.id === selectedId);
      if (!sel) return prev;
      if (sel.kind === "annotation") {
        return prev.filter((s) => s.id !== selectedId);
      }
      // bbox: mark as cleared so we send {bbox: null} on save. Keep the row
      // visible (faded) so the user can undo by re-drawing on top of it.
      return prev.map((s) =>
        s.id === selectedId ? ({ ...s, cleared: true } as EditableShape) : s,
      );
    });
    setSelectedId(null);
  }

  function changeSelectedColor(c: string) {
    setColor(c);
    if (!selectedId) return;
    setShapes((prev) =>
      prev.map((s) =>
        s.id === selectedId ? ({ ...s, color: c } as EditableShape) : s,
      ),
    );
  }

  function changeSelectedStrokeWidth(sw: number) {
    setStrokeWidth(sw);
    if (!selectedId) return;
    setShapes((prev) =>
      prev.map((s) =>
        s.id === selectedId ? ({ ...s, strokeWidth: sw } as EditableShape) : s,
      ),
    );
  }

  function changeSelectedFontSize(fs: number) {
    setFontSize(fs);
    if (!selectedId) return;
    setShapes((prev) =>
      prev.map((s) =>
        s.id === selectedId && s.kind === "annotation"
          ? { ...s, fontSize: fs }
          : s,
      ),
    );
  }

  function changeSelectedFill(f: string | undefined) {
    setFill(f);
    if (!selectedId) return;
    setShapes((prev) =>
      prev.map((s) => {
        if (s.id !== selectedId) return s;
        if (s.kind === "bbox") {
          return { ...s, fill: f } as EditableShape;
        }
        if (s.kind === "annotation" && (s.type === "rect" || s.type === "circle")) {
          return { ...s, fill: f };
        }
        return s;
      }),
    );
  }

  function editSelectedText() {
    const sel = shapes.find((s) => s.id === selectedId);
    if (!sel || sel.kind !== "annotation" || sel.type !== "text") return;
    const next = window.prompt("Text:", sel.text ?? "");
    if (next == null) return;
    setShapes((prev) =>
      prev.map((s) =>
        s.id === selectedId && s.kind === "annotation"
          ? { ...s, text: next }
          : s,
      ),
    );
  }

  /* ---------- render ---------- */

  // Severity legend in view mode. Only counts non-Low (drawn-on-photo).
  const visibleBboxes = bboxes.filter(
    (b) => b.severity === "Medium" || b.severity === "High",
  );

  // What we render inside the photo container — depends on editing state.
  const renderShapes = editing
    ? shapes
    : ([
        ...bboxes
          .filter((b) => b.severity === "Medium" || b.severity === "High")
          .map((b) => ({ kind: "bbox" as const, ...b })),
        ...annotations.map((a) => ({ kind: "annotation" as const, ...a })),
      ] as EditableShape[]);

  const selected = editing ? shapes.find((s) => s.id === selectedId) : null;

  return (
    <div
      className={
        editing
          ? "fixed inset-0 z-[60] flex flex-col bg-[var(--ink)]"
          : "flex flex-col gap-3"
      }
      style={
        editing
          ? {
              // Honor iOS home-indicator inset so the Save button isn't
              // hidden behind it on phones with the bottom bar.
              paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
            }
          : undefined
      }
    >
      {/* Fullscreen header — only when editing. Close X on the right,
          short title on the left so the user knows where they are. */}
      {editing ? (
        <header
          className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3 sm:px-4"
          style={{ background: "rgba(15,21,24,0.95)" }}
        >
          <div className="flex flex-col">
            <span
              className="text-[10px] uppercase tracking-[0.18em]"
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              Annotate
            </span>
            <span className="text-xs text-white">
              Tap a tool below, draw on the photo
            </span>
          </div>
          <button
            type="button"
            onClick={cancelEditing}
            aria-label="Close (cancels unsaved changes)"
            className="flex h-9 w-9 items-center justify-center text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="m6 6 12 12M6 18 18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
      ) : null}

      {/* Photo wrap: takes remaining height in fullscreen, intrinsic-sized inline. */}
      <div
        className={
          editing
            ? "flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-3"
            : ""
        }
      >
      {/* Toolbar renders BELOW the photo in fullscreen edit mode — see
          after the photo-wrap close below. The original top-anchored
          toolbar has been moved there. */}
      {false ? (
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
              className="h-6 w-6 rounded-full border-2"
              style={{
                background: c.hex,
                borderColor: color === c.hex ? "#ffffff" : "transparent",
                boxShadow: color === c.hex ? "0 0 0 2px rgba(200,155,60,0.6)" : "none",
              }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-[var(--border)]" />

          {/* Line thickness — 3 buttons rendered as progressively thicker lines. */}
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
            Width
          </span>
          {[1, 2, 3].map((sw) => (
            <button
              key={`sw-${sw}`}
              type="button"
              title={sw === 1 ? "Thin" : sw === 2 ? "Medium" : "Thick"}
              onClick={() => changeSelectedStrokeWidth(sw)}
              className={[
                "flex h-8 w-8 items-center justify-center rounded-md border transition",
                strokeWidth === sw
                  ? "border-[var(--primary)] bg-[var(--primary)]/15"
                  : "border-[var(--border-strong)] hover:bg-white/5",
              ].join(" ")}
            >
              <span
                className="block w-4 rounded-full bg-[var(--fg)]"
                style={{ height: sw === 1 ? 1 : sw === 2 ? 2 : 4 }}
              />
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-[var(--border)]" />

          {/* Text size — 3 buttons rendered as S / M / L. */}
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
            Text
          </span>
          {[
            { v: 1, label: "S", size: "text-[10px]" },
            { v: 2, label: "M", size: "text-xs" },
            { v: 3, label: "L", size: "text-sm" },
          ].map(({ v, label, size }) => (
            <button
              key={`fs-${v}`}
              type="button"
              title={`Text ${label}`}
              onClick={() => changeSelectedFontSize(v)}
              className={[
                "flex h-8 w-8 items-center justify-center rounded-md border font-bold transition",
                size,
                fontSize === v
                  ? "border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--primary)]"
                  : "border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-white/5 hover:text-[var(--fg)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-[var(--border)]" />

          {/* Fill — "None" + the 6 stroke colors at 25% opacity preview. */}
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
            Fill
          </span>
          <button
            key="fill-none"
            type="button"
            title="No fill"
            onClick={() => changeSelectedFill(undefined)}
            className={[
              "relative flex h-6 w-6 items-center justify-center rounded-full border-2 bg-transparent",
              fill === undefined
                ? "border-white"
                : "border-[var(--border-strong)]",
            ].join(" ")}
            style={{
              boxShadow: fill === undefined ? "0 0 0 2px rgba(200,155,60,0.6)" : "none",
            }}
          >
            <span className="absolute h-[2px] w-5 rotate-45 bg-[#a8362b]" />
          </button>
          {COLORS.map((c) => (
            <button
              key={`fill-${c.hex}`}
              type="button"
              title={`Fill ${c.label}`}
              onClick={() => changeSelectedFill(c.hex)}
              className="h-6 w-6 rounded-full border-2"
              style={{
                // 25% opacity tint, matching how the shape will render.
                background: c.hex + "40",
                borderColor: fill === c.hex ? "#ffffff" : c.hex,
                boxShadow: fill === c.hex ? "0 0 0 2px rgba(200,155,60,0.6)" : "none",
              }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-[var(--border)]" />

          <button
            type="button"
            disabled={!selected}
            onClick={deleteSelected}
            className="rounded-md px-2 py-1 text-xs font-medium text-[#a8362b] disabled:opacity-30 hover:bg-[rgba(168,54,43,0.08)]"
          >
            {selected?.kind === "bbox" ? "Clear bbox" : "Delete"}
          </button>
          {selected?.kind === "annotation" && selected.type === "text" ? (
            <button
              type="button"
              onClick={editSelectedText}
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--fg-muted)] hover:bg-white/5 hover:text-[var(--fg)]"
            >
              Edit text
            </button>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={cancelEditing}
              disabled={isPending}
              className="rounded-md px-3 py-1 text-xs font-medium text-[var(--fg-muted)] hover:bg-white/5 hover:text-[var(--fg)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveAndExit}
              disabled={isPending}
              className="cl-btn-accent !px-3 !py-1 !text-xs"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      ) : null}

      {/* Photo container */}
      <div
        ref={containerRef}
        onMouseDown={(e) => {
          if (!editing) return;
          e.preventDefault();
          onDown(e.clientX, e.clientY);
        }}
        onDoubleClick={(e) => {
          // Double-click any text shape to edit its content in place.
          if (!editing) return;
          const p = pointToNorm(e.clientX, e.clientY);
          if (!p) return;
          const hit = topShapeAt(p);
          if (hit && hit.kind === "annotation" && hit.type === "text") {
            setSelectedId(hit.id);
            const next = window.prompt("Text:", hit.text ?? "");
            if (next == null) return;
            setShapes((prev) =>
              prev.map((s) =>
                s.id === hit.id && s.kind === "annotation"
                  ? { ...s, text: next }
                  : s,
              ),
            );
          }
        }}
        onTouchStart={(e) => {
          if (!editing || e.touches.length === 0) return;
          onDown(e.touches[0].clientX, e.touches[0].clientY);
        }}
        className={
          editing
            ? "relative inline-block max-h-full max-w-full overflow-hidden bg-black"
            : "relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black"
        }
        style={{
          touchAction: editing ? "none" : "auto",
          cursor: editing ? (tool === "select" ? "default" : "crosshair") : "default",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          // In edit mode: contain inside the available wrap (centered).
          // In view mode: stretch to the card width as before.
          className={
            editing
              ? "block max-h-[calc(100dvh-12rem)] w-auto max-w-full select-none object-contain"
              : "block w-full h-auto select-none"
          }
        />

        {imgLoaded ? (
          <>
            {/* SVG layer for shapes */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <defs>
                {[...COLORS.map((c) => c.hex), "#f87171"].map((color) => (
                  <marker
                    key={color}
                    id={`pe-arrow-${color.replace(/[^a-z0-9]/gi, "")}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="8"
                    markerHeight="8"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                  </marker>
                ))}
              </defs>
              {renderShapes.map((s) => (
                <ShapeSvg
                  key={s.id}
                  shape={s}
                  selected={editing && s.id === selectedId}
                />
              ))}
            </svg>

            {/* HTML overlay: badge numbers for bboxes (always visible) */}
            {(editing ? shapes : bboxes.map((b) => ({ kind: "bbox" as const, ...b }))).map((s) => {
              if (s.kind !== "bbox") return null;
              if (s.kind === "bbox" && (s as EditableShape & { cleared?: boolean }).cleared) {
                return null;
              }
              return (
                <button
                  type="button"
                  key={s.id}
                  onMouseEnter={() => setHoverId(s.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={(e) => {
                    if (editing) {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedId(s.id);
                    } else {
                      document
                        .getElementById(`finding-${s.id}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }}
                  className="absolute -translate-x-1/3 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-lg ring-2 ring-black/40 transition hover:scale-110"
                  style={{
                    background: SEVERITY_COLOR[s.severity],
                    color: "#0a0d12",
                    left: `${s.x1 * 100}%`,
                    top: `${s.y1 * 100}%`,
                  }}
                  aria-label={`Finding ${s.index + 1}: ${s.title}`}
                >
                  #{s.index + 1}
                </button>
              );
            })}

            {/* Hover tooltip on bbox in view mode */}
            {!editing && hoverId
              ? (() => {
                  const b = bboxes.find((x) => x.id === hoverId);
                  if (!b) return null;
                  return (
                    <div
                      className="pointer-events-none absolute z-10 min-w-[160px] -translate-y-full rounded-md px-2 py-1.5 text-[11px] font-medium shadow-xl"
                      style={{
                        left: `${b.x1 * 100}%`,
                        top: `${b.y1 * 100}%`,
                        background: "rgba(7,9,13,0.95)",
                        color: "#f1f5f9",
                        border: `1px solid ${SEVERITY_COLOR[b.severity]}`,
                        marginTop: "-8px",
                      }}
                    >
                      <div
                        className="mb-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{ color: SEVERITY_COLOR[b.severity] }}
                      >
                        {b.severity} · #{b.index + 1}
                      </div>
                      <div className="line-clamp-2">{b.title}</div>
                    </div>
                  );
                })()
              : null}

            {/* Resize handles for selected shape, edit mode only */}
            {editing && selected ? <ResizeHandlesOverlay s={selected} /> : null}
          </>
        ) : null}
      </div>
      {/* /Photo container — close the photo-wrap div we opened above. */}
      </div>

      {/* ============== BOTTOM TOOLBAR (edit mode only) ==============
          Sticks to the bottom of the fullscreen overlay so the controls
          are in the thumb zone on phones. Horizontally scrollable on
          narrow screens so every tool stays one tap away. */}
      {editing ? (
        <div
          className="shrink-0 border-t border-white/10 px-2 py-2"
          style={{ background: "rgba(15,21,24,0.95)" }}
        >
          {/* Save/Cancel row — primary actions on top, always visible
              even on smallest viewports. */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={cancelEditing}
              disabled={isPending}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              Cancel
            </button>
            <span className="text-[11px] text-white/50">
              {selected?.kind === "bbox"
                ? `AI finding #${selected.index + 1} selected`
                : selected?.kind === "annotation"
                  ? `${selected.type[0].toUpperCase()}${selected.type.slice(1)} selected`
                  : "Pick a tool, drag on the photo"}
            </span>
            <button
              type="button"
              onClick={saveAndExit}
              disabled={isPending}
              className="cl-btn-accent !px-4 !py-1.5 !text-xs"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>

          {/* Tools strip — horizontally scrollable on small screens.
              Each tool gets a 44px touch target (iOS minimum). */}
          <div className="-mx-2 overflow-x-auto px-2">
            <div className="flex min-w-max items-center gap-2 pb-1">
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

              <span className="h-7 w-px shrink-0 bg-white/15" />

              {/* Color swatches */}
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => changeSelectedColor(c.hex)}
                  className="h-8 w-8 shrink-0 rounded-full border-2"
                  style={{
                    background: c.hex,
                    borderColor: color === c.hex ? "#ffffff" : "transparent",
                    boxShadow:
                      color === c.hex ? "0 0 0 2px rgba(200,155,60,0.6)" : "none",
                  }}
                />
              ))}

              <span className="h-7 w-px shrink-0 bg-white/15" />

              {/* Line thickness */}
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/50">
                Width
              </span>
              {[1, 2, 3].map((sw) => (
                <button
                  key={`sw-${sw}`}
                  type="button"
                  title={sw === 1 ? "Thin" : sw === 2 ? "Medium" : "Thick"}
                  onClick={() => changeSelectedStrokeWidth(sw)}
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition",
                    strokeWidth === sw
                      ? "border-[var(--gold)] bg-white/10"
                      : "border-white/20 hover:bg-white/5",
                  ].join(" ")}
                >
                  <span
                    className="block w-5 rounded-full bg-white"
                    style={{ height: sw === 1 ? 1 : sw === 2 ? 2 : 4 }}
                  />
                </button>
              ))}

              <span className="h-7 w-px shrink-0 bg-white/15" />

              {/* Text size */}
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/50">
                Text
              </span>
              {[
                { v: 1, label: "S", size: "text-[10px]" },
                { v: 2, label: "M", size: "text-xs" },
                { v: 3, label: "L", size: "text-sm" },
              ].map(({ v, label, size }) => (
                <button
                  key={`fs-${v}`}
                  type="button"
                  title={`Text ${label}`}
                  onClick={() => changeSelectedFontSize(v)}
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border font-bold transition",
                    size,
                    fontSize === v
                      ? "border-[var(--gold)] bg-white/10 text-white"
                      : "border-white/20 text-white/70 hover:bg-white/5 hover:text-white",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}

              <span className="h-7 w-px shrink-0 bg-white/15" />

              {/* Fill */}
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-white/50">
                Fill
              </span>
              <button
                key="fill-none"
                type="button"
                title="No fill"
                onClick={() => changeSelectedFill(undefined)}
                className={[
                  "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-transparent",
                  fill === undefined ? "border-white" : "border-white/30",
                ].join(" ")}
                style={{
                  boxShadow:
                    fill === undefined ? "0 0 0 2px rgba(200,155,60,0.6)" : "none",
                }}
              >
                <span className="absolute h-[2px] w-5 rotate-45 bg-[#a8362b]" />
              </button>
              {COLORS.map((c) => (
                <button
                  key={`fill-${c.hex}`}
                  type="button"
                  title={`Fill ${c.label}`}
                  onClick={() => changeSelectedFill(c.hex)}
                  className="h-8 w-8 shrink-0 rounded-full border-2"
                  style={{
                    background: c.hex + "40",
                    borderColor: fill === c.hex ? "#ffffff" : c.hex,
                    boxShadow:
                      fill === c.hex ? "0 0 0 2px rgba(200,155,60,0.6)" : "none",
                  }}
                />
              ))}

              <span className="h-7 w-px shrink-0 bg-white/15" />

              {/* Delete + Edit text */}
              <button
                type="button"
                disabled={!selected}
                onClick={deleteSelected}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-[#fca5a5] transition hover:bg-[rgba(168,54,43,0.18)] disabled:opacity-30"
              >
                {selected?.kind === "bbox" ? "Clear bbox" : "Delete"}
              </button>
              {selected?.kind === "annotation" && selected.type === "text" ? (
                <button
                  type="button"
                  onClick={editSelectedText}
                  className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Edit text
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Bottom action row — view mode only. The hint paragraph that
          used to live here for edit mode has moved into the fullscreen
          header subtitle. */}
      {!editing ? (
        <div className="flex items-center justify-between gap-2 px-1 text-xs">
          <span className="text-[var(--fg-subtle)]">
            {visibleBboxes.length > 0
              ? `${visibleBboxes.length} flagged region${visibleBboxes.length === 1 ? "" : "s"}${
                  annotations.length > 0
                    ? ` · ${annotations.length} annotation${annotations.length === 1 ? "" : "s"}`
                    : ""
                } — tap a number to jump to the finding.`
              : annotations.length > 0
                ? `${annotations.length} annotation${annotations.length === 1 ? "" : "s"} on this photo.`
                : "No annotations on this photo."}
          </span>
          <button
            type="button"
            onClick={startEditing}
            className="cl-btn-outline !px-3 !py-1 !text-xs"
          >
            Annotate
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function ShapeSvg({
  shape,
  selected,
}: {
  shape: EditableShape;
  selected: boolean;
}) {
  if (shape.kind === "bbox" && (shape as EditableShape & { cleared?: boolean }).cleared) {
    return (
      <rect
        x={Math.min(shape.x1, shape.x2)}
        y={Math.min(shape.y1, shape.y2)}
        width={Math.abs(shape.x2 - shape.x1)}
        height={Math.abs(shape.y2 - shape.y1)}
        fill="none"
        stroke="#f87171"
        strokeWidth={2}
        strokeDasharray="6 6"
        opacity={0.35}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  const stroke =
    shape.kind === "bbox"
      ? (shape.color ?? SEVERITY_COLOR[shape.severity])
      : shape.color;
  // Stroke widths are in PIXELS because we use vectorEffect="non-scaling-stroke",
  // which means the stroke width is interpreted in the SVG host's pixel space
  // (not the 0..1 viewBox). Sub-pixel values render invisibly.
  // User strokeWidth multiplier: 1 (thin), 2 (medium), 3 (thick) — applies to
  // BOTH annotations and bboxes now.
  const swMultiplier =
    typeof shape.strokeWidth === "number" ? shape.strokeWidth : 2;
  const basePx = shape.kind === "bbox" ? 1.5 : 2; // px per multiplier unit
  const strokeWidth = basePx * swMultiplier + (selected ? 1 : 0);
  const fillColor =
    shape.fill
      ? hexWithOpacity(shape.fill, 0.25)
      : "none";
  const minX = Math.min(shape.x1, shape.x2);
  const maxX = Math.max(shape.x1, shape.x2);
  const minY = Math.min(shape.y1, shape.y2);
  const maxY = Math.max(shape.y1, shape.y2);
  const w = maxX - minX;
  const h = maxY - minY;

  if (shape.kind === "bbox" || (shape.kind === "annotation" && shape.type === "rect")) {
    return (
      <rect
        x={minX}
        y={minY}
        width={w}
        height={h}
        fill={fillColor}
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        style={{
          filter: selected ? "drop-shadow(0 0 4px rgba(255,255,255,0.6))" : undefined,
        }}
      />
    );
  }
  if (shape.kind === "annotation" && shape.type === "circle") {
    return (
      <ellipse
        cx={(minX + maxX) / 2}
        cy={(minY + maxY) / 2}
        rx={w / 2}
        ry={h / 2}
        fill={fillColor}
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (shape.kind === "annotation" && shape.type === "arrow") {
    const markerId = `pe-arrow-${shape.color.replace(/[^a-z0-9]/gi, "")}`;
    return (
      <line
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke={stroke}
        strokeWidth={strokeWidth * 1.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        markerEnd={`url(#${markerId})`}
      />
    );
  }
  if (shape.kind === "annotation" && shape.type === "text") {
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    // fontSize multiplier: 1 (small) → 0.025, 2 (medium) → 0.04, 3 (large) → 0.055
    // (in viewBox units, since text doesn't use non-scaling-stroke).
    const fsMul =
      typeof shape.fontSize === "number" ? shape.fontSize : 2;
    const fontSize = 0.015 + fsMul * 0.013;
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
          // Strokes on <text> are in viewBox user units (no non-scaling-stroke
          // here), so this MUST be tiny in our 0..1 viewBox or it will paint
          // a huge black halo over the entire photo. 0.004 is ~3px on a
          // typical render width.
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.85)",
          strokeWidth: 0.004,
          strokeLinejoin: "round",
        }}
      >
        {(shape.text ?? "").slice(0, 80)}
      </text>
    );
  }
  return null;
}

/** Apply opacity to a #rrggbb / #rgb hex string. Returns a hex with alpha. */
function hexWithOpacity(hex: string, opacity: number): string {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  const aHex = a.toString(16).padStart(2, "0");
  return `#${h}${aHex}`;
}

/* ---------- shared module-scope helpers ---------- */

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function applyResize(
  start: EditableShape,
  handle: Handle,
  p: Pt,
): EditableShape {
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

/* ---------- ToolBtn + ResizeHandlesOverlay + icon components ---------- */

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

function ResizeHandlesOverlay({ s }: { s: EditableShape }) {
  const handles: Array<[Handle, number, number]> = [
    ["nw", s.x1, s.y1],
    ["n",  (s.x1 + s.x2) / 2, s.y1],
    ["ne", s.x2, s.y1],
    ["e",  s.x2, (s.y1 + s.y2) / 2],
    ["se", s.x2, s.y2],
    ["s",  (s.x1 + s.x2) / 2, s.y2],
    ["sw", s.x1, s.y2],
    ["w",  s.x1, (s.y1 + s.y2) / 2],
  ];
  const color = s.kind === "bbox" ? "#f87171" : (s as Annotation).color;
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
            border: `2px solid ${color}`,
            boxShadow: "0 0 4px rgba(0,0,0,0.55)",
          }}
        />
      ))}
    </>
  );
}

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
