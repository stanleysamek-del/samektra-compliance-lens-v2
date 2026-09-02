import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { TeamNav } from "@/components/team-nav";
import { HelpTip } from "@/components/help-tip";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/format-date";
import { getCurrentOrg } from "@/lib/org/current";
import {
  createLearnedRule,
  archiveLearnedRule,
  unarchiveLearnedRule,
  deleteLearnedRule,
} from "./actions";

/**
 * Chip's rules — organization-scoped house rules taught by inspectors.
 *
 * Members can see the active list (so they know what Chip will apply).
 * Admins can also see archived rules, create new ones, edit, archive,
 * and delete. The RLS policies in migration 0017 enforce all of this.
 */
export default async function TeamRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
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

  const userShell = {
    fullName: profile.full_name,
    organization: profile.organization,
    email: user.email ?? null,
  };

  const { error } = await searchParams;
  const currentOrg = await getCurrentOrg();

  const rulesTip = (
    <HelpTip title="What are Chip's rules?" side="bottom">
      <p>
        Rules are plain-English instructions added to every photo analysis
        for this team (&ldquo;in our ORs, always check door bottom
        clearance&rdquo;). They apply from the next photo on and never
        change the underlying model.
      </p>
      <p className="mt-1.5">
        &ldquo;Teach Chip this&rdquo; in a Coach thread saves the correction
        here.
      </p>
    </HelpTip>
  );

  if (!currentOrg) {
    // Personal workspace has no shared rules to show. Explain why instead
    // of bouncing to /team — a silent redirect reads as a broken tab.
    return (
      <AppShell user={userShell}>
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
              Personal workspace
            </p>
            <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Chip&apos;s rules
              {rulesTip}
            </h1>
          </div>

          <TeamNav />

          <Card>
            <p className="text-sm font-medium text-[var(--fg)]">
              Chip&apos;s rules are shared per team.
            </p>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              Create or join a team to teach Chip house rules that apply to
              every photo your team analyzes.
            </p>
            <Link href="/team" className="cl-btn-primary mt-4 inline-block">
              Create or join a team
            </Link>
          </Card>
        </div>
      </AppShell>
    );
  }

  const org = currentOrg;
  const isAdmin = org.role === "admin";

  // Pull rules — RLS limits members to active rules, admins see everything.
  const { data: ruleRows } = await supabase
    .from("learned_rules")
    .select(
      "id, rule_text, status, times_applied, created_at, updated_at, created_by, source_finding_id, source_photo_id",
    )
    .eq("organization_id", org.id)
    .order("status", { ascending: true }) // active before archived
    .order("created_at", { ascending: false });

  const rules = ruleRows ?? [];
  const active = rules.filter((r) => r.status === "active");
  const archived = rules.filter((r) => r.status === "archived");

  // Look up display names for the rule authors. One lookup, indexed.
  const authorIds = Array.from(new Set(rules.map((r) => r.created_by).filter(Boolean)));
  const authorNames = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: authorRows } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", authorIds as string[]);
    for (const a of authorRows ?? []) {
      authorNames.set(a.user_id as string, (a.full_name as string) ?? "—");
    }
  }

  return (
    <AppShell user={userShell}>
      <div className="flex flex-col gap-5">
        {/* Header — same shape on every Team tab: eyebrow = team name,
            h1 = the tab you're on. */}
        <div>
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
            {org.name}
          </p>
          <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            Chip&apos;s rules
            {rulesTip}
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            House rules that Chip applies on every photo this team analyzes.
            When you correct Chip in the Coach thread, use{" "}
            <span className="font-medium text-[var(--fg)]">
              &ldquo;Teach Chip this&rdquo;
            </span>{" "}
            to save the correction as a permanent rule.
          </p>
        </div>

        <TeamNav />

        {error ? (
          <div
            className="rounded-lg border px-3 py-2 text-xs"
            style={{
              borderColor: "rgba(168,54,43,0.4)",
              background: "rgba(168,54,43,0.08)",
              color: "#a8362b",
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Create form — admins only */}
        {isAdmin ? (
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Teach Chip a new rule
            </h2>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              Free-form natural language. Be specific about the trigger
              (&ldquo;when you see a sprinkler-head close-up&hellip;&rdquo;)
              and the action (&ldquo;&hellip;always check for a missing
              escutcheon plate&rdquo;). Max 2,000 characters.
            </p>
            <form action={createLearnedRule} className="mt-3 flex flex-col gap-2">
              <textarea
                name="rule_text"
                required
                rows={4}
                maxLength={2000}
                placeholder="When you see a sprinkler-head close-up, always check for a missing escutcheon plate around the drop pipe and emit a Medium NFPA 13 finding if absent."
                className="cl-input resize-y py-2 text-sm"
                style={{ minHeight: 96 }}
              />
              <div className="flex justify-end">
                <SubmitButton className="cl-btn-accent" pendingLabel="Saving…">
                  Save rule
                </SubmitButton>
              </div>
            </form>
          </Card>
        ) : (
          <p className="text-xs text-[var(--fg-muted)]">
            Only team admins can add or edit rules. You can still see what
            Chip applies on each analysis below.
          </p>
        )}

        {/* Active rules list */}
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Active · {active.length}
          </h2>
          {active.length === 0 ? (
            <Card>
              <p className="text-center text-sm text-[var(--fg-muted)]">
                No rules yet. Coach Chip on a photo, then tap{" "}
                <span className="font-medium text-[var(--fg)]">
                  &ldquo;Teach Chip this&rdquo;
                </span>{" "}
                to save your first one.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {active.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5"
                >
                  <p className="text-sm leading-relaxed text-[var(--fg)]">
                    {r.rule_text}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p
                      className="text-[10px] uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      Applied {r.times_applied}{" "}
                      {r.times_applied === 1 ? "time" : "times"} ·{" "}
                      {authorNames.get(r.created_by as string) ?? "—"} ·{" "}
                      {formatDate(r.created_at)}
                      {r.source_finding_id ? " · taught from a finding" : ""}
                    </p>
                    {isAdmin ? (
                      <div className="flex items-center gap-1.5">
                        <form action={archiveLearnedRule}>
                          <input type="hidden" name="rule_id" value={r.id} />
                          <button
                            type="submit"
                            className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
                          >
                            Archive
                          </button>
                        </form>
                        <HelpTip title="What does Archive do?">
                          <p>
                            Stops Chip from applying this rule on new
                            analyses — effective immediately, no redeploy
                            needed. The rule itself isn&apos;t deleted; it
                            moves to the Archived section below where
                            admins can review the history.
                          </p>
                          <p className="mt-1.5">
                            From archived you can{" "}
                            <span className="font-medium">Restore</span> the
                            rule (it goes back to active) or{" "}
                            <span className="font-medium">Delete</span> it
                            permanently. Use Archive when you&apos;re not
                            sure whether a rule is still right —
                            you can always restore it later. Use Delete
                            only after you&apos;re certain.
                          </p>
                        </HelpTip>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Archived rules — admin-only (RLS hides them from members) */}
        {isAdmin && archived.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-subtle)]">
              Archived · {archived.length}
            </h2>
            <ul className="flex flex-col gap-2">
              {archived.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/50 px-3 py-2.5 opacity-70"
                >
                  <p className="text-sm leading-relaxed text-[var(--fg-muted)] line-through">
                    {r.rule_text}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p
                      className="text-[10px] uppercase tracking-[0.14em] text-[var(--fg-subtle)]"
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      Applied {r.times_applied}{" "}
                      {r.times_applied === 1 ? "time" : "times"} ·{" "}
                      {authorNames.get(r.created_by as string) ?? "—"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <form action={unarchiveLearnedRule}>
                        <input type="hidden" name="rule_id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
                        >
                          Restore
                        </button>
                      </form>
                      <HelpTip title="What does Restore do?">
                        <p>
                          Flips the rule&apos;s status back to{" "}
                          <span className="font-medium">Active</span>.
                          Chip will start applying it again on the next
                          photo analyzed by this team — no redeploy
                          needed. The{" "}
                          <span className="font-medium">times applied</span>{" "}
                          counter resumes from where it left off so the
                          history stays continuous.
                        </p>
                      </HelpTip>
                      {/* Delete is only reachable from archived, but it is
                          permanent, so it still confirms. */}
                      <form action={deleteLearnedRule}>
                        <input type="hidden" name="rule_id" value={r.id} />
                        <SubmitButton
                          className="rounded px-2 py-1 text-[11px] font-medium text-[#a8362b] transition hover:bg-[rgba(168,54,43,0.08)] disabled:opacity-50"
                          pendingLabel="Deleting…"
                          confirmMessage="Delete this rule permanently? Archive keeps the history; delete does not."
                        >
                          Delete
                        </SubmitButton>
                      </form>
                      <HelpTip title="What does Delete do?">
                        <p>
                          <span className="font-medium" style={{ color: "#a8362b" }}>
                            Permanent.
                          </span>{" "}
                          Removes the rule row entirely — author, history,
                          times-applied counter, all gone. There&apos;s no
                          undo and no audit trail afterward.
                        </p>
                        <p className="mt-1.5">
                          Only delete if you&apos;re sure the rule was a
                          mistake you don&apos;t want recorded. Archive is
                          almost always the better choice — it stops the
                          rule from firing but keeps the history for
                          future review.
                        </p>
                      </HelpTip>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="px-1 text-[11px] text-[var(--fg-subtle)]">
          Rules are appended to the AI prompt on every photo analysis run
          by this team. They <em>don&apos;t</em> retrain the underlying
          model — each rule is an instruction Chip follows on every photo
          going forward. Archive a rule to stop applying it.{" "}
          <Link
            href="/team/members"
            className="text-[var(--fg-muted)] underline transition hover:text-[var(--fg)]"
          >
            Manage who can edit rules
          </Link>
          .
        </p>
      </div>
    </AppShell>
  );
}
