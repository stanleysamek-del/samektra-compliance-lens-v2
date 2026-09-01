# Session plan 2026-09-01 — finish V2, test it, then shoot the video

Written 2026-08-31 evening. Stanley's directive, verbatim: "improve, test,
and make sure we got all we want for it to work" — then the video.

> **STATUS — Part A COMPLETE, built and pushed 2026-08-31 evening
> (commits `8425a9f…4431d5c`).** All 8 items below shipped: migration
> 0019 (actions + comments + org_member_directory RPC), ActionStrip on
> finding cards, /actions board + nav, Resend action emails + daily
> overdue cron, CAP export reading live workflow data, SignaturePad +
> PDF sign-off page, geotag + SHA-256 photo integrity (migration 0020),
> dead-code deletion, and the landing honesty pass with the APPROVED
> pricing (Field free / Pro $19 / Facility $149 / Healthcare $399 +
> six-guarantee strip). Pre-migration fallbacks are in place, so the
> deploy is safe before the migrations run — but **Stanley must apply
> `0019_finding_actions.sql` and `0020_photo_integrity.sql` in the
> Supabase SQL editor** before Part B's E2E means anything.
> **Next: Part B — the phone E2E test gate.**

**Repo state verified tonight (not assumed):** last commit is still
`f3c34cc` (2026-07-19, the plan doc itself). Working tree clean. Migrations
end at `0018` → **0019 is the next free number**. `cap_status` appears in
zero UI files → the reserved findings columns are still unwired. The dead
`{false ? ...}` block in `photo-editor.tsx` is still there. Everything
`PLAN-safetyculture-replacement.md` §8 says is still true — that punch
list IS tomorrow's morning, refreshed below with what changed since July.

**What "the video" means:** the /services hero video on LifeSafetyWiki is
DONE and live (shipped 2026-08-31 — check lifesafetywiki.com/services).
Tomorrow's video is the **Compliance Lens V2 promo** — and it is
deliberately LAST in the day's order, because the house rule from every
promo so far is that product frames are real screen-capture of the real
product working. A V2 that hasn't passed its own E2E test has nothing
honest to film.

---

## Part A — Build (morning): the §8 punch list, executed in order

Each item is commit-sized. Original estimates from the July plan.

1. **Migration `0019_finding_actions.sql` + data layer** (~45 min)
   - On `findings`: `assigned_to`, `assigned_email`, `priority`,
     `action_closed_at`, `closure_photo_id`, `closure_note`; activate
     `cap_status` as `open → in_progress → done → verified` (+ `wont_fix`
     with required note).
   - New `finding_comments` table. RLS via the existing
     `can_access_inspection` / `can_write_inspection` helpers (0014/0016).
   - Apply in Supabase before any UI ships (plan §9 rule).
2. **Actions strip on `finding-card.tsx`** (~90 min) — assignee dropdown,
   due date, priority, status buttons, close-out requiring a photo or an
   explicit no-photo note.
3. **`/actions` board page** (~60 min) — cross-inspection list, filter
   pills (status/priority/assignee/overdue), rows deep-link to the
   finding. Reuse the filter-chip pattern from `app/findings/page.tsx`.
4. **Action emails** (~45 min) — `send-action-notification.ts` cloned from
   `send-invite.ts`; fire on assignment + status→done; daily overdue cron
   route + `vercel.json` entry.
5. **CAP export reads real action data** (~30 min) — stop leaving the
   manager columns blank.
6. **Signature pad** (~60 min) — canvas component, saves to the existing
   `signatures` bucket + `inspector_signature_url` / `manager_signature_url`
   columns; PDF renders the images over its existing signature lines.
7. **Quick wins**, in the cracks:
   - Delete the dead `{false ? ...}` toolbar block in `photo-editor.tsx`.
   - Viewer-role UI pass (hide write buttons RLS already blocks).
   - Geotag + SHA-256 on upload (EXIF read client-side BEFORE the 1024px
     resize discards it) — makes the chain-of-custody claim true cheaply.
8. **Landing honesty copy pass** (30 min, non-negotiable before anyone
   sees it) — landing currently claims offline, iOS field app, SSO/SCIM,
   geotag/hashing, signatures, 14-day trial, "13,800+ rules". After item 6
   + the geotag win, signatures and hashing become TRUE; soften or remove
   the rest until their phases ship.

**Explicitly NOT tomorrow:** the checklist engine (§3.2) — the July plan
already called it "the biggest single build, deserves a fresh session."
Offline PWA, scheduling, assets, billing: later phases, unchanged.

## Part B — Test gate (afternoon): "make sure we got all we want"

The plan's own definition of done, run for real, on a phone, against the
deployed preview — not localhost, not dev tools mobile emulation:

1. Walk a real space (office, garage, anywhere) and photograph 5+ real
   conditions. AI findings appear with citations + bboxes.
2. Assign 3 findings as actions with due dates + priorities → the
   assignee email actually arrives (needs `RESEND_API_KEY` set — see
   Part D).
3. Close one action WITH a re-photo, one with a no-photo note, mark one
   `wont_fix` with its required note.
4. Sign as inspector + manager on the finalize flow.
5. Export PDF + CAP → confirm real scores/statuses/signatures appear,
   nothing blank that the DB knows.
6. File every bug found as a fix-forward list; fix P0s same day.

Exit criteria for the day: the loop in 1–5 completes without a workaround.
That is also the **publish gate** — V2 goes nowhere near App Store
Connect / Play Console until this passes on a phone.

## Part C — The Compliance Lens video (only after Part B passes)

Reuse the proven pipeline (services hero + Live Quiz promo): deterministic
Playwright capture, real UI only, ffmpeg assembly. Source lives next to
the others in `D:\LifeSafetyWiki\Marketing\`.

Three deliverables, in priority order — ship #1 tomorrow, derive the rest:

1. **V2 landing hero loop** (~25s, muted, self-hosted) — the story writes
   itself from the E2E test: photo taken → findings appear WITH code
   citations (the moat SafetyCulture doesn't have) → finding becomes an
   assigned action → CAP/LSRA export lands. Real screen-capture of the
   just-tested flow.
2. **App-store preview cut** (9:16 portrait re-layout, not a crop — the
   Live Quiz promo lesson) — parked until V2 actually ships to stores,
   but the capture page should be built with both aspects in mind.
3. **Narrated 16:9 LinkedIn cut** — ElevenLabs VO + music bed, same
   assembly as the Live Quiz promo.

MiniMax H3 ULTRA workflow is available for atmosphere b-roll only (walk-in
shots, hands-on-phone mood) — it has NOT been test-run yet; if it fights
back, ship #1 with zero b-roll rather than burn the afternoon (the
services hero proved pure-UI works fine).

## Part D — Stanley-side (can be done any time, unblocks the day)

- [ ] `AI_TWO_STAGE=1` in the CL v2 Vercel project (Production) +
      redeploy — dark since May; compare `/admin/stats` timings.
- [ ] Confirm `RESEND_API_KEY` is set in the CL v2 Vercel env — action
      emails (Part A item 4, Part B item 2) silently no-op without it.
- [x] **Pricing decision — RESOLVED, Stanley approved 2026-08-31
      evening.** The pricing IS `STRATEGY-competitive-pricing.md` §6.5:
      Free / Pro $19 / Facility $149 flat unlimited-members / Healthcare
      $399 / Portfolio custom, plus the six pricing-page guarantees. The
      honesty copy pass (Part A item 8) now includes rebuilding
      `components/landing/landing-pricing.tsx` with these tiers,
      replacing the $89/$1,250 indicative ones. Landing comparison copy
      says "SafetyCulture (now Mitti)".
- [ ] **V1 store-listing fixes** — independent of ALL of the above, pure
      metadata, no binary: fix the iOS title typo ("Smektra" → "Samektra")
      in App Store Connect; rewrite the Play description to actually
      mention the AI photo→cited-findings capability; verify the "No data
      collected" privacy label is accurate given photos upload for
      analysis (a wrong label is a store-policy risk).

## Order of the day

Build (A) → apply migration + deploy preview → phone E2E (B) → fix P0s →
honesty copy pass → video #1 (C) → wire into V2 landing → commit/push
throughout. If Part A runs long, the video moves to the next session
before anything else does — an untested product doesn't get a promo.
