import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getBuiltinTemplate } from "@/lib/checklists/builtin-templates";
import { getCurrentOrg } from "@/lib/org/current";
import { TemplateEditor } from "../template-editor";

export const dynamic = "force-dynamic";

/** New custom template — blank, or seeded from a built-in via ?from=. */
export default async function NewTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/templates/new");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, organization")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const { from } = await searchParams;
  const seed = from ? getBuiltinTemplate(from) : null;
  const currentOrg = await getCurrentOrg();

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
          <Link
            href="/templates"
            className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            ← Templates
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--fg)]">
            {seed ? `Customize: ${seed.name}` : "New checklist template"}
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Phrase every question so &quot;Yes&quot; means compliant. AI match
            terms are optional — add them to questions the AI can judge from a
            photo, and it will flag those questions automatically as findings
            come in.
          </p>
        </div>
        <TemplateEditor
          initial={{
            name: seed ? `${seed.name} (custom)` : "",
            description: seed?.description ?? "",
            occupancy: seed?.occupancy ?? "",
            sections: seed?.sections ?? [],
          }}
          orgId={currentOrg?.id ?? null}
          orgName={currentOrg?.name ?? null}
        />
      </div>
    </AppShell>
  );
}
