import { severityColor, type Severity } from "@/lib/severity";

/**
 * The one severity badge. Solid fill (readable in glare) plus a glyph so
 * severity never depends on color alone.
 *
 *   size="md"  ▲ High          — finding cards, lists
 *   size="sm"  ▲ High          — dense rows, summaries
 *   compact    ▲               — icon-only (aria-label carries the text)
 */
export function SeverityBadge({
  severity,
  label,
  size = "md",
  compact = false,
  children,
}: {
  severity: Severity | string;
  /** Visible text; defaults to the severity name. */
  label?: string;
  size?: "sm" | "md";
  compact?: boolean;
  /** Overrides the label, e.g. a count: "3 High". */
  children?: React.ReactNode;
}) {
  const s = severityColor(severity);
  const text = children ?? label ?? severity;
  const sizing =
    size === "sm"
      ? "h-5 gap-1 px-1.5 text-[12px]"
      : "h-6 gap-1 px-2 text-[13px]";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none ${
        compact ? (size === "sm" ? "h-5 w-5 text-[11px]" : "h-6 w-6 text-[12px]") : sizing
      }`}
      style={{ background: s.solid, color: s.onSolid }}
      title={typeof text === "string" ? text : String(severity)}
      aria-label={compact ? (typeof label === "string" ? label : String(severity)) : undefined}
    >
      <span aria-hidden>{s.glyph}</span>
      {compact ? null : <span>{text}</span>}
    </span>
  );
}
