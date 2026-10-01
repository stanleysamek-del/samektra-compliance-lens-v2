import type { ReactNode } from "react";

/**
 * "Nothing here yet" block. Always says what's missing AND what to do
 * next — an empty list with no next step is a dead end.
 *
 *   <EmptyState title="No sections yet" action={<Button>Add section</Button>}>
 *     Sections group photos the way your report is organized.
 *   </EmptyState>
 *
 * `compact` is the inline variant for a panel; the default suits a page.
 */
export function EmptyState({
  title,
  children,
  action,
  icon,
  compact = false,
}: {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded border border-dashed border-[var(--rule-strong)] bg-[var(--paper-2)] text-center ${
        compact ? "gap-1.5 px-3 py-3" : "gap-2 px-5 py-8"
      }`}
    >
      {icon ? (
        <div aria-hidden className="text-[var(--fg-subtle)]">
          {icon}
        </div>
      ) : null}
      {title ? (
        <p className={`font-semibold text-[var(--ink)] ${compact ? "text-sm" : "text-base"}`}>{title}</p>
      ) : null}
      {children ? (
        <div className={`max-w-prose text-[var(--fg-muted)] ${compact ? "text-xs" : "text-sm"}`}>{children}</div>
      ) : null}
      {action ? <div className={compact ? "mt-1" : "mt-2"}>{action}</div> : null}
    </div>
  );
}
