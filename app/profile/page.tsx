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

        {profile.is_admin ? (
          <Card variant="tinted-orange">
            <CardTitle>Admin tools</CardTitle>
            <CardDescription className="mt-1.5">
              You have admin access. Cost dashboards and per-user usage are
              available below.
            </CardDescription>
            <Link
              href="/admin/stats"
              className="cl-btn-accent mt-4 w-full sm:w-auto"
            >
              Open AI cost dashboard
            </Link>
          </Card>
        ) : null}

        <Card>
          <CardTitle>About Compliance Lens v2</CardTitle>
          <CardDescription className="mt-2">
            This is the staging build for the next version of Compliance Lens.
            The live production app remains untouched while the v2 inspection
            flow ships incrementally.
          </CardDescription>
        </Card>
      </div>
    </AppShell>
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
