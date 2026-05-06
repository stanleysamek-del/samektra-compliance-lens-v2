import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardDescription, CardTitle } from "@/components/card";
import { SamektraMark } from "@/components/logo";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/inspections");
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-2">
          <SamektraMark size={28} />
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
            Samektra
          </span>
        </div>
        <Link
          href="/login"
          className="text-sm font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
        >
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col px-5 pb-12 pt-6 sm:px-8 sm:pt-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
          <div className="flex flex-col gap-5 text-center sm:gap-6 sm:text-left">
            <span className="inline-flex items-center justify-center gap-2 self-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--fg-muted)] sm:self-start">
              <span className="cl-status-dot online" />
              Your Compliance Ally
            </span>
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-[var(--fg)] sm:text-5xl md:text-6xl">
              AI-powered code compliance,{" "}
              <span className="text-[var(--primary)]">in your pocket.</span>
            </h1>
            <p className="text-balance text-base leading-relaxed text-[var(--fg-muted)] sm:text-lg">
              Walk a building. Snap a photo. Compliance Lens flags violations,
              cites the code, and exports your CAP, LSRA, ILSM, and signed PDF
              report — covering NFPA, IBC, IFC, NEC, CMS, The Joint Commission,
              ADA, ANSI, and Georgia Title 25.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="cl-btn-primary">
                Create your account
              </Link>
              <Link href="/login" className="cl-btn-outline">
                I already have an account
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <div
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: "rgba(20,184,166,0.12)", color: "var(--primary)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
              </div>
              <CardTitle>Snap & analyze</CardTitle>
              <CardDescription className="mt-1.5">
                Photos are instantly inspected against fire, electrical, egress, ADA, and infection-control rules.
              </CardDescription>
            </Card>
            <Card>
              <div
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: "rgba(249,115,22,0.12)", color: "var(--accent)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 3 4 6v6c0 4.5 3.4 8.5 8 9 4.6-.5 8-4.5 8-9V6l-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <CardTitle>Edit & verify</CardTitle>
              <CardDescription className="mt-1.5">
                AI flags. You confirm. Severity, code citations, and bounding boxes are all editable before sign-off.
              </CardDescription>
            </Card>
            <Card>
              <div
                className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ background: "rgba(20,184,166,0.12)", color: "var(--primary)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M8 13h8M8 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </div>
              <CardTitle>Export deliverables</CardTitle>
              <CardDescription className="mt-1.5">
                CAP, LSRA, ILSM as Excel — plus a signed PDF inspection report ready for the manager and the file.
              </CardDescription>
            </Card>
          </div>

          <p className="pt-2 text-center text-xs text-[var(--fg-subtle)]">
            Compliance Lens v2 · Samektra · A staging build of the live app
          </p>
        </div>
      </main>
    </div>
  );
}
