import type { SVGProps } from "react";

/**
 * Samektra "ST" mark — silver/orange wedge stack.
 * Inspired by the Samektra Compliance Lens app icon. Drawn as inline SVG
 * so it scales cleanly and inherits color tokens.
 */
export function SamektraMark({
  size = 36,
  ...rest
}: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...rest}
    >
      <defs>
        <linearGradient id="cl-st-orange" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="cl-st-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#94a3b8" />
        </linearGradient>
      </defs>
      {/* Background tile */}
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0d1117" />
      <rect
        x="2.5"
        y="2.5"
        width="59"
        height="59"
        rx="13.5"
        fill="none"
        stroke="rgba(148,163,184,0.18)"
      />
      {/* Stylized S — silver wedge */}
      <path
        d="M14 22 L34 14 L42 22 L26 28 L18 22 Z"
        fill="url(#cl-st-silver)"
      />
      <path
        d="M18 30 L42 22 L42 30 L22 38 L18 38 Z"
        fill="url(#cl-st-silver)"
        opacity="0.85"
      />
      {/* T — orange accent */}
      <path
        d="M22 38 L50 32 L50 40 L40 42 L40 52 L32 50 L32 44 L22 46 Z"
        fill="url(#cl-st-orange)"
      />
    </svg>
  );
}

/**
 * Wordmark — mark + "Samektra" text. Inline so it picks up the surrounding
 * color theme.
 */
export function SamektraWordmark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={["inline-flex items-center gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <SamektraMark size={size} />
      <span
        className="font-semibold tracking-tight"
        style={{ fontSize: Math.round(size * 0.62) }}
      >
        Samektra
      </span>
    </span>
  );
}
