import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import type { TemplateSection } from "@/lib/checklists/builtin-templates";
import { TemplateEditor } from "../template-editor";

export const dynamic = "force-dynamic";

/** Edit an existing custom template (RLS scopes who can see/save it). */
export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { id } = await params;
  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, description, occupancy, org_id, sections")
    .eq("id", id)
    .maybeSingle();
  if (!template) notFound();

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
            Edit: {template.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Changes apply to FUTURE inspections only — existing inspections
            keep the checklist they started with.
          </p>
        </div>
        <TemplateEditor
          templateId={template.id}
          initial={{
            name: template.name,
            description: template.description ?? "",
            occupancy: template.occupancy ?? "",
            sections: (template.sections ?? []) as TemplateSection[],
          }}
          orgId={template.org_id}
        />
      </div>
    </AppShell>
  );
}
