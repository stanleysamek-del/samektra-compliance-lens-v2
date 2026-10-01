"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/card";
import { campusKey, templateKey, summarizeDashboard, type DashboardData, type DashboardFilters } from "@/lib/dashboard";

export function CampusDashboard({ data, workspace }: { data: DashboardData; workspace: string }) {
  const [filters, setFilters] = useState<DashboardFilters>({ campus: "", template: "", from: "", to: "" });
  const [group, setGroup] = useState("");
  const [view, setView] = useState("groups");
  const result = useMemo(() => summarizeDashboard(data,filters,new Date().toISOString().slice(0,10)),[data,filters]);
  const campuses = [...new Map(data.inspections.map(i => [campusKey(i), `${i.facility_name}${i.facility_id ? "" : " (unlinked)"}`])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
  const campusIds = new Set(data.inspections.filter(i => !filters.campus || campusKey(i) === filters.campus).map(i => i.id));
  const templates = [...new Map(data.items.filter(i => campusIds.has(i.inspection_id)).map(i => [templateKey(i),i.template_name || "Unnamed template"])).entries()].sort((a,b) => a[1].localeCompare(b[1]));
  const selectedGroup = result.groups.find(g => g.key === group);
  const visibleFindings = group === "unassigned" ? result.unassigned : selectedGroup ? result.findings.filter(f => selectedGroup.findingIds.has(f.id)) : result.findings;
  function change(key: keyof DashboardFilters, value: string) {
    setFilters(previous => ({...previous,[key]:value,...(key === "campus" ? { template: "" } : {})})); setGroup("");
  }
  function exportCsv() {
    const cell = (value: unknown) => `"${String(value ?? "").replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`;
    const rows: unknown[][] = [["Workspace", workspace],["Campus",campuses.find(([id]) => id === filters.campus)?.[1] || "All"],["Template",templates.find(([id]) => id === filters.template)?.[1] || (filters.template === "none" ? "No checklist" : "All")],["From",filters.from],["To",filters.to],["Template","Group","Confirmed No answers","AI answers awaiting review","Unanswered","Linked finding records"]];
    for (const g of result.groups) rows.push([g.template,g.name,g.confirmedNo,g.pending,g.unanswered,g.findingIds.size]);
    rows.push(["","Findings without group", "","","",result.unassigned.length]);
    const url = URL.createObjectURL(new Blob(["\uFEFF"+rows.map(r => r.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
    const a = document.createElement("a"); a.href=url; a.download="campus-dashboard.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Campus dashboard</h1><p className="text-sm text-[var(--fg-muted)]">{workspace} · Inspection coverage, findings, and follow-up</p></div><button className="cl-btn-outline" onClick={exportCsv}>Export group counts</button></div>
    <Card><div className="grid gap-3 sm:grid-cols-2">
      <label className="cl-label">Campus / facility<select className="cl-input mt-1" value={filters.campus} onChange={e => change("campus",e.target.value)}><option value="">All campuses</option>{campuses.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="cl-label">Inspection template<select className="cl-input mt-1" value={filters.template} onChange={e => change("template",e.target.value)}><option value="">All templates</option><option value="none">No checklist / photos only</option>{templates.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="cl-label">Inspection date from<input className="cl-input mt-1" type="date" value={filters.from} max={filters.to || undefined} onChange={e => change("from",e.target.value)} /></label>
      <label className="cl-label">Through<input className="cl-input mt-1" type="date" value={filters.to} min={filters.from || undefined} onChange={e => change("to",e.target.value)} /></label>
    </div><p className="mt-3 text-xs text-[var(--fg-muted)]">Uses inspection date, or creation date when no inspection date is recorded. Unlinked campus names remain separate from saved facilities.</p>
    <button className="mt-2 text-sm underline" onClick={() => {setFilters({campus:"",template:"",from:"",to:""});setGroup("");}}>Reset filters</button></Card>
    {filters.from && filters.to && filters.from > filters.to ? <p role="alert">Choose an end date on or after the start date.</p> : null}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[["Inspections",result.inspections.length],["Finding records",result.findings.length],["Confirmed No answers",result.confirmedNo],["AI answers to review",result.pending],["Actions not closed",result.active],["Overdue actions",result.overdue]].map(([name,value]) => <Card key={name}><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs text-[var(--fg-muted)]">{name}</p></Card>)}</div>
    <p className="text-xs text-[var(--fg-muted)]">Finding records include AI drafts and disputed findings. Confirmed No answers count checklist responses, not unique defects. Done actions remain open until verified; “won’t fix” is closed separately.</p>
    <div className="flex flex-wrap gap-2" aria-label="Dashboard view">{[["groups","Checklist groups"],["trends","Trends"],["actions","Action status"]].map(([id,label]) => <button key={id} className={view === id ? "cl-btn-accent" : "cl-btn-outline"} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
    {view === "groups" ? <Card><h2 className="text-lg font-semibold">Deficiencies by checklist group</h2><p className="mb-3 text-xs text-[var(--fg-muted)]">Select a group to see its linked findings. One finding can support several questions; group counts are not additive.</p>
      {result.groups.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Group","Confirmed No","AI pending","Unanswered","Findings"].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{result.groups.map(g => <tr key={g.key} className="border-t border-[var(--border)]"><td className="p-2"><button className="text-left underline" onClick={() => setGroup(g.key)}>{g.name}</button><div className="text-xs text-[var(--fg-muted)]">{g.template}</div><div className="mt-1 h-1 bg-[var(--border)]"><div className="h-1 bg-[var(--accent)]" style={{width:`${g.total ? (g.confirmedNo/g.total)*100 : 0}%`}} /></div></td><td className="p-2">{g.confirmedNo}</td><td className="p-2">{g.pending}</td><td className="p-2">{g.unanswered}</td><td className="p-2">{g.findingIds.size}</td></tr>)}</tbody></table></div> : <p className="py-4 text-sm">No checklist groups match these filters. Choose a template when starting an inspection to collect group results.</p>}
      <button className="mt-3 text-sm underline" onClick={() => setGroup("unassigned")}>Findings without a checklist-group link: {result.unassigned.length}</button>
    </Card> : null}
    {view === "trends" ? <Card><h2 className="text-lg font-semibold">Monthly inspection cohorts</h2><p className="text-xs text-[var(--fg-muted)]">Current findings grouped by their inspection’s month; not a historical snapshot of closure status.</p><table className="mt-3 w-full text-left text-sm"><thead><tr><th>Month</th><th>Inspections</th><th>Findings</th></tr></thead><tbody>{result.months.map(([month,counts]) => <tr key={month}><td className="py-2">{month}</td><td>{counts.inspections}</td><td>{counts.findings}</td></tr>)}</tbody></table>{!result.months.length ? <p>No inspections match these filters.</p> : null}</Card> : null}
    {view === "actions" ? <Card><h2 className="text-lg font-semibold">Action status</h2>{[["open","Open"],["in_progress","In progress"],["done","Done — awaiting verification"],["verified","Verified"],["wont_fix","Won’t fix"]].map(([status,label]) => <div key={status} className="flex justify-between border-b border-[var(--border)] py-2 text-sm"><span>{label}</span><strong>{result.findings.filter(f => (f.cap_status || "open") === status).length}</strong></div>)}</Card> : null}
    <Card><div className="flex justify-between gap-2"><h2 className="text-lg font-semibold">{selectedGroup?.name || (group === "unassigned" ? "Findings without group" : "Matching findings")}</h2>{group ? <button className="text-sm underline" onClick={() => setGroup("")}>Show all</button> : null}</div>
      <p className="text-xs text-[var(--fg-muted)]">{visibleFindings.length} records · {visibleFindings.filter(f => f.user_rating === -1).length} marked inaccurate</p>
      <div className="max-h-[32rem] overflow-y-auto">{visibleFindings.map(f => <Link key={f.id} href={f.photo_id ? `/inspections/${f.inspection_id}/photos/${f.photo_id}#finding-${f.id}` : `/inspections/${f.inspection_id}`} className="block border-b border-[var(--border)] py-3 text-sm"><span className="font-medium">{f.title}</span><span className="mt-1 block text-xs text-[var(--fg-muted)]">{f.severity} · {f.category} · {f.cap_status || "open"}{f.user_rating === -1 ? " · Marked inaccurate" : ""}</span></Link>)}</div>
      {!visibleFindings.length ? <p className="py-4 text-sm">No linked finding records. A checklist No answer can exist without a separate finding.</p> : null}
    </Card>
  </div>;
}
