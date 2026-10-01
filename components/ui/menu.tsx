"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useOutsideClick } from "@/lib/use-outside-click";

/**
 * Dropdown menu — one implementation for every "⋯" / "Move to" / workspace
 * picker. Handles what the hand-rolled copies each did partially:
 *
 *  - closes on outside click/tap (iOS-safe), Esc, Tab, and after a choice
 *  - arrow keys / Home / End move between items; focus returns to the
 *    trigger on close
 *  - clicks don't bubble into a surrounding card <Link>
 *  - 44px items on phones
 *
 *   <Menu label="Inspection actions" trigger={<DotsIcon />}>
 *     <MenuLink href="/x">Open</MenuLink>
 *     <MenuItem tone="danger" onSelect={remove}>Delete</MenuItem>
 *   </Menu>
 */

const MenuContext = createContext<{ close: () => void } | null>(null);

export function Menu({
  label,
  trigger,
  triggerClassName,
  title,
  align = "right",
  width = "w-56",
  disabled = false,
  children,
}: {
  /** Accessible name for the trigger (required when trigger is icon-only). */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  title?: string;
  align?: "left" | "right";
  width?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);
  const closeQuietly = useCallback(() => setOpen(false), []);
  useOutsideClick(rootRef, open, closeQuietly);

  const items = () =>
    Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );

  // Focus the first item when the menu opens (keyboard and screen-reader
  // users land inside it).
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative inline-flex"
      // Menus often sit inside a clickable card; never navigate the card.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          className={`absolute top-full z-50 mt-1 ${width} overflow-hidden rounded border border-[var(--ink)] bg-[var(--paper-2)] py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <MenuContext.Provider value={{ close: () => close() }}>{children}</MenuContext.Provider>
        </div>
      ) : null}
    </div>
  );
}

const itemClass = (tone: "default" | "danger", selected: boolean) =>
  [
    "flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm transition sm:min-h-9",
    "hover:bg-[var(--paper-3)] focus-visible:bg-[var(--paper-3)] focus-visible:outline-none",
    tone === "danger" ? "text-[var(--danger)]" : "text-[var(--ink)]",
    selected ? "font-semibold" : "",
  ].join(" ");

/** A menu action. Closes the menu, then runs onSelect. */
export function MenuItem({
  onSelect,
  tone = "default",
  selected = false,
  children,
  type = "button",
  ...rest
}: Omit<ComponentProps<"button">, "onSelect"> & {
  onSelect?: () => void;
  tone?: "default" | "danger";
  /** Marks the current choice in a picker (e.g. the current folder). */
  selected?: boolean;
}) {
  const ctx = useContext(MenuContext);
  return (
    <button
      type={type}
      role="menuitem"
      aria-current={selected || undefined}
      className={itemClass(tone, selected)}
      onClick={(e) => {
        // Submit buttons (type="submit") must reach their form first.
        if (type !== "submit") e.preventDefault();
        ctx?.close();
        onSelect?.();
      }}
      {...rest}
    >
      {children}
      {selected ? (
        <span aria-hidden className="ml-auto text-xs">
          ✓
        </span>
      ) : null}
    </button>
  );
}

export function MenuLink({
  tone = "default",
  children,
  ...rest
}: ComponentProps<typeof Link> & { tone?: "default" | "danger" }) {
  const ctx = useContext(MenuContext);
  return (
    <Link role="menuitem" className={itemClass(tone, false)} onClick={() => ctx?.close()} {...rest}>
      {children}
    </Link>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-[var(--rule-paper)]" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.08em] text-[var(--fg-subtle)]">
      {children}
    </div>
  );
}
