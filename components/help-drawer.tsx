"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Help drawer — a small `?` button in the AppShell header opens a slide-in
 * panel from the right with the loop explained, what each nav item does,
 * and a couple of keyboard hints. The goal is that any first-time user
 * can hit "?" and get unstuck in 10 seconds.
 *
 * Persistent affordance, dismissible, doesn't fight with the page.
 */
export function HelpDrawer() {
  const [open, setOpen] = useState(false);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg-muted)] transition hover:border-[var(--primary)] hover:text-[var(--fg)]"
        aria-label="Help"
        title="Help · what each section does"
      >
        <QuestionGlyph />
      </button>

      {open ? (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Panel */}
          <aside
            role="dialog"
            aria-label="Help"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-[var(--border)] bg-[var(--bg-raised)] shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--fg)]">
                Help & quick start
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
              >
                Esc · Close
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/* Who Chip is — say it once, plainly, before anything else. */}
              <section className="flex flex-col gap-1.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                  Meet Chip
                </h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  <strong className="text-[var(--fg)]">Chip is the AI that reads your photos.</strong>{" "}
                  Every photo you upload, Chip examines and drafts findings
                  with the code citation (NFPA / IBC / IFC / NEC / ADA) and a
                  fix. Chip drafts — you decide. Nothing is final until you
                  confirm it.
                </p>
              </section>

              {/* The loop */}
              <section className="mt-5 flex flex-col gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                  The loop
                </h3>
                <ol className="flex flex-col gap-1.5 text-xs text-[var(--fg-muted)]">
                  <Step n={1} title="Pick an inspection type" body="New inspection → choose a template (the question set for that kind of building). It becomes the checklist." />
                  <Step n={2} title="Snap photos" body="Equipment, walls, exits, gauges, tags. Take several at once — they queue." />
                  <Step n={3} title="Chip finds" body="Chip drafts findings with citations and auto-answers matching checklist questions. Confirm, correct, or add your own." />
                  <Step n={4} title="Assign actions" body="Turn a finding into a corrective action: an owner, a target date, a status. That's what surveyors ask to see." />
                  <Step n={5} title="Sign" body="Inspector and manager sign on the page. Signatures print on the PDF with timestamps." />
                  <Step n={6} title="Finalize & export" body="Finalize locks the report. Download the PDF, CAP, LSRA, and ILSM. Reopen any time." />
                </ol>
              </section>

              {/* What each nav does */}
              <section className="mt-5 flex flex-col gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                  Sidebar / nav
                </h3>
                <dl className="flex flex-col gap-1.5 text-xs">
                  <NavExplain term="Home" def="Dashboard: in-progress inspections, recent activity, this week's numbers." />
                  <NavExplain term="History" def="Every inspection you can see, grouped by Folder when you're in a team." />
                  <NavExplain term="Upload" def="The gold button — fastest way to a new inspection." />
                  <NavExplain term="Findings" def="Every finding across every inspection. Filter by severity, category, or rating; export CSV." />
                  <NavExplain term="Actions" def="The corrective-action board: what's open, who owns it, what's waiting on you to verify." />
                  <NavExplain term="Templates" def="The reusable checklist question sets you pick when creating an inspection. Edit or build your own." />
                  <NavExplain term="Team" def="Members, invites, folders, and Chip's team rules. On a phone, reach it from Profile." />
                  <NavExplain term="Profile" def="Your name, organization, team and templates links, sign out." />
                </dl>
              </section>

              {/* Words that get mixed up */}
              <section className="mt-5 flex flex-col gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                  Sections · Folders · Templates
                </h3>
                <dl className="flex flex-col gap-1.5 text-xs">
                  <NavExplain term="Sections" def="Group photos INSIDE one inspection (“Stair B”, “3 West”). They become the PDF headings." />
                  <NavExplain term="Folders" def="Group whole inspections on History. Teams only." />
                  <NavExplain term="Templates" def="The question sets. Chosen once, when you create the inspection." />
                </dl>
              </section>

              {/* Chip-specific notes */}
              <section className="mt-5 flex flex-col gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                  When Chip gets it wrong
                </h3>
                <ul className="flex flex-col gap-1 text-xs text-[var(--fg-muted)]">
                  <li>
                    <strong className="text-[var(--fg)]">Edit or delete</strong>{" "}
                    any finding, or add one Chip missed. Your edits are always
                    kept.
                  </li>
                  <li>
                    <strong className="text-[var(--fg)]">Coach Chip</strong> — a
                    conversation on the photo page: tell it what to look at and
                    it re-reads the photo.
                  </li>
                  <li>
                    <strong className="text-[var(--fg)]">Deep analyze</strong>{" "}
                    re-runs a stronger model after a few questions that change
                    which code applies.
                  </li>
                  <li>
                    <strong className="text-[var(--fg)]">✦ AI flagged</strong> on
                    a checklist question means a photo matched it and Chip
                    answered. Confirm, or overrule with Yes / No / N.A.
                  </li>
                </ul>
              </section>

              {/* Workspace context */}
              <section className="mt-5 flex flex-col gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
                  Personal vs team
                </h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  The dropdown in the header (top right) switches between your{" "}
                  <strong className="text-[var(--fg)]">Personal workspace</strong>{" "}
                  and any{" "}
                  <strong className="text-[var(--fg)]">Teams</strong> you belong
                  to. A team workspace is shared — every member sees the
                  team&apos;s inspections, folders, findings, and Chip&apos;s
                  rules. Switching changes what you see everywhere and where
                  new inspections save.
                </p>
              </section>

              {/* Shortcut to welcome */}
              <section className="mt-6 border-t border-[var(--border)] pt-4">
                <Link
                  href="/welcome"
                  className="cl-btn-outline w-full text-center"
                  onClick={() => setOpen(false)}
                >
                  Open the full guide →
                </Link>
              </section>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          background: "rgba(200,155,60,0.18)",
          color: "#b8902f",
        }}
      >
        {n}
      </span>
      <div>
        <span className="font-medium text-[var(--fg)]">{title}.</span>{" "}
        <span>{body}</span>
      </div>
    </li>
  );
}

function NavExplain({ term, def }: { term: string; def: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-mono font-semibold text-[var(--primary)]">
        {term}
      </dt>
      <dd className="text-[var(--fg-muted)]">{def}</dd>
    </div>
  );
}

function QuestionGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}
