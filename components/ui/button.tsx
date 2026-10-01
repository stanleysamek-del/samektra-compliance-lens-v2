import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * The one button. Variants map to the .cl-btn-* classes in globals.css so
 * buttons built before this component and buttons built with it look the
 * same.
 *
 *   primary  ink fill — the main action on a screen
 *   accent   gold fill — "start / create" moments (Start inspection)
 *   outline  secondary actions
 *   ghost    low-emphasis, in toolbars and rows
 *   danger   destructive (Delete) — pair with confirmDialog()
 *
 * Sizes: "md" is 44px (48px on phones via CSS); "sm" is a compact 36px
 * on desktop that still grows to 44px on phones. A `loading` button is
 * disabled and shows `loadingLabel`, so double taps can't double-submit.
 */
export type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export function buttonClasses({
  variant = "outline",
  size = "md",
  block = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}): string {
  return [
    `cl-btn-${variant}`,
    size === "sm" ? "cl-btn-sm" : "",
    block ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  loadingLabel?: ReactNode;
  icon?: ReactNode;
};

export function Button({
  variant,
  size,
  block,
  loading = false,
  loadingLabel,
  icon,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
};

export function ButtonLink({
  variant,
  size,
  block,
  icon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
