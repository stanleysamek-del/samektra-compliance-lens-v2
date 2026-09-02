import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/card";
import { createInspection } from "./actions";
import { BUILTIN_TEMPLATES } from "@/lib/checklists/builtin-templates";

export default async function NewInspectionPage({
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
    .select("full_name, organization, phone, title")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  // Checklist templates: built-ins from code + this user's/org's customs.
  const { data: customTemplates } = await supabase
    .from("checklist_templates")
    .select("id, name, occupancy")
    .order("name");

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
            Set up the facility and inspector details, then start uploading photos.
          </p>
        </div>

        <Card>
          <form action={createInspection} className="flex flex-col gap-4">
            <div className="flex flex-col">
              <label htmlFor="facility_name" className="cl-label">
                Facility name <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="facility_name"
                name="facility_name"
                type="text"
                required
                placeholder="Mercy Health — Atlanta Campus"
                className="cl-input"
              />
            </div>

            <div className="flex flex-col">
              <label htmlFor="location" className="cl-label">
                Location
              </label>
              <input
                id="location"
                name="location"
                type="text"
                placeholder="ED · Smoke Compartment 3 · Wing B"
                className="cl-input"
              />
              <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
                Department, smoke compartment, or suite.
              </p>
            </div>

            <div className="flex flex-col">
              <label htmlFor="template_id" className="cl-label">
                Inspection type
              </label>
              <select id="template_id" name="template_id" className="cl-input">
                <option value="">General — photos only, no checklist</option>
                <optgroup label="Standard inspection types">
                  {BUILTIN_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.occupancy})
                    </option>
                  ))}
                </optgroup>
                {customTemplates && customTemplates.length > 0 ? (
                  <optgroup label="Your inspection types">
                    {customTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.occupancy ? ` (${t.occupancy})` : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <p className="mt-1.5 text-xs text-[var(--fg-subtle)]">
                Sets the scored checklist this walk follows — the AI answers
                questions from your photos. Manage types under{" "}
                <Link href="/templates" className="underline">
                  Templates
                </Link>
                .
              </p>
            </div>

            {/* Optional fields fold away so the phone form stays short —
                inspector defaults to the profile name and the date to today;
                everything is editable later from the detail page. */}
            <details className="rounded-lg border border-[var(--border)]">
              <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-[var(--fg-muted)]">
                More details — address, inspector, manager, dates
              </summary>
              <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
              <div className="flex flex-col">
                <label htmlFor="facility_address" className="cl-label">
                  Facility address
                </label>
                <input
                  id="facility_address"
                  name="facility_address"
                  type="text"
                  placeholder="123 Compliance Way, Atlanta, GA 30301"
                  className="cl-input"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="inspector_name" className="cl-label">
                  Inspector name
                </label>
                <input
                  id="inspector_name"
                  name="inspector_name"
                  type="text"
                  defaultValue={profile.full_name ?? ""}
                  className="cl-input"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col">
                  <label htmlFor="manager_assigned" className="cl-label">
                    Assigned manager
                  </label>
                  <input
                    id="manager_assigned"
                    name="manager_assigned"
                    type="text"
                    placeholder="Jane Smith"
                    className="cl-input"
                  />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="manager_assigned_email" className="cl-label">
                    Manager email
                  </label>
                  <input
                    id="manager_assigned_email"
                    name="manager_assigned_email"
                    type="email"
                    placeholder="jane@facility.com"
                    className="cl-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label htmlFor="date_of_inspection" className="cl-label">
                    Date of inspection
                  </label>
                  <input
                    id="date_of_inspection"
                    name="date_of_inspection"
                    type="date"
                    defaultValue={today}
                    className="cl-input"
                  />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="date_assigned" className="cl-label">
                    Date assigned (manager)
                  </label>
                  <input
                    id="date_assigned"
                    name="date_assigned"
                    type="date"
                    className="cl-input"
                  />
                </div>
              </div>
              </div>
            </details>

            {params.error ? (
              <p
                className="rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: "rgba(168,54,43,0.4)",
                  background: "rgba(168,54,43,0.08)",
                  color: "#a8362b",
                }}
              >
                {params.error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <button type="submit" className="cl-btn-accent w-full sm:w-auto sm:flex-1">
                Create & start uploading
              </button>
              <Link href="/inspections" className="cl-btn-outline w-full sm:w-auto">
                Cancel
              </Link>
            </div>
          </form>
        </Card>

        <p className="px-1 text-center text-[11px] text-[var(--fg-subtle)] sm:text-left">
          You can edit any of these fields later from the inspection detail page.
        </p>
      </div>
    </AppShell>
  );
}
