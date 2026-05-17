import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { TeamNav } from "@/components/team-nav";
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
  if (!currentOrg) {
    // Personal workspace doesn't support org rules — send the user back
    // to the team picker.
    redirect("/team");
  }

  const org = currentOrg!;
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
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--fg-subtle)]">
            Current team
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            Chip&apos;s rules
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
                <button type="submit" className="cl-btn-accent">
                  Save rule
                </button>
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
                      {new Date(r.created_at).toLocaleDateString()}
                      {r.source_finding_id ? " · taught from a finding" : ""}
                    </p>
                    {isAdmin ? (
                      <div className="flex items-center gap-2">
                        <form action={archiveLearnedRule}>
                          <input type="hidden" name="rule_id" value={r.id} />
                          <button
                            type="submit"
                            className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
                            title="Archive — Chip stops applying this rule but the entry is kept for audit"
                          >
                            Archive
                          </button>
                        </form>
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
                    <div className="flex items-center gap-2">
                      <form action={unarchiveLearnedRule}>
                        <input type="hidden" name="rule_id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded px-2 py-1 text-[11px] font-medium text-[var(--fg-muted)] transition hover:bg-white/[0.05] hover:text-[var(--fg)]"
                        >
                          Restore
                        </button>
                      </form>
                      {/* Delete is a server-action form. Archive-first is
                          the recommended flow (the dashed/strikethrough
                          state above already makes the rule inactive), so
                          we deliberately skip a confirm dialog here —
                          delete is only ever reachable from archived. */}
                      <form action={deleteLearnedRule}>
                        <input type="hidden" name="rule_id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded px-2 py-1 text-[11px] font-medium transition hover:bg-[rgba(168,54,43,0.08)]"
                          style={{ color: "#a8362b" }}
                          title="Permanently delete this archived rule"
                        >
                          Delete
                        </button>
                      </form>
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
