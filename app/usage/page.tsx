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
  const { data, error } = await supabase.rpc("ai_allowance_summary", { _org_id: org?.id ?? null });
  const allowance = data as {
    active: boolean; plan?: string; ownerAllowance?: boolean;
    spent: number; held: number; used: number; limit: number; warningAt: number;
    credits: number; creditLimit: number;
  } | null;
  const active = !error && allowance?.active;
  const money = (value: number) => `$${Number(value).toFixed(2)}`;
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
            {active ? allowance.ownerAllowance ? "Owner complimentary AI" : allowance.plan : "Field (free)"}
          </h2>
          <p>
            {active
              ? `Allowance usage${allowance.ownerAllowance ? " since activation" : " this month"}: ${allowance.credits} of ${allowance.creditLimit} credits.`
              : "Manual captures, checklists, findings, and exports remain available without paid AI."}
          </p>
          {active && (
            <div className="space-y-2">
              <p className="text-lg font-semibold">{money(allowance.used)} of {money(allowance.limit)} used or reserved</p>
              <p>{money(allowance.spent)} in reported charges · {money(allowance.held)} in unresolved holds.</p>
              {allowance.ownerAllowance && <p>Your verified owner account includes standard and advanced AI. This $10 allowance does not reset each month.</p>}
              {allowance.used >= allowance.warningAt && (
                <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-950">
                  AI spending is approaching your {money(allowance.limit)} limit. Review charges and holds before increasing the allowance.
                </p>
              )}
            </div>
          )}
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
              AI usage could not be verified. Please try again or contact the operator.
            </p>
          )}
        </section>
        <p>
          Paid access is activated after payment verification; the verified owner account has a complimentary allowance. Signing up or
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
