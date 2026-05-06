import type { HTMLAttributes, PropsWithChildren } from "react";

type Variant = "default" | "tinted-orange" | "tinted-teal";

type Props = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & { variant?: Variant; padded?: boolean }
>;

/**
 * Standard card surface. Dark navy with a subtle border + inner highlight.
 * Tinted variants add a soft orange or teal radial glow in one corner —
 * used for hero/dashboard cards and the Daily Code Insight card.
 */
export function Card({
  variant = "default",
  padded = true,
  className,
  children,
  ...rest
}: Props) {
  const variantClass =
    variant === "tinted-orange"
      ? "cl-card-tinted-orange"
      : variant === "tinted-teal"
        ? "cl-card-tinted-teal"
        : "cl-card";

  return (
    <div
      className={[variantClass, padded ? "p-5 sm:p-6" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <h3
      className={[
        "text-base font-semibold tracking-tight text-[var(--fg)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <p
      className={[
        "text-sm leading-relaxed text-[var(--fg-muted)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </p>
  );
}
