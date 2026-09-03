"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { PIN_COLORS, type ViewerPin } from "@/components/plans/types";
import { severityColor } from "@/lib/severity";

/* =====================================================================
 * PlanViewer — pan/zoom surface for a life-safety plan with pins.
 *
 * Hand-rolled: ONE transform (translate + scale) on a content box that
 * holds the image at its fitted size, pointer events for drag-pan and
 * two-finger pinch, wheel for desktop zoom. Pins live INSIDE the content
 * box at (x·w, y·h) and counter-scale so they stay the same size on
 * screen at every zoom. No hover-only affordances; every control is at
 * least 44px so it works with a thumb.
 *
 * The stored transform is RELATIVE to the centered-fit position, so a
 * resize (or the image finishing its load) re-centers for free — no
 * effect has to reset state.
 *
 * Modes
 *   view  — pan/zoom; tap a pin → bottom sheet with Open / Edit label /
 *           Move / Delete (read-only shows Open only).
 *   place — a crosshair follows the pointer; a tap (not a drag) calls
 *           onPlace(x, y) with normalized 0..1 coordinates.
 * ===================================================================== */

export type PlanViewerResult = { ok: boolean; error?: string };

type Props = {
  src: string;
  /** Natural size hints (from facility_plans.width/height). Optional —
   *  the viewer reads the loaded image's natural size anyway. */
  width?: number | null;
  height?: number | null;
  pins: ViewerPin[];
  mode?: "view" | "place";
  readOnly?: boolean;
  onPlace?: (x: number, y: number) => void | Promise<void>;
  onMove?: (id: string, x: number, y: number) => Promise<PlanViewerResult>;
  onLabel?: (id: string, label: string) => Promise<PlanViewerResult>;
  onDelete?: (id: string) => Promise<PlanViewerResult>;
  /** Pin to open on mount (e.g. arriving from a finding card). */
  highlightPinId?: string | null;
  /** Tailwind height class for the surface. */
  heightClass?: string;
  /** Extra hint text shown in place mode. */
  placeHint?: string;
};

type Transform = { s: number; tx: number; ty: number };
type Pt = { x: number; y: number };
type PinOverride = { x?: number; y?: number; label?: string | null; deleted?: true };

const MIN_SCALE = 0.5;
const MAX_SCALE = 10;
const TAP_SLOP = 8; // px — under this a pointer sequence counts as a tap
const IDENTITY: Transform = { s: 1, tx: 0, ty: 0 };

function clampScale(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}
function clamp01(n: number) {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

export function PlanViewer({
  src,
  width,
  height,
  pins,
  mode = "view",
  readOnly = false,
  onPlace,
  onMove,
  onLabel,
  onDelete,
  highlightPinId,
  heightClass = "h-[60vh] min-h-[320px]",
  placeHint,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<Pt | null>(
    width && height ? { x: width, y: height } : null,
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Fitted base size of the image (before the zoom transform) and the
  // translate that centers it. Both derive from props/state — no effect.
  const base = useMemo(() => {
    if (!natural || container.w === 0 || container.h === 0) return { w: 0, h: 0 };
    const fit = Math.min(container.w / natural.x, container.h / natural.y);
    return { w: natural.x * fit, h: natural.y * fit };
  }, [natural, container]);
  const center = useMemo<Pt>(
    () => ({ x: (container.w - base.w) / 2, y: (container.h - base.h) / 2 }),
    [container, base],
  );

  // Stored RELATIVE to `center`; the rendered translate is center + t.
  const [t, setT] = useState<Transform>(IDENTITY);
  const tRef = useRef<Transform>(IDENTITY);
  const centerRef = useRef<Pt>(center);
  const baseRef = useRef(base);
  useEffect(() => {
    tRef.current = t;
    centerRef.current = center;
    baseRef.current = base;
  }, [t, center, base]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setContainer({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------- pins: props + optimistic overrides ---------------- */
  const [overrides, setOverrides] = useState<Record<string, PinOverride>>({});
  const displayPins = useMemo<ViewerPin[]>(() => {
    const out: ViewerPin[] = [];
    for (const p of pins) {
      const o = overrides[p.id];
      if (!o) {
        out.push(p);
        continue;
      }
      if (o.deleted) continue;
      out.push({
        ...p,
        x: o.x ?? p.x,
        y: o.y ?? p.y,
        label: o.label !== undefined ? o.label : p.label,
      });
    }
    return out;
  }, [pins, overrides]);

  const [selectedId, setSelectedId] = useState<string | null>(
    highlightPinId ?? null,
  );
  const [movingId, setMovingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = displayPins.find((p) => p.id === selectedId) ?? null;

  /* ---------------- gesture bookkeeping (refs: handlers only) ---------------- */
  const pointers = useRef<Map<number, Pt>>(new Map());
  const gesture = useRef<{
    startX: number;
    startY: number;
    startT: Transform; // FULL translate (center + relative)
    moved: boolean;
    startDist: number;
    startMid: Pt;
    pinDrag: string | null;
  } | null>(null);
  const [crosshair, setCrosshair] = useState<Pt | null>(null);

  const toLocal = useCallback((clientX: number, clientY: number): Pt => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  /** Full translate = center + relative. */
  function fullT(): Transform {
    const c = centerRef.current;
    const r = tRef.current;
    return { s: r.s, tx: c.x + r.tx, ty: c.y + r.ty };
  }
  function setFullT(full: Transform) {
    const c = centerRef.current;
    setT({ s: full.s, tx: full.tx - c.x, ty: full.ty - c.y });
  }

  function toNormalized(p: Pt): Pt {
    const cur = fullT();
    const b = baseRef.current;
    if (b.w === 0) return { x: 0, y: 0 };
    return {
      x: clamp01((p.x - cur.tx) / cur.s / b.w),
      y: clamp01((p.y - cur.ty) / cur.s / b.h),
    };
  }

  function isInsideImage(p: Pt): boolean {
    const cur = fullT();
    const b = baseRef.current;
    const cx = (p.x - cur.tx) / cur.s;
    const cy = (p.y - cur.ty) / cur.s;
    return cx >= 0 && cy >= 0 && cx <= b.w && cy <= b.h;
  }

  function zoomAbout(anchor: Pt, nextScale: number) {
    const cur = fullT();
    const s = clampScale(nextScale);
    const cx = (anchor.x - cur.tx) / cur.s;
    const cy = (anchor.y - cur.ty) / cur.s;
    setFullT({ s, tx: anchor.x - cx * s, ty: anchor.y - cy * s });
  }

  function zoomAtCenter(factor: number) {
    const el = containerRef.current;
    if (!el) return;
    zoomAbout({ x: el.clientWidth / 2, y: el.clientHeight / 2 }, fullT().s * factor);
  }

  // Wheel zoom must be a non-passive listener to preventDefault scrolling.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = Math.exp(-e.deltaY * 0.0015);
      const c = centerRef.current;
      const r = tRef.current;
      const cur = { s: r.s, tx: c.x + r.tx, ty: c.y + r.ty };
      const s = clampScale(cur.s * factor);
      const cx = (anchor.x - cur.tx) / cur.s;
      const cy = (anchor.y - cur.ty) / cur.s;
      setT({ s, tx: anchor.x - cx * s - c.x, ty: anchor.y - cy * s - c.y });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const pinEl = target.closest("[data-pin-id]") as HTMLElement | null;
    const pinId = pinEl?.dataset.pinId ?? null;

    // A tap on a pin (not in move mode) is handled by the pin's onClick.
    if (pinId && movingId !== pinId) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 1) {
      gesture.current = {
        startX: p.x,
        startY: p.y,
        startT: fullT(),
        moved: false,
        startDist: 0,
        startMid: p,
        pinDrag: pinId && movingId === pinId ? pinId : null,
      };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        startX: p.x,
        startY: p.y,
        startT: fullT(),
        moved: true,
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        pinDrag: null,
      };
      setCrosshair(null);
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = toLocal(e.clientX, e.clientY);
    if (mode === "place" && pointers.current.size <= 1) setCrosshair(p);

    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = clampScale(g.startT.s * (dist / g.startDist));
      // Keep the content point that was under the start-midpoint under
      // the current midpoint (pinch + pan in one).
      const cx = (g.startMid.x - g.startT.tx) / g.startT.s;
      const cy = (g.startMid.y - g.startT.ty) / g.startT.s;
      setFullT({ s, tx: mid.x - cx * s, ty: mid.y - cy * s });
      g.moved = true;
      return;
    }

    const dx = p.x - g.startX;
    const dy = p.y - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;

    if (g.pinDrag) {
      const n = toNormalized(p);
      const id = g.pinDrag;
      setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], x: n.x, y: n.y } }));
      return;
    }
    if (g.moved) {
      setFullT({ s: g.startT.s, tx: g.startT.tx + dx, ty: g.startT.ty + dy });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = toLocal(e.clientX, e.clientY);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (pointers.current.size === 1) {
      // Second finger lifted — restart a clean single-pointer gesture so
      // the remaining finger doesn't make the plan jump.
      const [rest] = [...pointers.current.values()];
      gesture.current = {
        startX: rest.x,
        startY: rest.y,
        startT: fullT(),
        moved: true,
        startDist: 0,
        startMid: rest,
        pinDrag: null,
      };
      return;
    }
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g) return;

    if (g.pinDrag) {
      const n = toNormalized(p);
      void commitMove(g.pinDrag, n.x, n.y);
      return;
    }
    if (!g.moved && mode === "place" && onPlace) {
      // Only accept taps that land on the plan image itself.
      if (isInsideImage(p)) {
        const n = toNormalized(p);
        void onPlace(n.x, n.y);
      }
      return;
    }
    if (!g.moved && mode === "view") {
      // Tap on empty plan → close the sheet.
      setSelectedId(null);
      setEditingLabel(null);
    }
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  }

  /* ---------------- pin actions ---------------- */
  async function commitMove(id: string, x: number, y: number) {
    setMovingId(null);
    if (!onMove) return;
    setBusy(true);
    const res = await onMove(id, x, y);
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error ?? "Could not move the pin.");
      // Drop the optimistic position — the prop value shows again.
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      setNotice(null);
    }
  }

  async function saveLabel() {
    if (!selected || !onLabel) return;
    setBusy(true);
    const res = await onLabel(selected.id, labelDraft);
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error ?? "Could not save the label.");
      return;
    }
    const id = selected.id;
    const label = labelDraft.trim() || null;
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], label } }));
    setEditingLabel(null);
    setNotice(null);
  }

  async function remove() {
    if (!selected || !onDelete) return;
    if (!window.confirm("Remove this pin from the plan?")) return;
    setBusy(true);
    const res = await onDelete(selected.id);
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error ?? "Could not remove the pin.");
      return;
    }
    const id = selected.id;
    setOverrides((prev) => ({ ...prev, [id]: { deleted: true } }));
    setSelectedId(null);
    setNotice(null);
  }

  function cancelMove() {
    if (movingId) {
      const id = movingId;
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    setMovingId(null);
  }

  const canEdit = !readOnly && mode === "view";
  const fullTranslate = { x: center.x + t.tx, y: center.y + t.ty };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className={[
          "relative w-full select-none overflow-hidden rounded-lg border border-[var(--border)]",
          heightClass,
          mode === "place" ? "cursor-crosshair" : movingId ? "cursor-move" : "cursor-grab",
        ].join(" ")}
        style={{
          background: "#0a0d12",
          touchAction: "none",
          overscrollBehavior: "contain",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          if (pointers.current.size === 0) setCrosshair(null);
        }}
        role="application"
        aria-label="Plan viewer — drag to pan, pinch or scroll to zoom"
      >
        {/* Content box: fitted image + pins, transformed as one. */}
        <div
          className="absolute left-0 top-0"
          style={{
            width: base.w || undefined,
            height: base.h || undefined,
            transform: `translate(${fullTranslate.x}px, ${fullTranslate.y}px) scale(${t.s})`,
            transformOrigin: "0 0",
            willChange: "transform",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Facility plan"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setNatural({ x: img.naturalWidth, y: img.naturalHeight });
              }
              setLoaded(true);
            }}
            onError={() => setFailed(true)}
            className="block"
            style={{
              width: base.w || undefined,
              height: base.h || undefined,
              background: "#ffffff",
              pointerEvents: "none",
            }}
          />

          {base.w > 0
            ? displayPins.map((pin) => (
                <PinMarker
                  key={pin.id}
                  pin={pin}
                  baseW={base.w}
                  baseH={base.h}
                  scale={t.s}
                  selected={pin.id === selectedId}
                  moving={pin.id === movingId}
                  onSelect={() => {
                    if (mode !== "view") return;
                    setSelectedId(pin.id);
                    setEditingLabel(null);
                    setNotice(null);
                  }}
                />
              ))
            : null}
        </div>

        {/* Loading / error states */}
        {!loaded && !failed ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/70">
            Loading plan…
          </div>
        ) : null}
        {failed ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-white/80">
            The plan image could not be loaded. Reload the page — the signed
            link may have expired.
          </div>
        ) : null}

        {/* Place-mode crosshair */}
        {mode === "place" && crosshair ? (
          <div
            className="pointer-events-none absolute"
            style={{ left: crosshair.x, top: crosshair.y }}
            aria-hidden
          >
            <div
              className="absolute -left-6 -top-6 h-12 w-12 rounded-full border-2"
              style={{ borderColor: "#f2b134", boxShadow: "0 0 0 1px rgba(0,0,0,0.6)" }}
            />
            <div className="absolute -left-px -top-4 h-8 w-0.5" style={{ background: "#f2b134" }} />
            <div className="absolute -left-4 -top-px h-0.5 w-8" style={{ background: "#f2b134" }} />
          </div>
        ) : null}

        {/* Mode banner */}
        {mode === "place" ? (
          <Banner>{placeHint ?? "Tap the spot on the plan. Drag to pan, pinch to zoom."}</Banner>
        ) : movingId ? (
          <Banner>Drag the pin to its new spot, then let go.</Banner>
        ) : null}

        {/* Zoom controls — always visible, thumb-sized. */}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <ZoomButton label="Zoom in" onClick={() => zoomAtCenter(1.5)}>
            +
          </ZoomButton>
          <ZoomButton label="Zoom out" onClick={() => zoomAtCenter(1 / 1.5)}>
            −
          </ZoomButton>
          <ZoomButton label="Fit to screen" onClick={() => setT(IDENTITY)}>
            ⤢
          </ZoomButton>
        </div>

        {/* Bottom sheet for the selected pin */}
        {selected && mode === "view" ? (
          <div
            className="absolute inset-x-0 bottom-0 border-t px-3 py-3 text-sm"
            style={{
              background: "rgba(236, 232, 218, 0.97)",
              borderColor: "var(--border)",
              color: "var(--fg)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <PinGlyph pin={selected} />
                  <p className="truncate font-medium">{selected.title}</p>
                </div>
                {selected.subtitle ? (
                  <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{selected.subtitle}</p>
                ) : null}
                {editingLabel === selected.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      className="cl-input text-sm"
                      maxLength={60}
                      placeholder="Label — Rm 217, Stair B…"
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveLabel();
                        if (e.key === "Escape") setEditingLabel(null);
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveLabel()}
                      className="cl-btn-accent min-h-[44px] px-3 text-xs"
                    >
                      Save
                    </button>
                  </div>
                ) : selected.label ? (
                  <p className="mt-1 text-xs">
                    <span className="font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
                      Label ·{" "}
                    </span>
                    {selected.label}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setSelectedId(null);
                  setEditingLabel(null);
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-lg text-[var(--fg-muted)]"
              >
                ×
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {selected.href ? (
                <Link href={selected.href} className="cl-btn-outline min-h-[44px] px-3 text-xs">
                  Open ↗
                </Link>
              ) : null}
              {canEdit && onLabel ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setLabelDraft(selected.label ?? "");
                    setEditingLabel(selected.id);
                  }}
                  className="cl-btn-outline min-h-[44px] px-3 text-xs"
                >
                  Edit label
                </button>
              ) : null}
              {canEdit && onMove ? (
                movingId === selected.id ? (
                  <button
                    type="button"
                    onClick={cancelMove}
                    className="cl-btn-outline min-h-[44px] px-3 text-xs"
                  >
                    Cancel move
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setMovingId(selected.id)}
                    className="cl-btn-outline min-h-[44px] px-3 text-xs"
                  >
                    Move
                  </button>
                )
              ) : null}
              {canEdit && onDelete ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                  className="min-h-[44px] rounded px-3 text-xs font-medium"
                  style={{ color: "#a8362b", border: "1px solid rgba(168,54,43,0.4)" }}
                >
                  Delete
                </button>
              ) : null}
            </div>
            {notice ? (
              <p className="mt-2 text-xs" style={{ color: "#a8362b" }}>
                {notice}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="px-1 text-[11px] text-[var(--fg-subtle)]">
        Drag to pan · pinch or scroll to zoom · tap a pin for details
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------- */

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2 pr-16">
      <span
        className="rounded-full px-3 py-1.5 text-center text-xs font-medium"
        style={{ background: "rgba(242,177,52,0.95)", color: "#0f1518" }}
      >
        {children}
      </span>
    </div>
  );
}

function pinColor(pin: ViewerPin): string {
  return pin.kind === "finding" && pin.severity
    ? severityColor(pin.severity).fg
    : PIN_COLORS[pin.kind];
}

function PinMarker({
  pin,
  baseW,
  baseH,
  scale,
  selected,
  moving,
  onSelect,
}: {
  pin: ViewerPin;
  baseW: number;
  baseH: number;
  scale: number;
  selected: boolean;
  moving: boolean;
  onSelect: () => void;
}) {
  const color = pinColor(pin);
  return (
    <button
      type="button"
      data-pin-id={pin.id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-label={`${pin.title}${pin.label ? ` — ${pin.label}` : ""}`}
      className="absolute flex h-11 w-11 items-center justify-center"
      style={{
        left: pin.x * baseW,
        top: pin.y * baseH,
        // Counter-scale so the pin keeps its on-screen size at any zoom.
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
        transformOrigin: "center",
        zIndex: selected ? 3 : 2,
        touchAction: "none",
        cursor: moving ? "move" : "pointer",
      }}
    >
      <span
        className="flex items-center justify-center rounded-full font-semibold text-white"
        style={{
          width: pin.number != null ? 28 : 18,
          height: pin.number != null ? 28 : 18,
          fontSize: 12,
          background: color,
          border: `2px solid ${selected || moving ? "#f2b134" : "#ffffff"}`,
          boxShadow: moving
            ? "0 0 0 6px rgba(242,177,52,0.35), 0 2px 6px rgba(0,0,0,0.5)"
            : "0 2px 6px rgba(0,0,0,0.5)",
          fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
          lineHeight: 1,
        }}
      >
        {pin.number != null ? pin.number : ""}
      </span>
    </button>
  );
}

function PinGlyph({ pin }: { pin: ViewerPin }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{
        width: 22,
        height: 22,
        background: pinColor(pin),
        fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
      }}
      aria-hidden
    >
      {pin.number != null ? pin.number : "•"}
    </span>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-md text-lg font-semibold"
      style={{
        background: "rgba(236, 232, 218, 0.92)",
        color: "var(--ink, #0f1518)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </button>
  );
}
