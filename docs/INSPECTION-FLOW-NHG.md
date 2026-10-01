# Inspection flow and NHG plan integration

Reviewed September 11, 2026. This is an implementation design, not a claim that the changes are deployed.

## Observed workflow

Read the signed-in SafetyCulture home and an existing Northside Duluth Hospital fifth-floor SC 1 LS/EOC inspection. No answers, notes, signatures, or completion status were changed. The inspection has an Information page followed by an Audit page. Each question has Yes/No/N/A, note, media, and action controls; section scores and overall score remain visible. Home offers bookmarked templates and inspections to resume.

Compliance Lens already has checklist answers, notes, AI confirmation, photos, plan pins, findings, and actions. However, its inspection page leads with photo upload, initially collapses unanswered checklist sections, and presents separate plan, section, photo, and summary panels. The next task is often unclear. Reuse these existing capabilities in a guided workspace rather than making another parallel inspection system.

## Proposed user journey

1. **Choose inspection type.** Favorite/recent templates and Resume inspection on Home. Keep a general photo walk available.
2. **Choose coverage.** Facility, building/tower, level, and smoke compartment for an EOC walk. Allow entire facility, selected areas, or a single compartment for other inspection types. Defaults are suggestions, not restrictions.
3. **Conduct inspection.** Keep the selected area in the header. Show the checklist immediately, with section navigation and a next-unanswered control. Place notes, evidence, findings/actions beside the relevant question. Plan is accessible without losing question position. Save with visible pending/saved/error feedback.
4. **Review.** Separate unanswered questions, unconfirmed AI suggestions, findings, and action assignments. An unanswered item is not a pass. Preserve existing server completion checks.
5. **Finish/report.** Include the coverage, exact SC identifier, plan revision, inspector, dates, and evidence associations. Preserve historical inspection scope when plans change.

Example: EOC → Northside Hospital Gwinnett → Main Hospital → Level 05 → SC05-C02 → Begin walk. A fire-door inspection can cover the entire facility while each asset retains its own tower, level, SC, and plan position. A door on a compartment boundary may relate to two compartments; do not require a false single-area assignment.

## Source plan structure

Source: `C:/Users/stani/Downloads/NHG LSP_2026-09-10.pdf`, twelve sheets. Text was extracted from all pages; sheets 1, 11, and 12 were also visually reviewed. This is a preliminary inventory, not verified compartment geometry or a compliance assessment.

| PDF page | Sheet | Contents | Extracted SC labels |
| --- | --- | --- | --- |
| 1 | LS-000 | Main Hospital level 00 | 14 |
| 2 | LS-001 | Main Hospital level 01 | 20 |
| 3 | LS-002 | Main Hospital level 02, including North tower identifiers | 11 |
| 4 | LS-003 | Main Hospital level 03; South, Central, North towers | 4 |
| 5 | LS-004 | Main Hospital level 04 | 7 |
| 6 | LS-005 | Main Hospital level 05 | 7 |
| 7 | LS-006 | Main Hospital level 06 | 7 |
| 8 | LS-007 | Main Hospital level 07 | 7 |
| 9 | LS-008 | Main Hospital level 08; drawing caption says shell | 7 |
| 10 | LS-009 | Main Hospital level 09 | 3 |
| 11 | LS-010 | North tower levels 10, 11, and roof level 12 on one sheet | 7 |
| 12 | LS-011 | Main Hospital level 0B and Central Energy Plant levels 00 and 01 | See below |

There are 94 distinct SC-prefixed labels extracted from pages 1–11. Page 12 text includes CEP-G-01, CEP-G-02, and CEP-1-01, labeled “COMPARTMENT,” not “SMOKE COMPARTMENT.” Its basement diagram visibly contains a smoke-compartment schedule absent from extracted text. Visually verify that identifier at higher resolution before importing it. Do not describe 94 as a complete campus inventory.

Keep exact identifiers, including tower letters and leading zeros. Do not create missing numbers automatically. Sheet number, PDF page, floor, tower, suite, and smoke compartment are different concepts. A sheet may show multiple floor plans; a suite is not automatically an SC. The filename date is not sufficient proof of each drawing's revision or current field condition.

## Data and implementation approach

- Facility areas: stable IDs with facility, parent building/tower, level, exact code, display name, area kind, active status, and verification status. Uniqueness must include facility/building/level, not only the printed code.
- Plan revisions: preserve original PDF and page number; allow several named views/crops per sheet. Relate areas to plan views. Keep optional normalized boundary geometry separate from extracted text labels and mark boundaries unverified until reviewed.
- Inspection coverage: explicit mode (`compartment`, `selected_areas`, `whole_facility`, or legacy `unspecified`) plus selected area IDs and a historical scope snapshot. Do not overwrite or reinterpret existing free-text Location.
- Evidence and assets: question association and optional area assignment; inherit a single-compartment inspection's area when appropriate. Whole-facility scope must not discard individual door or finding locations. Support boundary associations.
- Authorization: enforce matching facility/organization and existing edit/completion permissions on the server and in database policies. A submitted area ID must not let users link another organization's area.
- Migration: keep existing inspections usable as unspecified; expose a way to assign scope explicitly. Changes to an area or plan cannot silently rewrite an old report.

## Import and testing work

The existing plan uploader caps PDF import at six pages and rasterizes each large sheet to a 2,000-pixel long edge. This packet is twelve pages and its first sheet is 48 × 36 inches. Remove silent partial imports: import all supported pages or require explicit selection, show the full page count, and preserve legibility through source-PDF viewing or appropriately bounded zoom rendering. Recover failed uploads without duplicating already-saved sheets.

Acceptance scenarios:

1. Import all twelve pages and retain source page references; correctly represent three floor views on page 11 and three views on page 12.
2. Review extracted labels and flag the text-missing basement schedule rather than declaring import complete automatically.
3. Create an EOC walk for SC05-C02, resume it, attach question evidence, and confirm area and plan reference persist in the report.
4. Create a whole-facility fire-door inspection; record doors on different floors and a boundary door without changing inspection coverage.
5. Change facility or floor during setup; reject stale or cross-facility compartment selections.
6. Verify existing inspections, organization isolation, viewer restrictions, and completed-inspection locks.
7. Confirm failed saves preserve answers, retries do not duplicate evidence, and AI suggestions never silently become inspector-confirmed answers.
8. Test a phone-sized walk with section navigation, camera/evidence access, return from plan view, and review of unanswered questions.

No live imports, product edits, or paid AI requests were performed during this workflow review.
