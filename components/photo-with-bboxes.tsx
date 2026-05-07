"use client";

import { useEffect, useRef, useState } from "react";

type BBox = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  index: number;
  severity: "Low" | "Medium" | "High";
  title: string;
};

type Annotation = {
  id: string;
  type: "rect" | "circle" | "arrow" | "text";
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text?: string;
};

type Props = {
  src: string;
  /** Kept for API compatibility but no longer consumed. */
  width?: number;
  /** Kept for API compatibility but no longer consumed. */
  height?: number;
  bboxes: BBox[];
  /** Inspector-drawn annotation layer (read-only overlay). */
  annotations?: Annotation[];
};

/**
 * Photo with overlaid finding indicators.
 *
 * Only Medium / High severity findings are drawn on the photo (in red,
 * outline-only). Low-severity advisories appear in the findings list below
 * but are NOT drawn on the photo — keeps the image readable.
 *
 * IMPORTANT layout note: we let the <img> drive its own size (w-full,
 * h-auto, no fixed aspectRatio on the container). This guarantees the
 * container's box matches the rendered image exactly — no letterboxes,
 * no offset between bbox coordinates and the photo content. Earlier
 * versions used a fixed aspectRatio container which caused bboxes to
 * land in black letterbox bars when the AI's reported width/height
 * disagreed with the photo's actual displayed orientation.
 *
 * Boxes are HTML <div>s with a CSS border (3px red), positioned in %
 * over the image.
 */
export function PhotoWithBoxes({ src, bboxes, annotations = [] }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [legendVisible, setLegendVisible] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Only render boxes for real deficiencies (Medium / High).
  const visibleBboxes = bboxes.filter(
    (b) => b.severity === "Medium" || b.severity === "High",
  );

  // Hide legend after 5s if there are findings.
  useEffect(() => {
    if (visibleBboxes.length === 0) return;
    const t = setTimeout(() => setLegendVisible(false), 5000);
    return () => clearTimeout(t);
  }, [visibleBboxes.length]);

  // Catch the case where the <img> was already cached on mount (so onLoad
  // doesn't fire). Without this, the overlay wouldn't render until next
  // re-render, which can flash an unboxed photo.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setImgLoaded(true);
    }
  }, [src]);

  const severityCounts = visibleBboxes.reduce(
    (acc, b) => {
      acc[b.severity] = (acc[b.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<"Low" | "Medium" | "High", number>,
  );

  const allSeverityCounts = bboxes.reduce(
    (acc, b) => {
      acc[b.severity] = (acc[b.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<"Low" | "Medium" | "High", number>,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt=""
          onLoad={() => setImgLoaded(true)}
          className="block w-full h-auto"
        />

        {/* Read-only annotation overlay (rectangles, circles, arrows, text)
            drawn by the inspector via the PhotoAnnotator editor below. Sits
            UNDER the bbox/badge layer so finding badges remain on top. */}
        {imgLoaded && annotations.length > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            <defs>
              {Array.from(new Set(annotations.map((a) => a.color))).map(
                (color) => (
                  <marker
                    key={color}
                    id={`pwb-arrowhead-${color.replace(/[^a-z0-9]/gi, "")}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="8"
                    markerHeight="8"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                  </marker>
                ),
              )}
            </defs>
            {annotations.map((a) => renderAnnotation(a))}
          </svg>
        ) : null}

        {/* Overlay container — sits exactly on top of the rendered image area.
            Because the <img> drives the parent's size and we don't fix an
            aspectRatio, inset-0 here matches the image content exactly. */}
        {imgLoaded ? (
          <div className="pointer-events-none absolute inset-0">
            {visibleBboxes.map((b) => {
              const stroke = severityColor(b.severity);
              const isHover = hoverId === b.id;
              const x1 = clamp01(b.x1);
              const y1 = clamp01(b.y1);
              const x2 = clamp01(b.x2);
              const y2 = clamp01(b.y2);
              const left = `${x1 * 100}%`;
              const top = `${y1 * 100}%`;
              const w = `${Math.max(0, x2 - x1) * 100}%`;
              const h = `${Math.max(0, y2 - y1) * 100}%`;
              return (
                <div
                  key={b.id}
                  className="pointer-events-auto absolute"
                  style={{ left, top, width: w, height: h }}
                >
                  {/* Pulse halo for High — sits BEHIND the main outline */}
                  {b.severity === "High" ? (
                    <div
                      className="pointer-events-none absolute -inset-[3px] rounded-[3px]"
                      style={{
                        border: `3px solid ${stroke}`,
                        animation: "cl-bbox-pulse 1.6s ease-in-out infinite",
                      }}
                    />
                  ) : null}

                  {/* Outline-only red box */}
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[2px]"
                    style={{
                      border: `${isHover ? 4 : 3}px solid ${stroke}`,
                      boxShadow: isHover
                        ? `0 0 0 1px rgba(0,0,0,0.55), 0 0 12px ${stroke}55`
                        : "0 0 0 1px rgba(0,0,0,0.55)",
                    }}
                  />

                  {/* Numbered badge anchored to top-left of bbox, slightly outside */}
                  <button
                    type="button"
                    onMouseEnter={() => setHoverId(b.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() =>
                      document
                        .getElementById(`finding-${b.id}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                    className="absolute -translate-x-1/3 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-lg ring-2 ring-black/40 transition hover:scale-110"
                    style={{
                      background: stroke,
                      color: "#0a0d12",
                      left: 0,
                      top: 0,
                    }}
                    aria-label={`Finding ${b.index + 1}: ${b.title}`}
                  >
                    #{b.index + 1}
                  </button>

                  {/* Hover tooltip with finding title */}
                  {isHover ? (
                    <div
                      className="pointer-events-none absolute left-0 z-10 min-w-[160px] -translate-y-full rounded-md px-2 py-1.5 text-[11px] font-medium shadow-xl"
                      style={{
                        bottom: "100%",
                        background: "rgba(7,9,13,0.95)",
                        color: "#f1f5f9",
                        border: `1px solid ${stroke}`,
                        marginTop: "-8px",
                      }}
                    >
                      <div
                        className="mb-0.5 text-[9px] font-bold uppercase tracking-wider"
                        style={{ color: stroke }}
                      >
                        {b.severity} · #{b.index + 1}
                      </div>
                      <div className="line-clamp-2">{b.title}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Severity legend */}
        {visibleBboxes.length > 0 && legendVisible ? (
          <div
            className="absolute right-2 top-2 flex flex-col gap-1 rounded-md border border-white/10 bg-black/70 px-2 py-1.5 text-[10px] backdrop-blur"
            style={{ animation: "cl-legend-fade 0.4s ease" }}
          >
            {(["High", "Medium"] as const).map((s) =>
              severityCounts[s] ? (
                <div key={s} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: severityColor(s) }}
                  />
                  <span className="text-white/90">
                    {s} · {severityCounts[s]}
                  </span>
                </div>
              ) : null,
            )}
          </div>
        ) : null}

        {/* Empty state */}
        {bboxes.length === 0 ? (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-xs text-white/80">
            No annotated findings on this photo.
          </div>
        ) : null}
      </div>

      {/* Quick severity summary (always visible) */}
      {bboxes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
          {(["High", "Medium", "Low"] as const).map((s) =>
            allSeverityCounts[s] ? (
              <span
                key={s}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: severityFill(s),
                  color: severityColor(s),
                  border: `1px solid ${severityColor(s)}55`,
                }}
              >
                {allSeverityCounts[s]} {s.toLowerCase()}
              </span>
            ) : null,
          )}
          <span className="text-[var(--fg-subtle)]">
            {visibleBboxes.length > 0
              ? "· Tap a number on the photo to jump to that finding"
              : "· Low-severity advisories listed below — none drawn on photo"}
          </span>
        </div>
      ) : null}

      <style>{`
        @keyframes cl-bbox-pulse {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50%      { opacity: 0.85; transform: scale(1.02); }
        }
        @keyframes cl-legend-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function severityColor(s: "Low" | "Medium" | "High") {
  if (s === "High") return "#f87171";
  if (s === "Medium") return "#f87171";
  return "#34d399";
}

function severityFill(s: "Low" | "Medium" | "High") {
  if (s === "High") return "rgba(248, 113, 113, 0.20)";
  if (s === "Medium") return "rgba(248, 113, 113, 0.14)";
  return "rgba(52, 211, 153, 0.16)";
}

/** Render a single inspector-drawn annotation as an SVG element. The
 *  PhotoAnnotator component owns the editable version; this is read-only. */
function renderAnnotation(a: Annotation) {
  const stroke = a.color;
  const strokeWidth = 0.0035;
  const minX = Math.min(a.x1, a.x2);
  const maxX = Math.max(a.x1, a.x2);
  const minY = Math.min(a.y1, a.y2);
  const maxY = Math.max(a.y1, a.y2);
  const w = maxX - minX;
  const h = maxY - minY;
  const markerId = `pwb-arrowhead-${a.color.replace(/[^a-z0-9]/gi, "")}`;

  if (a.type === "rect") {
    return (
      <rect
        key={a.id}
        x={minX}
        y={minY}
        width={w}
        height={h}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (a.type === "circle") {
    return (
      <ellipse
        key={a.id}
        cx={(minX + maxX) / 2}
        cy={(minY + maxY) / 2}
        rx={w / 2}
        ry={h / 2}
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
        key={a.id}
        x1={a.x1}
        y1={a.y1}
        x2={a.x2}
        y2={a.y2}
        stroke={stroke}
        strokeWidth={strokeWidth * 1.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        markerEnd={`url(#${markerId})`}
      />
    );
  }
  if (a.type === "text") {
    const cx = (a.x1 + a.x2) / 2;
    const cy = (a.y1 + a.y2) / 2;
    const fontSize = Math.max(0.018, Math.abs(a.y2 - a.y1));
    return (
      <text
        key={a.id}
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
