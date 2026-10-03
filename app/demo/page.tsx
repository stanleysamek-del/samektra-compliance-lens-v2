import type { Metadata } from "next";
import Link from "next/link";
import { DemoWalkthrough } from "@/components/demo/demo-walkthrough";

export const metadata: Metadata = {
  title: "Try an inspection",
  description:
    "Work a sample hospital corridor inspection in your browser — answer the checklist, record a deficiency, assign an action and see the report. No account needed.",
};

/**
 * Public demo — no sign-in, no database, no AI calls. The walkthrough is
 * one client component holding its own state; the field tokens (.cl-app)
 * give it the same look as the signed-in app.
 */
export default function DemoPage() {
  return (
    <div className="cl-app min-h-dvh">
      <header className="border-b border-[var(--ink)]">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link href="/" className="text-lg text-[var(--ink)]" style={{ fontFamily: "var(--font-instrument-serif)" }}>
            Compliance <em style={{ color: "var(--gold-text)" }}>Lens</em>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="cl-btn-outline cl-btn-sm">
              Sign in
            </Link>
            <Link href="/signup" className="cl-btn-primary cl-btn-sm">
              Create account
            </Link>
          </div>
        </div>
      </header>
      <main>
        <DemoWalkthrough />
      </main>
    </div>
  );
}
