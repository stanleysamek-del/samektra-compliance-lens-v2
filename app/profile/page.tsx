import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardDescription, CardTitle } from "@/components/card";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, title, organization, is_admin")
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
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
            Profile
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            These details show up on inspection reports and CAP exports.
          </p>
        </div>

        <Card>
          <dl className="flex flex-col divide-y divide-[var(--border)]">
            <Field label="Full name" value={profile.full_name} />
            <Field label="Email" value={user.email ?? "—"} />
            <Field label="Phone" value={profile.phone ?? "—"} />
            <Field label="Title" value={profile.title ?? "—"} />
            <Field label="Organization" value={profile.organization ?? "—"} />
          </dl>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/onboarding"
              className="cl-btn-outline w-full sm:w-auto"
            >
              Edit details
            </Link>
            <form
              action="/auth/sign-out"
              method="post"
              className="w-full sm:w-auto"
            >
              <button
                type="submit"
                className="cl-btn-outline w-full sm:w-auto"
              >
                Sign out
              </button>
            </form>
          </div>
        </Card>

        {/* Workspace links — the phone tab bar can't reach these, so the
            profile is where they live on mobile. */}
        <Card>
          <CardTitle>Workspace</CardTitle>
          <CardDescription className="mt-1.5">
            Teams, templates, and the other screens that aren&apos;t on the
            tab bar.
          </CardDescription>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            <WorkspaceLink
              href="/team"
              title="Team"
              description="Share inspections with coworkers, manage members, and teach Chip house rules."
            />
            <WorkspaceLink
              href="/facilities"
              title="Facilities"
              description="Buildings you inspect, with their life safety plans — pin findings on the plan."
            />
            <WorkspaceLink
              href="/templates"
              title="Checklist templates"
              description="The question sets an inspection follows. Duplicate a built-in or write your own."
            />
            <WorkspaceLink
              href="/actions"
              title="Actions"
              description="Every corrective action across every inspection — overdue first."
            />
            <WorkspaceLink
              href="/findings"
              title="Findings"
              description="Every finding across every inspection, with CSV export."
            />
          </ul>
        </Card>

        {profile.is_admin ? (
          <Card variant="tinted-orange">
            <CardTitle>Admin tools</CardTitle>
            <CardDescription className="mt-1.5">
              You have admin access. Cost dashboards and per-user usage are
              available below.
            </CardDescription>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link href="/admin/stats" className="cl-btn-accent w-full sm:w-auto">
                Open AI cost dashboard
              </Link>
              <Link href="/admin/users" className="cl-btn-outline w-full sm:w-auto">
                Members directory
              </Link>
            </div>
          </Card>
        ) : null}

        <p className="px-1 text-xs text-[var(--fg-subtle)]">
          About Compliance Lens: photo-first life-safety inspections by
          Samektra. Photos go in; findings with code citations, corrective
          actions, and a signed report come out.
        </p>
      </div>
    </AppShell>
  );
}

function WorkspaceLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-[44px] items-center justify-between gap-3 py-2.5 transition hover:text-[var(--primary)]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--fg)]">
            {title}
          </span>
          <span className="block text-xs text-[var(--fg-muted)]">
            {description}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[var(--fg-subtle)]">
          →
        </span>
      </Link>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-sm font-medium text-[var(--fg)]">{value}</dd>
    </div>
  );
}
