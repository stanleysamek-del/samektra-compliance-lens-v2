"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  to: number;
  duration?: number;
  suffix?: string;
  decimals?: number;
};

/**
 * Animates a number from 0 to `to` using easeOutCubic. Starts the
 * animation when the element scrolls into view (IntersectionObserver),
 * not on mount — so off-screen stats don't burn through their reveal
 * before the user gets there. Respects prefers-reduced-motion.
 */
export function CountUp({ to, duration = 1300, suffix = "", decimals = 0 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const triggeredRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Reduced motion → just show the final value immediately.
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(to);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !triggeredRef.current) {
            triggeredRef.current = true;
            const start = performance.now();
            let frame = 0;
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / duration);
              const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
              setValue(to * eased);
              if (t < 1) {
                frame = requestAnimationFrame(tick);
              } else {
                setValue(to);
              }
            };
            frame = requestAnimationFrame(tick);
            observer.disconnect();
            return () => cancelAnimationFrame(frame);
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref}>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}
