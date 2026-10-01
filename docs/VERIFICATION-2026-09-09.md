# September 9 verification and owner AI allowance

## Yesterday's work

Reviewed commits `6fffe86` and `8129519`, the September 8 release handoff, AI processing/budget code, upload handling, equipment and database tests. Yesterday added equipment scanning/import/placement, checks, schedules, atomic analysis persistence, paid entitlements and usage reservations. The follow-up adjusted the backup worker to a daily Vercel Hobby schedule. Payment checkout, offline workflows and full live acceptance were explicitly unfinished.

## Changes prepared locally today

- Reject missing/malformed AI schemas instead of silently recording no findings. Reject invalid finding severity/category and unusable bounding boxes. Complete, valid no-finding results still work.
- Increase Google's analysis output allowance from 2,048 to 8,192 tokens so the full findings schema has room. Six real provider calls were completed; results are recorded below.
- Retain spending holds when a provider omits required token-usage fields.
- Health checks now use a zero-row anonymous HEAD request against the RLS-protected inspections table. Live diagnosis showed the API root requires service-role access even when the database is healthy; treating its 401 as an outage caused a false warning. Genuine non-success responses from the replacement check still report unavailable.
- Migration `0033_owner_ai_allowance.sql` automatically provisions complimentary Healthcare-tier AI only for the confirmed `stanley.samek@proton.me` account with database-protected `profiles.is_admin=true`. Standard and advanced access share a cumulative $10 allowance; it does not reset monthly. An existing personal entitlement is preserved rather than silently overwritten. Viewer restrictions and the global pause still apply. Removing the owner's admin status revokes this complimentary access.
- Usage page shows server-aggregated charges, unresolved holds, credits, and an 80% warning ($8 for the initial owner allowance). Team totals include all members, without API row-limit truncation.
- Added a photo acceptance runner that uses real app analysis and real database reservations; expected answers/filenames are not sent to the model. Default mode only prepares and verifies images. Paid mode requires credentials, a verified owner account, an active allowance and explicit test/daily caps. Calls are sequential, with a $0.75 hold before each standard attempt. A failed/ambiguous call keeps its hold.
- Added a read-only spending monitor and a Codex task notification every 30 minutes. Notification triggers at $8 and again at the allowance limit; unchanged states remain quiet. The local script still lacks a service-role credential, so the notification can instead use the signed-in Supabase SQL editor with `supabase/checks/owner_ai_spending.sql`, or the signed-in app usage page. It reports lost access rather than treating it as zero spending.

## Verification completed

- 56 unit/database tests passed (37 existing plus 19 new), including real PostgreSQL execution in disposable PGlite, owner eligibility, cumulative spending, $8 warning, $10 denial, migration reapplication, viewer denial, global pause and removal of admin access.
- Production build and TypeScript passed. ESLint and whitespace checks passed.
- Equipment browser harness passed image barcode/QR decoding, denied-camera fallback, CSV/XLSX/PDF imports and plan placement. Database writes in that browser harness are simulated, with database functions tested separately.
- Local production browser smoke passed mobile landing/demo, private-page login redirects, guest rejection on five photo endpoints and CSP checks.
- Read-only live checks: `ai_entitlements`, `ai_usage_reservations`, `inspection_schedules`, `asset_checks`, `assets` and `analysis_jobs` were reachable through PostgREST. The replacement zero-row health probe returned HTTP 200. This does not establish complete live RLS or function correctness.
- Ten files in `D:/LifeSafetyWiki/public/images/games/field-call` were decoded and fingerprinted, including three no-finding controls. A visual review is at `test-results/photo-acceptance/review.html`. These include product/tool photos as controls, so this is a small diagnostic set, not a representative validation of all occupied-building inspections.
- The local runner stopped before any provider call because the local service-role credential is unavailable. Subsequently completed six paid analyses through the signed-in production browser, without copying credentials.

## Live activation and remaining testing

Vercel lists protected production variables but downloaded their values as blank. `.env.audit` is ignored and contains public configuration plus temporary deployment metadata. `.env.local` now contains the public Supabase/site settings and blank protected credentials, with paid AI paused (`AI_GLOBAL_DAILY_BUDGET_USD=0`). Do not commit either file or paste keys into chat.

The user signed into Supabase. Verified project `aktqogyxopkqdoahhaxn` matches the app configuration and the owner's account `7c76f250-fae7-4012-92c2-0606f24d30bf` has a confirmed email and protected administrator status. It had no entitlement. A scheduled backup was shown as 13 hours old; restoration was not tested. This project uses SQL-editor changes and showed no CLI migration history, so no history was repaired or fabricated.

Ran migration 0033 against the live schema inside a transaction, asserted advanced access and denial under the zero global cap, and rolled everything back. That passed. Then applied migration 0033 and verified the saved `healthcare` / `$10` / `operator-owner-complimentary` entitlement. Initial recorded charges and holds are both zero. The allowance starts with this activation; historical provider bills outside its reservation ledger are not included.

Updated production `AI_GLOBAL_DAILY_BUDGET_USD` to 10 as authorized. Deployed the matching app to `https://www.compliancelens.app`; deployment `dpl_6aW3ot8SGZ5iTPA19aWAbcBivkMr` passed production mobile/guest smoke. Follow-up deployment `dpl_2r1GQPA66hSB3ydv3vNP9r2SBM52` corrects the restricted health-check endpoint and is READY. Its live health check returned `ok:true` (1,932 ms, correctly classified as slow), and the browser's false unreachable banner cleared. The global daily cap and owner's cumulative cap are independent; production can pause if other customers consume the shared daily cap. No actual provider request has yet been made for this test.

The user signed into the production app. Six photos were uploaded, stored, queued, analyzed and persisted in diagnostic inspection `246f60ef-8301-46de-8539-3e60d63adda9`. Local provider/service credentials remain unavailable; the browser route avoids copying keys into the workspace. Exports have not yet been exercised on this inspection.

## Real photo and barcode results

Follow-up: the user expected a barcode value on the inspection overview after uploading. Added a compact, explicit barcode-reading control directly to each photo card, using the original-resolution image when available. Build, lint and browser harness passed; deployment `dpl_HgrqsVpsjx8SBqNGkmgU76fmeHbh` is READY. Verified the new card in production on inspection `adb111b2-55fb-4998-9a8e-7d96144ad36a`, photo `280769ad-4591-4eda-b92f-5244a424b5cd`: Code 39 `60022717` displayed inline. Barcode decoding remains an explicit, free action separate from paid safety analysis. No additional paid calls were made for this follow-up.

Final deployed changes: `dpl_FYFRni6YducRHMFZgrfn1ptoddqN`, READY and aliased to www.compliancelens.app. Build, lint and browser harness pass. The latter now covers Code 128, rotated Code 128, multiline QR over 160 characters, Data Matrix, PDF417, saved-photo decoding, denied-camera fallback, and existing import/plan tests.

Barcode scanning previously required a building before decoding, discarded long/control-character payloads and navigated away without showing the result. It now preserves full decoded text, exposes escaped control characters and decoder bytes when available, and separates decoding from equipment lookup. An existing inspection photo can be decoded from its original-resolution image. No AI charge applies. Physical phone-camera decoding remains untested.

Verified the user's actual `Test bar code` photo `09405a0a-9cba-4b4a-b203-e0592cf906a1` in production: **CODE_39, eight characters, `60022717`**. This is decoded content, not independently retrieved equipment specifications. No matching equipment record was looked up because this account has no building configured.

Photo test results (five distinct local images, six calls):

| Image | Result | Review |
| --- | --- | --- |
| taped-door-latch.jpg | Medium, taped latching mechanism, 15.3 s | Visible condition detected; fire-rating confirmation requested rather than assumed. |
| hospital-outlet.png, baseline | Zero findings, four re-photo tasks, 9.1 s | Unnecessary tasks for a standalone product image. |
| hospital-outlet.png, updated guidance | Zero findings, zero re-photo tasks, 6.8 s | Correct control outcome in this run. |
| open-junction-box.jpg | High, open box with exposed conductors, 13.6 s | Main visible condition detected. |
| strobe-blocked-tv.jpg | High, obstruction, but called device a pull station, 12.9 s | Device misidentification; not a fully correct result. Also still requested functional status as a re-photo task. |
| jockey-pump.jpg | Low, corrosion at anchor bolts, 14.7 s | Rust staining is visible, but the training control expects no deficiency. Advisory applicability requires human review; not counted as a clean control pass. |

The prompt now separates hypothetical product installation checks from actual re-photo tasks. The outlet repeat improved; this is not evidence that all functional-check categorization issues are solved. Pending photos now say analysis has not completed, and the inspection summary counts saved images rather than claiming every image was analyzed.

Final live allowance page: **6 credits, $0.06 reported charges, $0.00 unresolved holds**, rounded to cents. Owner complimentary access and the $8 notification threshold are active. These are application-reported costs, not a reconciliation of the provider's billing account.

For local paid photo testing, configure the service-role key and one intended provider key in `.env.local`, then run:

```powershell
npm run test:photos -- --run --env-file .env.local --daily-cap 10 --budget 2 --out test-results/photo-run-01
```

Use a fresh output directory for each run. This changes the daily cap only in the test process; the database's owner allowance still applies and records the test charges. It does not change production settings. This calls the app's analysis client and budget service directly; it does not validate signed-in browser uploads, storage persistence, job processing or exports.

The default `npm run test:photos` makes no paid calls. `node scripts/check-owner-budget.mjs` reads cumulative owner charges and holds, and prints a status without credentials. Its missing-configuration status must never be treated as zero spending.

Human review must check visible detection, false positives/negatives, severity, context and citation applicability. Training-game labels are comparison material, not verified legal authority. The older filename/word-overlap evaluation scripts are exploratory and must not be used as an accuracy percentage. Report exports, physical camera tests, broader accuracy evaluation, full live RLS/cron/email coverage and restore verification remain outstanding; this app is not verified as 100% working.
