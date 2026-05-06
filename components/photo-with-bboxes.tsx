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
 * Each bbox renders:
 *   - semi-transparent fill in severity color
 *   - solid stroke with vector-effect non-scaling-stroke (consistent thickness)
 *   - pulsing halo on High-severity boxes
 *   - numbered, severity-colored badge floating just above the box
 *   - hover tooltip with the finding title
 *   - click jumps to the matching finding card below
 *
 * A severity legend in the top-right corner indicates what the colors mean.
 */
export function PhotoWithBoxes({ src, width, height, bboxes }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [legendVisible, setLegendVisible] = useState(true);
  const aspect = width && height ? `${width} / ${height}` : "16 / 9";

  // Hide legend after 5s if there are findings (let the photo breathe).
  useEffect(() => {
    if (bboxes.length === 0) return;
    const t = setTimeout(() => setLegendVisible(false), 5000);
    return () => clearTimeout(t);
  }, [bboxes.length]);

  const severityCounts = bboxes.reduce(
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
            {bboxes.map((b) => (
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
          {bboxes.map((b) => {
            const stroke = severityColor(b.severity);
            const fill = severityFill(b.severity);
            const isHover = hoverId === b.id;
            const w = Math.max(0, b.x2 - b.x1);
            const h = Math.max(0, b.y2 - b.y1);
            return (
              <g key={b.id}>
                {/* Pulse halo for High */}
                {b.severity === "High" ? (
                  <rect
                    x={b.x1}
                    y={b.y1}
                    width={w}
                    height={h}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={isHover ? 0.012 : 0.008}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.4}
                    style={{ animation: "cl-bbox-pulse 1.6s ease-in-out infinite" }}
                  />
                ) : null}
                {/* Fill */}
                <rect
                  x={b.x1}
                  y={b.y1}
                  width={w}
                  height={h}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isHover ? 0.006 : 0.004}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>

        {/* HTML layer: numbered badges + hover tooltips */}
        {bboxes.map((b) => {
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

        {/* Severity legend (auto-fades) */}
        {bboxes.length > 0 && legendVisible ? (
          <div
            className="absolute right-2 top-2 flex flex-col gap-1 rounded-md border border-white/10 bg-black/70 px-2 py-1.5 text-[10px] backdrop-blur"
            style={{ animation: "cl-legend-fade 0.4s ease" }}
          >
            {(["High", "Medium", "Low"] as const).map((s) =>
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
            severityCounts[s] ? (
              <span
                key={s}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: severityFill(s),
                  color: severityColor(s),
                  border: `1px solid ${severityColor(s)}55`,
                }}
              >
                {severityCounts[s]} {s.toLowerCase()}
              </span>
            ) : null,
          )}
          <span className="text-[var(--fg-subtle)]">
            · Tap a number on the photo to jump to that finding
          </span>
        </div>
      ) : null}

      <style>{`
        @keyframes cl-bbox-pulse {
          0%, 100% { opacity: 0.2; }
          50%      { opacity: 0.7; }
        }
        @keyframes cl-legend-fade {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function severityColor(s: "Low" | "Medium" | "High") {
  if (s === "High") return "#f87171";
  if (s === "Medium") return "#fbbf24";
  return "#cbd5e1";
}

function severityFill(s: "Low" | "Medium" | "High") {
  if (s === "High") return "rgba(248, 113, 113, 0.18)";
  if (s === "Medium") return "rgba(251, 191, 36, 0.16)";
  return "rgba(203, 213, 225, 0.10)";
}
