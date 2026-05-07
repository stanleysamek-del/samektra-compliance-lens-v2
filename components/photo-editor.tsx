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
  { hex: "#fbbf24", label: "Yellow" },
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
      if (
        Math.abs(o.x1 - s.x1) > 1e-4 ||
        Math.abs(o.y1 - s.y1) > 1e-4 ||
        Math.abs(o.x2 - s.x2) > 1e-4 ||
        Math.abs(o.y2 - s.y2) > 1e-4
      ) {
        bboxUpdates.push({
          findingId: s.id,
          bbox: { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 },
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
      prev.map((s) => {
        if (s.id !== selectedId) return s;
        if (s.kind === "annotation") return { ...s, color: c };
        return s; // bboxes keep severity color
      }),
    );
  }

  function changeSelectedStrokeWidth(sw: number) {
    setStrokeWidth(sw);
    if (!selectedId) return;
    setShapes((prev) =>
      prev.map((s) =>
        s.id === selectedId && s.kind === "annotation"
          ? { ...s, strokeWidth: sw }
          : s,
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
      prev.map((s) =>
        s.id === selectedId && s.kind === "annotation" && (s.type === "rect" || s.type === "circle")
          ? { ...s, fill: f }
          : s,
      ),
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
    <div className="flex flex-col gap-3">
      {/* Toolbar — only when editing */}
      {editing ? (
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
                boxShadow: color === c.hex ? "0 0 0 2px rgba(20,184,166,0.6)" : "none",
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
              boxShadow: fill === undefined ? "0 0 0 2px rgba(20,184,166,0.6)" : "none",
            }}
          >
            <span className="absolute h-[2px] w-5 rotate-45 bg-[#fca5a5]" />
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
                boxShadow: fill === c.hex ? "0 0 0 2px rgba(20,184,166,0.6)" : "none",
              }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-[var(--border)]" />

          <button
            type="button"
            disabled={!selected}
            onClick={deleteSelected}
            className="rounded-md px-2 py-1 text-xs font-medium text-[#fca5a5] disabled:opacity-30 hover:bg-[rgba(239,68,68,0.08)]"
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
        onTouchStart={(e) => {
          if (!editing || e.touches.length === 0) return;
          onDown(e.touches[0].clientX, e.touches[0].clientY);
        }}
        className="relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black"
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
          className="block w-full h-auto select-none"
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

      {/* Bottom action row: Annotate button (view mode) or hint (edit mode) */}
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
      ) : (
        <p className="px-1 text-[11px] text-[var(--fg-subtle)]">
          Pick a tool, click and drag on the photo. Switch to <strong>Select</strong> to
          drag any shape (AI bboxes included) or grab a corner to resize.
          Selected AI bbox + Delete → clears the bbox on that finding.
          Save to persist.
        </p>
      )}
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
    shape.kind === "bbox" ? SEVERITY_COLOR[shape.severity] : shape.color;
  // Stroke widths are in PIXELS because we use vectorEffect="non-scaling-stroke",
  // which means the stroke width is interpreted in the SVG host's pixel space
  // (not the 0..1 viewBox). Sub-pixel values render invisibly.
  // User strokeWidth multiplier: 1 (thin), 2 (medium), 3 (thick).
  const swMultiplier =
    shape.kind === "annotation" && typeof shape.strokeWidth === "number"
      ? shape.strokeWidth
      : 2;
  const basePx = shape.kind === "bbox" ? 3 : 2; // px per multiplier unit
  const strokeWidth =
    (shape.kind === "bbox" ? 3 : basePx * swMultiplier) +
    (selected ? 1 : 0);
  const fillColor =
    shape.kind === "annotation" && shape.fill
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
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.85)",
          strokeWidth: 3,
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
