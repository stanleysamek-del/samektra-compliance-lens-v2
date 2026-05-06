import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardDescription, CardTitle } from "@/components/card";

export default async function NewInspectionPage() {
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
      <div className="flex flex-col gap-5">
        <div>
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--fg-subtle)]">
            Step 1 of 3
          </span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            New inspection
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Set up the facility and inspector details, then start uploading
            photos.
          </p>
        </div>

        <Card variant="tinted-teal">
          <CardTitle>Coming soon</CardTitle>
          <CardDescription className="mt-2">
            The inspection setup form is the next thing we ship: facility name
            and address, location (department / smoke compartment / suite),
            inspector name, manager assignment, dates, and signatures. Photo
            upload &amp; AI analysis follow on the next step.
          </CardDescription>
        </Card>

        <Card>
          <CardTitle>What you&apos;ll be able to do here</CardTitle>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm text-[var(--fg-muted)]">
            <li className="flex items-start gap-2">
              <Bullet /> Capture or upload photos of any building area
            </li>
            <li className="flex items-start gap-2">
              <Bullet /> Get AI-flagged violations with NFPA, IBC, IFC, NEC
              citations
            </li>
            <li className="flex items-start gap-2">
              <Bullet /> Edit findings, severity, and remediation before
              finalization
            </li>
            <li className="flex items-start gap-2">
              <Bullet /> Export CAP, LSRA, ILSM (Excel) and a signed PDF
              report
            </li>
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}

function Bullet() {
  return (
    <span
      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: "var(--primary)" }}
    />
  );
}
