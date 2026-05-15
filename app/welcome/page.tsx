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
            Walk a building. Snap photos. Chip flags violations, cites the
            code, and writes the report. Three quick paths to start.
          </p>
        </header>

        {/* The loop explained, briefly */}
        <Card variant="tinted-teal">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <LoopStep n={1} title="Snap" body="Take photos of equipment, walls, exits, gauges, tags." />
            <Sep />
            <LoopStep
              n={2}
              title="Coach Chip"
              body="Chip writes findings with NFPA / IBC / IFC / NEC citations. You confirm or correct."
            />
            <Sep />
            <LoopStep
              n={3}
              title="Export"
              body="Download the signed PDF, CAP, LSRA, and ILSM for the file."
            />
          </div>
        </Card>

        {/* Three path cards */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PathCard
            badge="Path 1"
            title="Start your first inspection"
            body="Fill in the facility, add a few photos, see Chip in action."
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
            <CheatItem label="Home" body="Dashboard, recent activity, daily code insight." />
            <CheatItem label="History" body="Every inspection you can access, grouped by Folder when you're in a team." />
            <CheatItem
              label="Upload"
              body="Big orange button — the fastest way to start a new inspection."
            />
            <CheatItem label="Findings" body="Cross-inspection analytics: severity, category, trend, deep-links to the photo." />
            <CheatItem
              label="Team"
              body="Members, invites, folders, and team-wide rollups."
            />
            <CheatItem label="Profile" body="Your name, organization, sign out." />
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
function Sep() {
  return (
    <div
      aria-hidden
      className="hidden h-auto w-px self-stretch bg-[var(--border)] sm:block"
    />
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
