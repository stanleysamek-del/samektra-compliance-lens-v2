"use client";

import { useEffect, type RefObject } from "react";

/**
 * Close-on-outside-click that works on touch devices too.
 *
 * The naive `document.addEventListener("mousedown", ...)` pattern misses
 * tap events on iOS Safari — touch events don't always synthesize a
 * mousedown before the touchend, so the menu stays open after the user
 * taps elsewhere. Listening for both event types fixes it without
 * double-firing (the second event hits an already-closed menu and no-ops).
 *
 * The handler also defends against re-entry: when the menu is already
 * closed (`active` is false) we don't attach listeners at all.
 */
export function useOutsideClick<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!active) return;
    function handle(e: Event) {
      const node = ref.current;
      if (!node) return;
      const target = e.target as Node | null;
      if (target && !node.contains(target)) onClose();
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [ref, active, onClose]);
}
