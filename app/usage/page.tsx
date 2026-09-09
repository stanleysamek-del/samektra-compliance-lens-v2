import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org/current";

export default async function UsagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const org = await getCurrentOrg();
  let query = supabase
    .from("ai_entitlements")
    .select("id, plan, active_until, monthly_credits, monthly_budget_usd");
  query = org
    ? query.eq("organization_id", org.id)
    : query.eq("user_id", user.id);
  const { data: plan, error } = await query.maybeSingle();
  const active = plan && new Date(plan.active_until) > new Date();
  const { data: usage } = await supabase
    .from("ai_usage_reservations")
    .select("credits, reserved_usd, settled")
    .eq("entitlement_id", plan?.id ?? "00000000-0000-0000-0000-000000000000")
    .gte(
      "created_at",
      new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      ).toISOString(),
    );
  const credits = (usage ?? []).reduce((sum, row) => sum + row.credits, 0);
  return (
    <AppShell
      user={{
        fullName: String(
          user.user_metadata?.full_name ?? user.email ?? "Inspector",
        ),
      }}
    >
      <div className="mx-auto max-w-3xl space-y-6 px-5 py-12">
        <Link href="/inspections" className="underline">
          Back to inspections
        </Link>
        <h1 className="text-3xl font-semibold">AI plan and usage</h1>
        <p>{org ? org.name : "Personal workspace"}</p>
        <section className="space-y-3 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">
            {active ? plan.plan : "Field (free)"}
          </h2>
          <p>
            {active
              ? `Your usage this month: ${credits} credits. Plan allowance: ${plan.monthly_credits} credits.`
              : "Manual captures, checklists, findings, and exports remain available without paid AI."}
          </p>
          <p>
            Standard analysis and coaching use 1 credit per attempt. Advanced
            review uses 5 and requires Facility or Healthcare access. Automatic
            escalation uses a separate advanced allowance.
          </p>
          <p>
            Shared plans also have a spending ceiling. Failed or interrupted
            calls retain a conservative budget hold until reconciled, so retries
            cannot spend without limit.
          </p>
          {error && (
            <p role="status">
              AI plans are not configured yet. Paid model calls remain disabled.
            </p>
          )}
        </section>
        <p>
          Paid access is activated after payment verification. Signing up or
          changing a browser setting cannot unlock paid AI. Viewers can read
          shared reports but cannot spend the team&apos;s AI allowance.
        </p>
        <Link
          href="mailto:hello@compliancelens.app?subject=Compliance%20Lens%20plan%20request"
          className="cl-btn-primary"
        >
          Request a plan or usage review
        </Link>
        <Link href="/demo" className="ml-4 underline">
          Try the free guided example
        </Link>
      </div>
    </AppShell>
  );
}
