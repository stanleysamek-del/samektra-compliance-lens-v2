import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";

export default async function InspectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  const insight = pickDailyInsight();

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-5">
        <Card variant="tinted-orange">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(249,115,22,0.14)", border: "1px solid rgba(249,115,22,0.28)" }}
            >
              <span className="text-lg font-bold text-[var(--accent)]">ST</span>
            </div>
            <div className="flex flex-1 flex-col">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--fg-muted)]">
                <span className="cl-status-dot online" />
                Online · Your Compliance Ally
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--fg)] sm:text-2xl">
                Welcome back, {profile.full_name.split(" ")[0] || profile.full_name}.
              </h1>
              {profile.organization ? (
                <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{profile.organization}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Link href="/inspections/new" className="cl-btn-accent w-full sm:w-auto sm:flex-1">
              + New Inspection
            </Link>
            <Link href="/inspections/history" className="cl-btn-outline w-full sm:w-auto sm:flex-1">
              History
            </Link>
          </div>
        </Card>

        <section className="grid grid-cols-3 gap-3">
          <StatCard label="Weekly Scans" value="0" />
          <StatCard label="Risks Found" value="0" tone="warning" />
          <StatCard label="Compliance" value="100%" tone="primary" />
        </section>

        <Card variant="tinted-orange">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
              💡 Daily Code Insight
            </div>
            <span className="text-[11px] text-[var(--fg-subtle)]">
              {insight.day} of {insight.totalDays}
            </span>
          </div>
          <h3 className="mt-3 text-base font-semibold tracking-tight text-[var(--fg)]">
            {insight.title}
          </h3>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
            ({insight.year}) {insight.subtitle}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">
            {insight.body}
          </p>
          <div className="mt-4 flex items-center justify-between text-xs text-[var(--fg-subtle)]">
            <span>Updates daily · Works offline</span>
          </div>
        </Card>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Recent Activity
            </h2>
            <Link
              href="/inspections/history"
              className="text-xs font-medium text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
            >
              See all
            </Link>
          </div>
          <Card padded={false}>
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: "rgba(148, 163, 184, 0.08)", color: "var(--fg-subtle)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--fg-muted)]">No recent scans</p>
              <p className="text-xs text-[var(--fg-subtle)]">
                Start a new inspection from the Upload tab.
              </p>
            </div>
          </Card>
        </section>

        <p className="px-1 pt-3 text-center text-[11px] text-[var(--fg-subtle)] sm:text-left">
          Compliance Lens v2 · Inspection flow rolls out incrementally · v1 remains live for production use
        </p>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "warning";
}) {
  const accent =
    tone === "primary" ? "var(--primary)" : tone === "warning" ? "var(--warning)" : "var(--fg)";
  return (
    <div className="cl-card flex flex-col gap-1 p-4">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--fg-subtle)]">
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}

type Insight = {
  day: number;
  totalDays: number;
  title: string;
  subtitle: string;
  year: number;
  body: string;
};

function pickDailyInsight(): Insight {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const idx = dayOfYear % CODE_INSIGHTS.length;
  return { ...CODE_INSIGHTS[idx], day: idx + 1, totalDays: CODE_INSIGHTS.length };
}

const CODE_INSIGHTS: Omit<Insight, "day" | "totalDays">[] = [
  {
    title: "NFPA 25 — Water-Based Fire Protection Systems",
    subtitle: "Reference Valves & Supervision",
    year: 2023,
    body: "Keep control valves accessible, identified, and supervised where required. A closed valve is one of the fastest ways to turn a compliant sprinkler system into a life-safety risk.",
  },
  {
    title: "NFPA 10 — Portable Fire Extinguishers",
    subtitle: "Mounting & Accessibility",
    year: 2022,
    body: "Extinguishers must be conspicuous, unobstructed, and mounted so the top is no more than 60 in. above the floor. ADA reach often pulls the handle to ≤ 48 in. — measure to the handle.",
  },
  {
    title: "NFPA 13 — Sprinkler Storage Clearance",
    subtitle: "18-inch Rule",
    year: 2022,
    body: "Storage must remain at least 18 in. below the sprinkler deflector. Anything closer disrupts the spray pattern and can render the head ineffective at the moment it matters.",
  },
  {
    title: "NFPA 80 — Fire Doors",
    subtitle: "Self-Closing & Positive Latching",
    year: 2022,
    body: "A propped fire door is no longer a fire door. Wedges, kick-downs, and unapproved hold-open devices defeat the rated assembly. Door must close and latch under its own power.",
  },
  {
    title: "NFPA 101 — Penetrations in Rated Barriers",
    subtitle: "Through-Penetration Firestopping",
    year: 2024,
    body: "Every cable, conduit, or pipe crossing a fire- or smoke-rated wall needs a tested, listed firestop assembly. Unsealed penetrations are a top finding nearly every survey.",
  },
  {
    title: "NEC 110.26 — Working Space at Electrical Equipment",
    subtitle: "36-inch Clear Depth",
    year: 2023,
    body: "Maintain at least 36 in. of clear working space in front of panels and disconnects rated 600 V or less. Storage in front of an electrical panel is a high-severity finding nearly every time.",
  },
];
