import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";

/**
 * /welcome — the post-onboarding orientation hub. Three clear paths so a
 * first-time user immediately knows what they can do, instead of being
 * dropped onto an empty Home page that says "Welcome back" with nothing
 * to act on.
 *
 * Accessible any time from the AppShell help drawer too — useful as a
 * "what does this app do again?" refresher.
 */
export default async function WelcomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-6">
        <header className="text-center sm:text-left">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
            Getting started
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)] sm:text-3xl">
            Welcome to Compliance Lens, {profile.full_name.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Walk a building. Snap photos. Chip drafts the findings with the
            code citation; you confirm them, assign the fixes, sign, and
            export the report.
          </p>
        </header>

        {/* Who Chip is — the one name a new user must learn. */}
        <Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
            Meet Chip
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-muted)]">
            <strong className="text-[var(--fg)]">Chip is the AI that reads your photos.</strong>{" "}
            Every photo you upload, Chip examines and drafts findings with a
            citation (NFPA / IBC / IFC / NEC / ADA) and a suggested fix, and
            answers any checklist question the photo covers. Chip drafts —
            you decide. Nothing goes on the report until you confirm it, and
            anything you edit or write yourself is always kept.
          </p>
        </Card>

        {/* The loop explained, briefly */}
        <Card variant="tinted-teal">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LoopStep
              n={1}
              title="Pick an inspection type"
              body="New inspection → choose a template. Its questions become the checklist you score."
            />
            <LoopStep
              n={2}
              title="Snap photos"
              body="Equipment, walls, exits, gauges, tags. Take several at once — they queue and analyze in the background."
            />
            <LoopStep
              n={3}
              title="Chip finds"
              body="Findings with citations appear under each photo; matching checklist questions get auto-answered. Confirm, correct, or add your own."
            />
            <LoopStep
              n={4}
              title="Assign actions"
              body="Turn each finding into a corrective action with an owner, a target date, and a status. The Actions board tracks them to Verified."
            />
            <LoopStep
              n={5}
              title="Sign"
              body="Inspector and manager sign right on the page. Signatures print on the PDF with timestamps."
            />
            <LoopStep
              n={6}
              title="Finalize & export"
              body="Finalize locks the report. Download the PDF, CAP, LSRA, and ILSM. Reopen any time to edit."
            />
          </div>
        </Card>

        {/* Three path cards */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PathCard
            badge="Path 1"
            title="Start your first inspection"
            body="Pick an inspection type, add a few photos, watch Chip draft the findings."
            cta="New inspection"
            href="/inspections/new"
            recommended
          />
          <PathCard
            badge="Path 2"
            title="Create a team"
            body="Invite coworkers to share inspections, folders, and findings."
            cta="Set up team"
            href="/team"
          />
          <PathCard
            badge="Path 3"
            title="Learn the basics"
            body="See what each section does and how the workflow fits together."
            cta="Open Home"
            href="/inspections"
          />
        </section>

        {/* Cheat sheet */}
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Cheat sheet
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <CheatItem label="Home" body="Dashboard: in-progress inspections, recent activity, this week's numbers." />
            <CheatItem label="History" body="Every inspection you can access, grouped by Folder when you're in a team." />
            <CheatItem
              label="Upload"
              body="The gold button — the fastest way to start a new inspection."
            />
            <CheatItem label="Findings" body="Every finding across every inspection: filter by severity, category, rating; export CSV." />
            <CheatItem
              label="Actions"
              body="The corrective-action board — what's open, who owns it, what's waiting on you to verify."
            />
            <CheatItem
              label="Templates"
              body="Reusable checklist question sets. Pick one when creating an inspection; edit or build your own."
            />
            <CheatItem
              label="Team"
              body="Members, invites, folders, and Chip's team rules. On a phone, reach it from Profile."
            />
            <CheatItem label="Profile" body="Your name, organization, links to Team and Templates, sign out." />
          </ul>
        </Card>

        {/* The three words that get mixed up */}
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Sections vs. Folders vs. Templates
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            <CheatItem
              label="Sections"
              body="Group photos inside ONE inspection (“Stair B”, “3 West”). They become the PDF headings."
            />
            <CheatItem
              label="Folders"
              body="Group whole inspections on the History page. Teams only."
            />
            <CheatItem
              label="Templates"
              body="The question sets. Chosen once, when you create the inspection."
            />
          </ul>
        </Card>

        {/* What comes out */}
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            What you export
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <CheatItem
              label="PDF"
              body="The signed inspection report: every photo, the finding under it, the citation, and both signatures with timestamps."
            />
            <CheatItem
              label="CAP"
              body="Corrective Action Plan — a spreadsheet of every deficiency, the fix, the owner, the target date, and status."
            />
            <CheatItem
              label="LSRA"
              body="Life Safety Risk Assessment — scores each deficiency by Impact × Severity into a Risk Level (ASHE convention)."
            />
            <CheatItem
              label="ILSM"
              body="Interim Life Safety Measures — the compensating measures you document while a deficiency waits for its fix."
            />
          </ul>
        </Card>

        {/* Skip-ahead footer */}
        <div className="flex flex-col items-center gap-1.5 pt-2">
          <Link
            href="/inspections"
            className="text-xs font-medium text-[var(--fg-muted)] transition hover:text-[var(--fg)]"
          >
            Skip to home →
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function LoopStep({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-1 items-start gap-3">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{
          background: "rgba(20,184,166,0.18)",
          color: "#5eead4",
        }}
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight text-[var(--fg)]">
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-muted)]">
          {body}
        </p>
      </div>
    </div>
  );
}
function PathCard({
  badge,
  title,
  body,
  cta,
  href,
  recommended,
}: {
  badge: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  recommended?: boolean;
}) {
  return (
    <Card padded={false} className="flex flex-col p-5">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{
            background: "rgba(148,163,184,0.10)",
            color: "var(--fg-subtle)",
          }}
        >
          {badge}
        </span>
        {recommended ? (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
            style={{
              background: "rgba(249,115,22,0.14)",
              color: "var(--accent)",
            }}
          >
            Start here
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-base font-semibold tracking-tight text-[var(--fg)]">
        {title}
      </h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--fg-muted)]">
        {body}
      </p>
      <Link
        href={href}
        className={[
          "mt-4 inline-flex w-full items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition",
          recommended
            ? "bg-[var(--accent)] text-[#0a0d12] hover:bg-[var(--accent-hover)]"
            : "border border-[var(--border-strong)] text-[var(--fg)] hover:border-[var(--primary)]",
        ].join(" ")}
      >
        {cta} →
      </Link>
    </Card>
  );
}

function CheatItem({ label, body }: { label: string; body: string }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 font-mono font-semibold text-[var(--primary)]">
        {label}
      </span>
      <span className="text-[var(--fg-muted)]">{body}</span>
    </li>
  );
}
