"use client";

import { useState } from "react";

type BBox = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  index: number;
  severity: "Low" | "Medium" | "High";
};

type Props = {
  src: string;
  width: number;
  height: number;
  bboxes: BBox[];
  highlightedId?: string | null;
};

/**
 * Renders the photo with overlaid bounding boxes. Coordinates are stored
 * normalized in [0, 1] so they survive resizing — we just multiply by the
 * rendered dimensions.
 */
export function PhotoWithBoxes({ src, width, height, bboxes }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const aspect = width && height ? `${width} / ${height}` : "16 / 9";

  return (
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
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        {bboxes.map((b) => {
          const stroke = severityColor(b.severity);
          const isHover = hoverId === b.id;
          return (
            <g key={b.id}>
              <rect
                x={b.x1}
                y={b.y1}
                width={Math.max(0, b.x2 - b.x1)}
                height={Math.max(0, b.y2 - b.y1)}
                fill="none"
                stroke={stroke}
                strokeWidth={isHover ? 0.005 : 0.0035}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      {/* Number badges in HTML for crisp text */}
      {bboxes.map((b) => {
        const left = `${b.x1 * 100}%`;
        const top = `${b.y1 * 100}%`;
        return (
          <button
            key={b.id}
            type="button"
            onMouseEnter={() => setHoverId(b.id)}
            onMouseLeave={() => setHoverId(null)}
            onClick={() =>
              document
                .getElementById(`finding-${b.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-md transition"
            style={{
              left,
              top,
              background: severityColor(b.severity),
              color: "#0a0d12",
            }}
          >
            #{b.index + 1}
          </button>
        );
      })}
    </div>
  );
}

function severityColor(s: "Low" | "Medium" | "High") {
  if (s === "High") return "#f87171";
  if (s === "Medium") return "#fbbf24";
  return "#cbd5e1";
}
