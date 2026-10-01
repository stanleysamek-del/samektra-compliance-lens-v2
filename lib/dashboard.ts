export type DashboardInspection = { id: string; facility_id: string | null; facility_name: string; date_of_inspection: string | null; created_at: string; status: string };
export type DashboardFinding = { id: string; inspection_id: string; photo_id: string | null; title: string; category: string; severity: string; cap_status: string | null; cap_target_date: string | null; user_rating: number | null };
export type DashboardItem = { id: string; inspection_id: string; template_ref: string | null; template_name: string | null; section_code: string; section_title: string; answer: string | null; answered_by_ai: boolean; ai_confirmed: boolean; finding_id: string | null };
export type DashboardData = { inspections: DashboardInspection[]; findings: DashboardFinding[]; items: DashboardItem[] };
export type DashboardFilters = { campus: string; template: string; from: string; to: string };
export const campusKey = (i: DashboardInspection) => i.facility_id ? `facility:${i.facility_id}` : `legacy:${i.facility_name}`;
export const templateKey = (i: DashboardItem) => i.template_ref ?? `legacy:${i.template_name ?? "Unnamed template"}`;
export const groupKey = (i: DashboardItem) => JSON.stringify([templateKey(i), i.section_code, i.section_title]);

export function summarizeDashboard(data: DashboardData, filters: DashboardFilters, today: string) {
  const templateInspections = new Set(data.items.filter(i => templateKey(i) === filters.template).map(i => i.inspection_id));
  const templated = new Set(data.items.map(i => i.inspection_id));
  const inspections = data.inspections.filter(i => {
    const date = (i.date_of_inspection || i.created_at).slice(0, 10);
    return (!filters.campus || campusKey(i) === filters.campus)
      && (!filters.template || (filters.template === "none" ? !templated.has(i.id) : templateInspections.has(i.id)))
      && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  });
  const ids = new Set(inspections.map(i => i.id));
  const findings = data.findings.filter(f => ids.has(f.inspection_id));
  const findingsById = new Map(findings.map(f => [f.id, f]));
  const items = data.items.filter(i => ids.has(i.inspection_id) && (!filters.template || templateKey(i) === filters.template));
  const groups = new Map<string, { key: string; name: string; template: string; confirmedNo: number; pending: number; unanswered: number; answered: number; total: number; findingIds: Set<string> }>();
  for (const item of items) {
    const key = groupKey(item);
    const group = groups.get(key) ?? { key, name: `${item.section_code}. ${item.section_title}`, template: item.template_name || "Unnamed template", confirmedNo: 0, pending: 0, unanswered: 0, answered: 0, total: 0, findingIds: new Set<string>() };
    group.total++;
    if (item.answer === null) group.unanswered++;
    else if (item.answered_by_ai && !item.ai_confirmed) group.pending++;
    else { group.answered++; if (item.answer === "no") group.confirmedNo++; }
    const finding = item.finding_id ? findingsById.get(item.finding_id) : undefined;
    if (finding && finding.inspection_id === item.inspection_id) group.findingIds.add(finding.id);
    groups.set(key, group);
  }
  const linked = new Set([...groups.values()].flatMap(g => [...g.findingIds]));
  const active = findings.filter(f => f.cap_status !== "verified" && f.cap_status !== "wont_fix");
  const months = new Map<string, { inspections: number; findings: number }>();
  const countByInspection = new Map<string, number>();
  for (const f of findings) countByInspection.set(f.inspection_id, (countByInspection.get(f.inspection_id) ?? 0) + 1);
  for (const i of inspections) {
    const month = (i.date_of_inspection || i.created_at).slice(0, 7);
    const value = months.get(month) ?? { inspections: 0, findings: 0 };
    value.inspections++; value.findings += countByInspection.get(i.id) ?? 0; months.set(month, value);
  }
  return { inspections, findings, groups: [...groups.values()].sort((a,b) => b.confirmedNo - a.confirmedNo || a.name.localeCompare(b.name)),
    unassigned: findings.filter(f => !linked.has(f.id)), active: active.length,
    overdue: active.filter(f => f.cap_target_date && f.cap_target_date.slice(0,10) < today).length,
    confirmedNo: [...groups.values()].reduce((n,g) => n + g.confirmedNo,0),
    pending: [...groups.values()].reduce((n,g) => n + g.pending,0),
    months: [...months.entries()].sort(([a],[b]) => a.localeCompare(b)) };
}
