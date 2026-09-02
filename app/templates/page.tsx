import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardTitle } from "@/components/card";
import { BUILTIN_TEMPLATES } from "@/lib/checklists/builtin-templates";

export const dynamic = "force-dynamic";

/**
 * Checklist template library: built-ins (view / duplicate & customize)
 * plus this user's/team's custom templates (edit / delete).
 */
export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/templates");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const { data: custom } = await supabase
    .from("checklist_templates")
    .select("id, name, description, occupancy, org_id, sections, created_by")
    .order("name");

  const questionCount = (sections: unknown): number => {
    if (!Array.isArray(sections)) return 0;
    return sections.reduce(
      (n: number, s: { items?: unknown[] }) =>
        n + (Array.isArray(s.items) ? s.items.length : 0),
      0,
    );
  };

  return (
    <AppShell
      user={{
        fullName: profile.full_name,
        organization: profile.organization,
        email: user.email ?? null,
      }}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
              Checklist templates
            </h1>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              Each template defines an <strong>inspection type</strong> — the
              scored question set the walk follows. Pick one under
              &quot;Inspection type&quot; on the New Inspection screen; the AI
              files findings under the matching questions as photos come in.
            </p>
          </div>
          <Link href="/templates/new" className="cl-btn-accent">
            + New template
          </Link>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Built-in
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BUILTIN_TEMPLATES.map((t) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>{t.name}</CardTitle>
                  <span className="shrink-0 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                    {t.occupancy}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-[var(--fg-muted)]">
                  {t.description}
                </p>
                <p className="mt-2 text-xs text-[var(--fg-subtle)]">
                  {t.sections.length} sections ·{" "}
                  {t.sections.reduce((n, s) => n + s.items.length, 0)} questions
                </p>
                <Link
                  href={`/templates/new?from=${encodeURIComponent(t.id)}`}
                  className="cl-btn-outline mt-3 inline-block text-sm"
                >
                  Duplicate & customize
                </Link>
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
            Your templates
          </h2>
          {custom && custom.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {custom.map((t) => (
                <Card key={t.id}>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{t.name}</CardTitle>
                    {t.org_id ? (
                      <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Team
                      </span>
                    ) : null}
                  </div>
                  {t.description ? (
                    <p className="mt-1.5 text-sm text-[var(--fg-muted)]">
                      {t.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--fg-subtle)]">
                    {Array.isArray(t.sections) ? t.sections.length : 0} sections
                    · {questionCount(t.sections)} questions
                    {t.occupancy ? ` · ${t.occupancy}` : ""}
                  </p>
                  <Link
                    href={`/templates/${t.id}`}
                    className="cl-btn-outline mt-3 inline-block text-sm"
                  >
                    Edit
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <p className="text-sm text-[var(--fg-muted)]">
                No custom templates yet. Duplicate a built-in above and adjust
                it to your facility, or start from scratch with{" "}
                <Link href="/templates/new" className="text-[var(--accent)] underline">
                  New template
                </Link>
                .
              </p>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
