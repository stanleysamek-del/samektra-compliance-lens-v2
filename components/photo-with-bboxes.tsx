"use client";

import { useEffect, useState } from "react";

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

type Props = {
  src: string;
  width: number;
  height: number;
  bboxes: BBox[];
};

/**
 * Photo with overlaid finding indicators.
 *
 * Only Medium / High severity findings are drawn on the photo (in red,
 * outline-only). Low-severity advisories appear in the findings list below
 * but are NOT drawn on the photo — keeps the image readable.
 *
 * Each visible bbox renders:
 *   - red outline-only rectangle (no fill) with non-scaling-stroke
 *   - pulsing halo on High-severity boxes (animated stroke opacity)
 *   - numbered, red badge floating just above the box
 *   - hover tooltip with the finding title
 *   - click jumps to the matching finding card below
 *
 * The severity-summary pill row underneath the photo still shows Low
 * counts so the user knows there are advisories to review.
 */
export function PhotoWithBoxes({ src, width, height, bboxes }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [legendVisible, setLegendVisible] = useState(true);
  const aspect = width && height ? `${width} / ${height}` : "16 / 9";

  // Only render boxes for real deficiencies (Medium / High).
  // Low-severity advisories still appear in the findings list below the photo
  // but we don't draw them on the image — keeps the photo readable.
  const visibleBboxes = bboxes.filter(
    (b) => b.severity === "Medium" || b.severity === "High",
  );

  // Hide legend after 5s if there are findings (let the photo breathe).
  useEffect(() => {
    if (visibleBboxes.length === 0) return;
    const t = setTimeout(() => setLegendVisible(false), 5000);
    return () => clearTimeout(t);
  }, [visibleBboxes.length]);

  const severityCounts = visibleBboxes.reduce(
    (acc, b) => {
      acc[b.severity] = (acc[b.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<"Low" | "Medium" | "High", number>,
  );

  // Full counts (incl. Low) used for the summary pill row below the photo,
  // since Low advisories still appear in the findings list.
  const allSeverityCounts = bboxes.reduce(
    (acc, b) => {
      acc[b.severity] = (acc[b.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<"Low" | "Medium" | "High", number>,
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black"
        style={{ aspectRatio: aspect }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
        />

        {/* SVG layer: filled bboxes + pulse halos */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          <defs>
            {visibleBboxes.map((b) => (
              <filter
                key={`glow-${b.id}`}
                id={`glow-${b.id}`}
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="0.004" />
              </filter>
            ))}
          </defs>
          {visibleBboxes.map((b) => {
            const stroke = severityColor(b.severity);
            const isHover = hoverId === b.id;
            const w = Math.max(0, b.x2 - b.x1);
            const h = Math.max(0, b.y2 - b.y1);
            return (
              <g key={b.id}>
                {/* Pulse halo for High — outline only, animated stroke */}
                {b.severity === "High" ? (
                  <rect
                    x={b.x1}
                    y={b.y1}
                    width={w}
                    height={h}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={isHover ? 0.014 : 0.010}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.5}
                    style={{ animation: "cl-bbox-pulse 1.6s ease-in-out infinite" }}
                  />
                ) : null}
                {/* Outline-only box */}
                <rect
                  x={b.x1}
                  y={b.y1}
                  width={w}
                  height={h}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isHover ? 0.007 : 0.005}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>

        {/* HTML layer: numbered badges + hover tooltips */}
        {visibleBboxes.map((b) => {
          const stroke = severityColor(b.severity);
          const left = `${b.x1 * 100}%`;
          const top = `${b.y1 * 100}%`;
          const isHover = hoverId === b.id;
          return (
            <div
              key={b.id}
              className="absolute"
              style={{
                left,
                top,
                width: `${(b.x2 - b.x1) * 100}%`,
                height: `${(b.y2 - b.y1) * 100}%`,
              }}
            >
              {/* Numbered badge anchored to top-left of bbox */}
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

        {/* Severity legend (auto-fades) — only High/Medium since those are the only boxes drawn */}
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

      {/* Quick severity summary (always visible) — surfaces Low advisories
          here even though they don't get drawn on the photo. */}
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
   