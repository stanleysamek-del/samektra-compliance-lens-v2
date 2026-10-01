import { describe, it, expect } from "vitest";
import { summarizeDashboard, type DashboardData, type DashboardItem } from "@/lib/dashboard";
const filters = { campus: "", template: "", from: "", to: "" };
const item = (id: string, patch: Partial<DashboardItem> = {}): DashboardItem => ({ id, inspection_id: "i1", template_ref: "t1", template_name: "EOC", section_code: "A", section_title: "Fire", answer: "no", answered_by_ai: false, ai_confirmed: false, finding_id: "f1", ...patch });
const data: DashboardData = {
  inspections: [{ id: "i1",facility_id:"campus1",facility_name:"Gwinnett",date_of_inspection:"2026-09-01",created_at:"2026-08-01",status:"in_progress" },{ id: "i2",facility_id:"campus2",facility_name:"Duluth",date_of_inspection:null,created_at:"2026-08-31",status:"completed" }],
  findings: [{id:"f1",inspection_id:"i1",photo_id:null,title:"Test",category:"Fire",severity:"High",cap_status:"done",cap_target_date:"2026-09-02",user_rating:null},{id:"f2",inspection_id:"i2",photo_id:null,title:"Other",category:"Fire",severity:"Low",cap_status:"verified",cap_target_date:"2026-01-01",user_rating:null}],
  items: [item("q1"),item("q2",{answered_by_ai:true}),item("q3",{answer:null,finding_id:null})],
};
describe("campus dashboard counting",() => {
  it("separates confirmed answers, AI suggestions, and unanswered questions; deduplicates evidence",() => {
    const r=summarizeDashboard(data,filters,"2026-09-11");
    expect(r.confirmedNo).toBe(1); expect(r.pending).toBe(1); expect(r.groups[0].unanswered).toBe(1);
    expect(r.groups[0].findingIds.size).toBe(1); expect(r.unassigned.map(f=>f.id)).toEqual(["f2"]);
    expect(r.overdue).toBe(1); expect(r.active).toBe(1);
  });
  it("filters campus and inclusive inspection dates before counts",() => {
    const r=summarizeDashboard(data,{...filters,campus:"facility:campus1",from:"2026-09-01",to:"2026-09-01"},"2026-09-11");
    expect(r.inspections.length).toBe(1); expect(r.findings.map(f=>f.id)).toEqual(["f1"]);
    expect(r.months).toEqual([["2026-09",{inspections:1,findings:1}]]);
  });
  it("supports no-checklist inspections and creation-date fallback",() => {
    const r=summarizeDashboard(data,{...filters,template:"none",to:"2026-08-31"},"2026-09-11");
    expect(r.inspections.map(i=>i.id)).toEqual(["i2"]); expect(r.unassigned.length).toBe(1);
  });
  it("does not merge same section codes across templates or link cross-inspection evidence",() => {
    const r=summarizeDashboard({...data,items:[item("q1"),item("q4",{template_ref:"t2",finding_id:"f2"})]},filters,"2026-09-11");
    expect(r.groups.length).toBe(2); expect(r.groups[1].findingIds.size).toBe(0);
  });
  it("keeps legacy same-name campuses distinct from saved facilities",() => {
    const r=summarizeDashboard({...data,inspections:[...data.inspections,{...data.inspections[0],id:"i3",facility_id:null}]},{...filters,campus:"legacy:Gwinnett"},"2026-09-11");
    expect(r.inspections.map(i=>i.id)).toEqual(["i3"]);
  });
});
