"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Check, Circle, X } from "lucide-react";

/**
 * First-run setup checklist on Home. Steps are computed on the server from
 * real data, so a box ticks itself the moment the thing exists — nobody
 * marks anything done by hand. Hides when every step is done or when the
 * user dismisses it (remembered per device, per workspace owner).
 */

export type SetupStep = {
  key: string;
  title: string;
  hint: string;
  href: string;
  cta: string;
  done: boolean;
  /** Nice to have, not needed to run an inspection. */
  optional?: boolean;
};

const KEY = "cl-setup-dismissed";
const EVENT = "cl:setup-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  // Server render: treat as dismissed (render nothing) so there's no flash
  // of a card the user already closed; the real value arrives on hydration.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const done = steps.filter((s) => s.done).length;
  if (dismissed || done === steps.length) return null;

  // Highlight the next REQUIRED step; optional ones stay quieter outlines.
  const next = steps.find((s) => !s.done && !s.optional) ?? steps.find((s) => !s.done);

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Blocked storage: it just reappears next visit.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <section
      aria-labelledby="setup-heading"
      className="rounded border border-[var(--ink)] bg-[var(--paper-2)]"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h2 id="setup-heading" className="text-base font-semibold text-[var(--ink)]">
            Get set up
            <span className="ml-2 text-sm font-normal tabular-nums text-[var(--fg-muted)]">
              {done} of {steps.length} done
            </span>
          </h2>
          <div
            className="mt-2 h-1.5 w-48 max-w-full overflow-hidden rounded-full bg-[var(--paper-3)]"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
          >
            <div
              className="h-full rounded-full bg-[var(--ink)]"
              style={{ width: `${(done / steps.length) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide the setup checklist"
          title="Hide this checklist"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <ol className="mt-2 divide-y divide-[var(--rule-paper)]">
        {steps.map((s) => {
          const isNext = s.key === next?.key;
          return (
            <li key={s.key} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  s.done
                    ? "border-[var(--success)] bg-[var(--success)] text-white"
                    : "border-[var(--rule-strong)] text-[var(--fg-subtle)]"
                }`}
              >
                {s.done ? <Check size={14} strokeWidth={3} /> : <Circle size={6} fill="currentColor" />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    s.done ? "text-[var(--fg-muted)] line-through decoration-1" : "text-[var(--ink)]"
                  }`}
                >
                  {s.title}
                  {s.optional && !s.done ? (
                    <span className="ml-1.5 text-xs font-normal text-[var(--fg-subtle)]">optional</span>
                  ) : null}
                </p>
                {!s.done ? <p className="text-xs text-[var(--fg-muted)]">{s.hint}</p> : null}
              </div>
              {!s.done ? (
                <Link
                  href={s.href}
                  className={`${isNext ? "cl-btn-primary" : "cl-btn-outline"} cl-btn-sm shrink-0`}
                >
                  {s.cta}
                </Link>
              ) : null}
              {s.done ? <span className="sr-only">Done</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
