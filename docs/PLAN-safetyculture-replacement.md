# Compliance Lens v2 — SafetyCulture Replacement Plan

Written 2026-07-19. Goal: make Compliance Lens v2 a full replacement for
SafetyCulture (iAuditor) at work — same operational backbone, plus the AI
compliance intelligence SafetyCulture doesn't have.

**READ THIS DOC FIRST when resuming.** It supersedes the improvement lists in
`HANDOFF-2026-05-17.md` (that doc's streaming/two-stage items are folded in
below as Phase 1 quick wins).

---

## §0 Status

> **2026-08-31:** still true — zero commits since this doc was written;
> Phase 1 never started (verified: migrations end at 0018, `cap_status`
> unwired in UI). Tomorrow's execution plan, including the E2E test gate
> and the V2 promo video, is **`PLAN-2026-09-01-v2-finish-and-video.md`**
> — start there. Also confirmed: V1 is what's live on both app stores
> (iOS title has a literal typo, "Smektra"); V2 is published nowhere.

| Phase | Status | Contents |
|---|---|---|
| Phase 1 — Replacement blockers | NOT STARTED | Actions workflow, checklist engine w/ AI pre-fill, signatures, notifications |
| Phase 2 — Field & cadence | NOT STARTED | Offline PWA, scheduling/recurrence, report branding + share links |
| Phase 3 — Parity features | NOT STARTED | Asset registry + QR, issues/QR reporting, compliance analytics |
| Phase 4 — Enterprise & honesty | NOT STARTED | Billing, SSO, API/webhooks, audit log, landing-claims reconciliation |

Migration numbering: next free is **0019**. Reserve: 0019 actions, 0020
checklists, 0021 schedules, 0022 report shares + org branding, 0023 assets,
0024 issues, 0025 audit log.

---

## §1 Why we win (don't break these while building)

CL v2's moats — none exist in SafetyCulture:

1. **AI photo → cited findings** (severity, category, NFPA/IBC/IFC/NEC/CMS/TJC/GA
   Title 25 citation, remediation, bbox). SC's AI only does template generation
   and report summaries.
2. **Coach the AI** + **learned org rules** ("Teach Chip this" → permanent
   house rules applied to every future analysis).
3. **Re-photograph punch list** (`not_visible` Open/Resolved/Skipped lifecycle
   with auto-resolve on re-analysis).
4. **Healthcare-grade deliverables**: CAP / LSRA (ASHE matrix) / ILSM xlsx +
   EOC/LS-structured PDF.
5. **Pricing angle**: SC's #1 review complaint is $24/seat/mo for occasional
   users. Our per-facility framing attacks that directly.

SC's weaknesses to exploit (from July 2026 review sweep): weak offline in
practice, data lock-in / export friction, report-layout rigidity, confusing
permission model, QR issue reporters get no status feedback, and zero
domain/code intelligence.

---

## §2 Gap matrix (what blocks daily work use today)

| Capability | SafetyCulture | CL v2 today | Verdict |
|---|---|---|---|
| Corrective actions (assign/due/status/notify) | Full | Findings have no assignee/due/status; CAP is an Excel hand-off. Columns `cap_status`, `cap_target_date`, `manager_corrective_action`, `manager_followup_comments` exist in `findings` since 0001 but are UNWIRED | **P0** |
| Checklists + scoring | Core product (templates, logic, scores) | None — PDF score is literally `photos × 5` proxy | **P0** |
| Offline | Yes (weak in practice) | None — no SW, no manifest, no queue | **P0** (Phase 2 build, but must exist before full switch) |
| Scheduling/recurrence + missed tracking | Full | None (only a Supabase keepalive cron) | **P1** |
| Notifications | Push + email | Only team-invite emails (Resend wired in `lib/email/send-invite.ts`) | **P1** |
| Signatures | Per-question + sign-off | Schema columns exist (`inspections.inspector_signature_url` etc.), no capture UI | **P1** |
| Report branding / share links | Logos, layouts, revocable web links, Word | Fixed PDF layout, no logo, no share links | **P1** |
| Asset registry + QR + per-asset history | Full (Premium) | `facility_id` reserved, `drawings` table unused, no assets | **P2** |
| Issues / QR hazard reporting | Full | None | **P2** |
| Compliance analytics | Dashboards, trends, completion rates | AI-cost ops dashboard + findings time-series only | **P2** |
| SSO/SCIM, billing, API, audit log | Yes (Premium+) | None (SSO is *advertised but nonexistent*) | **P3/P4** |

---

## §3 Phase 1 — Replacement blockers (build first)

### 3.1 Actions workflow (the single highest-leverage build)

Use the reserved `findings` columns + one migration.

**Migration `0019_finding_actions.sql`:**
- On `findings`: add `assigned_to uuid references profiles`, `assigned_email
  text` (for non-member assignees), `priority text check (low|medium|high)`,
  `action_closed_at timestamptz`, `closure_photo_id uuid references photos`,
  `closure_note text`. Activate the existing `cap_status` as the lifecycle:
  `open → in_progress → done → verified` (+ `wont_fix` with required note).
- New table `finding_comments` (finding_id, author, body, created_at) — the
  per-action chat thread SC has.
- RLS mirrors findings (org-member read, writer update; use the existing
  `can_access_inspection`/`can_write_inspection` security-definer helpers from
  0014/0016).

**UI:**
- New page `app/actions/page.tsx` — cross-inspection Actions board: filter
  pills (status / priority / assignee / overdue), sorted by due date, each row
  deep-links to the finding's photo page. Reuse the filter-chip pattern from
  `app/findings/page.tsx`.
- `components/finding-card.tsx` gains an "Action" strip: assignee dropdown
  (org members via existing team queries), due-date picker, priority, status
  buttons, close-out flow requiring a photo or an explicit "no photo" note.
- Inspection detail page: "N open actions" pill next to the punch-list pill.

**Notifications (same migration window):**
- `lib/email/send-action-notification.ts` — clone the Resend pattern from
  `send-invite.ts`. Fire on: assignment, status → done (notify inspector),
  and via a daily cron route `app/api/cron/overdue/route.ts` (add to
  `vercel.json`) for due-tomorrow + overdue digests.

**Exports:** CAP xlsx export (`app/api/inspections/[id]/export/cap/route.ts`)
now populates corrective-action/status/target-date columns from the DB instead
of leaving them blank for manual entry.

### 3.2 Checklist engine with AI pre-fill ("same and better")

Don't clone SC's whole builder. Ship authored question sets that the AI
answers from photos; inspector confirms.

**Migration `0020_checklists.sql`:**
- `checklist_templates` (org-scoped nullable → global seed templates when
  null; name, description, occupancy tag).
- `checklist_items` (template_id, sort, question, response_type
  `pass_fail_na` | `text` | `number`, weight int default 1, category enum
  reuse, code_ref text).
- `inspection_checklists` (inspection_id, template_id, snapshot of items at
  attach time — so template edits don't rewrite history).
- `inspection_checklist_answers` (item ref, answer, note, photo_id, answered_by,
  `answered_by_ai bool`, confirmed bool).

**Seed templates (5 to start, from the compliance prompt's domain knowledge):**
monthly extinguisher walk (NFPA 10 §7.2), EOC round (healthcare), fire door
annual (NFPA 80), exit/egress walk (NFPA 101 §7.x), generator weekly/monthly
(NFPA 110). Seeds live in a `templates/checklists/*.json` + a seed script, not
hardcoded UI.

**AI pre-fill:** after photo analysis, map findings → open checklist items:
v1 = deterministic keyword/category match (same spirit as
`lib/exports/audit-sections.ts`); a finding of matching category marks the item
`fail` with `answered_by_ai=true` + links the photo. Inspector confirms or
flips. v2 (later) = ask the model directly for item IDs.

**Real score:** overall = weighted pass/(pass+fail), N/A excluded. Replace the
`photos × 5` proxy in the PDF export (the code comment there already admits
this is temporary) and show the score on inspection detail + history rows.

### 3.3 Signature capture

Canvas signature pad component (pointer events, works on touch), saves PNG to
the existing `signatures` bucket, writes the existing
`inspector_signature_url` / `manager_signature_url` + `signed_at` columns.
Wire into the finalize flow; PDF export already has signature lines — render
the images above them.

### 3.4 Phase 1 quick wins (carry-overs + cheap trust builders)

- **Enable `AI_TWO_STAGE=1`** in Vercel and verify the speed delta on
  `/admin/stats` (has been dark since May).
- **Streaming findings (SSE/NDJSON)** on upload + coach — the top pending UX
  item from HANDOFF-2026-05-17. Findings appear as generated.
- **Geotag + integrity hash on upload** (`app/api/photos/upload/route.ts`):
  extract EXIF GPS/timestamp before the 1024px resize discards it (read EXIF
  client-side in `lib/resize-image.ts` and pass along), store SHA-256 of the
  original bytes on `photos`. Makes the "chain-of-custody" claim TRUE cheaply.
- **Viewer role UI pass** — hide write buttons for viewers (0016 note says RLS
  blocks but buttons still render).
- Delete the dead `{false ? ...}` toolbar block (~160 lines) in
  `components/photo-editor.tsx`.

**Definition of done for Phase 1:** an inspector can run a scored checklist
inspection, AI pre-fills from photos, findings become assigned actions with
due dates, the assignee gets an email, close-out requires evidence, both
parties sign, and the PDF/CAP show real scores + real action status.

---

## §4 Phase 2 — Field & cadence

### 4.1 Offline PWA

- `manifest.json` + service worker (installable; next-pwa or hand-rolled
  Workbox).
- Offline queue: photos + notes + checklist answers persisted to IndexedDB
  when offline; visible "N queued" badge; background sync on reconnect
  uploads and runs AI analysis then. AI analysis is server-side and
  inherently online — the QUEUE is what must be offline, not the analysis.
- Draft persistence: in-progress inspection state survives tab kill.
- This is where SC is weakest in reviews — reliability of the queue is the
  selling point, so build it boring: explicit queue UI, per-item retry,
  never silently drop.

### 4.2 Scheduling & recurrence

**Migration `0021_schedules.sql`:** `inspection_schedules` (org, facility
name/address, template_id nullable, frequency enum weekly | monthly |
quarterly | semiannual | annual | custom-days, assigned_to, next_due date,
last_completed_inspection_id, active).

- Daily cron (`app/api/cron/schedules/route.ts`): when `next_due` within
  window → create a draft inspection, notify assignee; when past due →
  overdue notice; roll `next_due` on completion.
- Overdue/missed view on the team dashboard (SC's "Missed Inspections" parity).
- **Code-aware frequencies:** the LifeSafetyWiki repo's
  `lib/itmScheduleBuilder.js` (Central Station) already encodes NFPA ITM
  cadences per system. Port the frequency table (not the whole module) so
  picking "Fire extinguishers" pre-fills monthly + annual schedules with the
  right citation. Generic scheduler first; code-aware defaults second.

### 4.3 Report branding + share links

- **Migration `0022_report_shares_branding.sql`:** `organizations.logo_path` +
  `report_shares` (inspection_id, token, created_by, revoked_at, expires_at).
- Org logo upload on team settings; PDF export renders it on the cover.
- Public read-only web report at `app/r/[token]/page.tsx` (no auth, token
  gated, revocable from the inspection page). This beats SC's paywalled
  no-watermark exports.

---

## §5 Phase 3 — Parity features

### 5.1 Asset registry + QR (`0023_assets.sql`)

`assets` (org, name, type enum — extinguisher, fire door, damper, generator,
ATS, riser, hydrant, panel…, location text, facility, custom fields jsonb,
qr_token unique). Findings + photos get nullable `asset_id`. Per-asset page:
inspection/finding history, open actions, next-due (joins schedules).
Printable QR labels (sheet of Avery-size codes). Scanning a QR on mobile →
asset page → "start inspection here." This is device-level ITM history —
exactly what surveyors ask for and what SC paywalls.

### 5.2 Issues / QR hazard reporting (`0024_issues.sql`)

Public (no-account) report page behind a per-org QR: category, description,
photos, location. Creates an `issues` row; org admins triage → convert to
finding/action. **Beat SC's known gap:** give the reporter an optional email
field + status-update notifications on triage/close.

### 5.3 Compliance analytics

Customer-facing dashboard (separate from `/admin/stats` AI-ops): score trend
per facility, flagged-rate by category, action closure rate + median
time-to-close, schedule compliance %, inspector activity. Reuse the 12-week
stacked series pattern from `app/findings/page.tsx`. CSV export per chart
(SC can't export whole dashboards — we can).

---

## §6 Phase 4 — Enterprise & honesty

- **Stripe billing** (tiers already sketched on landing; wire real trial).
- **SSO** (Supabase supports SAML on Pro; SCIM later).
- **Public API + webhooks** (inspection.completed, action.assigned…) — SC's
  API is Premium-gated; ours being included is a selling point.
- **Audit log** table + `/team/activity` (carry-over from HANDOFF-2026-05-15).
- **Landing-claims reconciliation — do the copy pass EARLY (can be done any
  time, 30 min):** today the landing claims offline, iOS field app, SSO/SCIM,
  geotag/chain-of-custody hashing, signature capture, 14-day trial, and
  "13,800+ rules" — none implemented. Either ship the feature (per phases
  above) or soften the claim. A procurement reviewer at work WILL check.

---

## §7 Known cleanups / debt (do opportunistically)

- Storage bucket policies are owner-uid-path scoped, not org-scoped; shared
  inspections rely wholly on server-side signed URLs. Tighten to org-aware
  policies when touching storage.
- Coach `summarizeOlderTurns()` placeholder (10-turn ceiling).
- Section bulk-move / drag-reorder ("Phase 2" note in migration 0011).
- Code-split PhotoEditor / CoachTheAI / DeepReanalyzeFlow (lazy-load).
- Cmd+K palette, loading skeletons, Sentry — from the old improvements menu.

---

## §8 Tomorrow's session punch list (2026-07-20)

Work top-down; each item is commit-sized:

1. **Migration 0019 + Actions data layer** — columns, `finding_comments`,
   RLS. (~45 min)
2. **Actions strip on `finding-card.tsx`** — assign / due / priority / status
   / close-out with evidence. (~90 min)
3. **`/actions` board page** — cross-inspection list + filters + overdue
   highlighting. (~60 min)
4. **Action emails** — `send-action-notification.ts` + assignment trigger +
   `vercel.json` overdue cron. (~45 min)
5. **CAP export reads real action data** (stop leaving manager columns
   blank). (~30 min)
6. **Signature pad** component + finalize wiring + PDF render. (~60 min)
7. If time: **geotag + SHA-256 on upload**, then the **landing honesty copy
   pass**.

Stretch (next session after): checklist engine (§3.2) — it's the biggest
single build and deserves a fresh session.

**User-side (Stanley), independent of code:**
- Set `AI_TWO_STAGE=1` in Vercel (Production), redeploy, compare
  `/admin/stats` timings.
- Confirm `RESEND_API_KEY` is set in this project's Vercel env (invite email
  path no-ops without it; action emails will need it).
- Decide: keep the $89/inspector + $1,250/facility indicative pricing, or
  reprice against SC's $24/seat before showing anyone at work.

---

## §9 Validation

- Every migration idempotent + applied in Supabase before its UI ships.
- `pnpm vitest` (config exists at `vitest.config.ts`) — add unit tests for
  score math and the findings→checklist matcher.
- Manual E2E per phase: run a real inspection on a phone through the new flow
  before calling the phase done.
