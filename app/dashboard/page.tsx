import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/org/current";
import { AppShell } from "@/components/app-shell";
import { CampusDashboard } from "@/components/campus-dashboard";
import type { DashboardData, DashboardInspection, DashboardFinding, DashboardItem } from "@/lib/dashboard";

export default async function DashboardPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("profiles").select("full_name, organization").eq("user_id",user.id).maybeSingle();
  if (!profile) redirect("/onboarding");
  const org = await getCurrentOrg();
  let data: DashboardData = { inspections: [], findings: [], items: [] };
  let failed = false;
  try {
    // Page through RLS-protected rows. Never show a truncated set as a total.
    async function readPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
      const rows: T[] = [];
      for (let offset = 0; offset <= 20000; offset += 500) {
        const result = await fetchPage(offset, offset + 499);
        if (result.error) throw new Error("Dashboard data unavailable");
        const page = result.data as T[];
        if (offset === 20000 && page.length) throw new Error("Dashboard capacity exceeded");
        rows.push(...page);
        if (page.length < 500) return rows;
      }
      return rows;
    }
    const inspections = await readPages<DashboardInspection>((from,to) => {
      let q = db.from("inspections").select("id, facility_id, facility_name, date_of_inspection, created_at, status").order("id").range(from,to);
      q = org ? q.eq("organization_id",org.id) : q.is("organization_id",null).eq("created_by",user.id);
      return q;
    });
    const findings: DashboardFinding[] = []; const items: DashboardItem[] = [];
    for (let start = 0; start < inspections.length; start += 100) {
      const ids = inspections.slice(start,start+100).map(i => i.id);
      const [f,c] = await Promise.all([
        readPages<DashboardFinding>((from,to) => db.from("findings").select("id, inspection_id, photo_id, title, category, severity, cap_status, cap_target_date, user_rating").in("inspection_id",ids).order("id").range(from,to)),
        readPages<DashboardItem>((from,to) => db.from("inspection_checklist_items").select("id, inspection_id, template_ref, template_name, section_code, section_title, answer, answered_by_ai, ai_confirmed, finding_id").in("inspection_id",ids).order("id").range(from,to)),
      ]);
      findings.push(...f); items.push(...c);
      if (findings.length + items.length > 40000) throw new Error("Dashboard capacity exceeded");
    }
    data = { inspections, findings, items };
  } catch (error) { failed = true; console.error("[dashboard]",error instanceof Error ? error.message : "Query failed"); }
  return <AppShell user={{ fullName: profile.full_name, organization: profile.organization, email: user.email ?? null }}>
    {failed ? <div role="alert" className="cl-card p-6">Dashboard totals could not be loaded completely. Refresh to retry. If this persists, contact your administrator. No partial totals are shown.</div>
      : <CampusDashboard data={data} workspace={org?.name ?? "Personal workspace"} />}
  </AppShell>;
}
