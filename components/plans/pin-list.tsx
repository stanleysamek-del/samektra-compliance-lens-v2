import Link from "next/link";
import { PIN_COLORS, type ViewerPin } from "@/components/plans/types";
import { severityColor } from "@/lib/severity";

/**
 * Compact legend under a plan: number → title → link. Pure markup, so it
 * renders from server or client components alike.
 */
export function PinList({
  pins,
  emptyText = "No pins on this plan yet.",
}: {
  pins: ViewerPin[];
  emptyText?: string;
}) {
  if (pins.length === 0) {
    return <p className="text-xs text-[var(--fg-subtle)]">{emptyText}</p>;
  }
  const sorted = pins
    .slice()
    .sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));
  return (
    <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
      {sorted.map((pin) => {
        const color =
          pin.kind === "finding" && pin.severity
            ? severityColor(pin.severity).fg
            : PIN_COLORS[pin.kind];
        return (
          <li key={pin.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{
                background: color,
                fontFamily: "var(--font-jetbrains-mono, ui-monospace, monospace)",
              }}
              aria-hidden
            >
              {pin.number != null ? pin.number : "•"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[var(--fg)]">{pin.title}</p>
              <p className="truncate text-xs text-[var(--fg-muted)]">
                {[pin.subtitle, pin.label].filter(Boolean).join(" · ")}
              </p>
            </div>
            {pin.href ? (
              <Link
                href={pin.href}
                className="shrink-0 text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Open ↗
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
