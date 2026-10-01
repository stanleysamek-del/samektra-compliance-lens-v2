# Compliance Lens and Mitti: observed comparison

Reviewed the user's signed-in Mitti account: Home, an existing Northside LS/EOC inspection, Analytics dashboard list, Top Down dashboard, its campus selector, assigned schedules, and the Assets list/navigation. No inspection answers, dashboard definitions, or asset records were intentionally changed. This is a focused workflow review, not an exhaustive test of Mitti or a claim of feature parity.

## Implemented in this change

- Dedicated Campus dashboard, accessible from desktop navigation and the Findings page on mobile.
- Current workspace scope enforced on the server, with existing Supabase row permissions. Personal workspace explicitly restricts to the signed-in user's personal inspections.
- Campus/facility, template, and inclusive inspection-date filters. Legacy unlinked facility names remain separate from saved facility IDs.
- Checklist group breakdown: confirmed No responses, unconfirmed AI answers, unanswered questions, and unique linked finding records. Groups retain template identity; duplicate section codes in different templates are not combined.
- Finding drill-down including inaccurate-feedback labels and an explicit unlinked group. No heuristic assignment of findings to groups.
- Monthly inspection-cohort counts, current action status, overdue counts, and group CSV export. Done is not verified; won't-fix is separately closed. Dates use UTC day boundaries for overdue checks.
- Paginated reads replace a 500-record snapshot for this dashboard. Errors or safety capacity limits hide all totals instead of displaying partial data. Capacity is 20,000 rows per paginated query and 40,000 combined finding/checklist rows; larger deployments need database aggregation.
- Inspection checklist now precedes upload, and the next unanswered section opens by default. Navigation says Inspect instead of Upload.

## Strengths and weaknesses

| Area | Mitti observed | Compliance Lens | Assessment |
| --- | --- | --- | --- |
| Starting/resuming | Bookmarked templates and in-progress work on Home | Inspection setup and history | Mitti has a clearer starting point. Favorite templates and stronger resume navigation remain useful gaps. |
| Conducting a walk | Information then Audit, with answer/note/media/action beside each question | Checklist, photo analysis, findings, plans, and actions exist, but are separate | Checklist-first layout improved here. Question-level evidence/action integration still needs implementation. |
| Analytics | Custom dashboards, PDF download, date/granularity, facility/group and card-level filters; action priority/status charts | Campus/template/group dashboard added here | Mitti remains more configurable. Our dashboard is tailored to checklist deficiencies and distinguishes AI review state. |
| Campus hierarchy | Facility filter lists Duluth and Gwinnett | Saved facilities and older free-text names | Saved campus records need reconciliation before reliable building/level/SC rollups. Do not merge by name silently. |
| Life-safety workflow | Existing hospital-specific template visible | Photo-assisted findings, LifeSafetyWiki links, plan pins, equipment/barcode tools | Our specialization is a useful strength, but superior accuracy or broader plan support was not established by this review. |
| AI reliability | AI Assistant exists; accuracy not tested | User demonstrated classification, false-positive, and localization errors; prompt fixes deployed separately | Our largest verified weakness. Static tests do not prove image accuracy; blind image regression tests remain necessary. |
| Scheduling | Assigned-to-me view, next-seven-days empty state; banner advertises bulk editing/completion visibility | Recurring inspection schedules already exist | Do not duplicate scheduling. Bulk management and completion reporting need a focused assessment. |
| Equipment | Assets, Maintenance, Live map, Event history, Archive navigation | Equipment records, checks, import, barcode, and plan placement | Mitti also shows searchable IDs, last inspection dates, and open-action counts. Maintenance capability depth and comparative parity are not verified. |
| Broader platform | Training, contractors, documents, issues, investigations, lone worker, sensors appear in navigation | Hospital life-safety focus | These are separate product areas, not implemented as part of the dashboard. Availability alone does not establish a need to build them. |

## Remaining work in the user's requested inspection experience

1. Structured campus/building/level/SC catalog and whole-facility inspection coverage; preserve plan revisions and historical scope.
2. Complete twelve-page NHG import with multiple floor views per sheet, verification of labels missing from extracted text, and readable plan zoom.
3. Question-level photo annotation with brief description, matching plan marker, and report layout. Existing photo/plan tools need a connected workflow.
4. Inspector correction pipeline and live regression runs for the reported ICRA, strobe, above-ceiling, corrosion, and concealed-cover cases. Existing saved findings are not rewritten by deployment.
5. Saved dashboard presets, shareable filter URLs, scheduled exports, and database-side aggregation for larger campuses.
6. Group assignment controls for findings that have no checklist link. Current dashboard shows them explicitly; it cannot claim complete group categorization.

The dashboard measures current stored records, not a retrospective historical snapshot. A confirmed No answer is not necessarily a distinct defect. A finding may support several groups, so summing group finding counts can double-count. Campus/template filtering uses existing inspection and checklist snapshots; it does not import Mitti records into Compliance Lens.
