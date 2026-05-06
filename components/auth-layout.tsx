import Link from "next/link";
import type { PropsWithChildren } from "react";
import { SamektraMark } from "@/components/logo";

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

/**
 * Centered card layout used by all unauthenticated auth pages
 * (login, signup, forgot-password, reset-password, onboarding, error).
 */
export function AuthLayout({ title, subtitle, children }: Props) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* Top brand strip */}
      <header className="flex h-14 items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <SamektraMark size={28} />
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
            Samektra
          </span>
        </Link>
        <span className="text-xs text-[var(--fg-subtle)]">
          Compliance Lens
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16 pt-6 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col gap-1.5 text-center sm:text-left">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="cl-card p-5 sm:p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
