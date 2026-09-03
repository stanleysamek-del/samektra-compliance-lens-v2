# Plan — analysis queue (no lost photos under load) + life-safety-plan markup

Written 2026-09-02 late, from Stanley's two asks: "would there be a problem
if multiple people use the app at the same time … can we create a waiting
list so it would not ignore any entries," and "give the customer the option
to upload life safety plans or architectural drawings and mark the spot
where the finding was found — very easy edit."

## 1. Concurrency today — what actually happens

- **One phone** is already safe: `components/photo-uploader.tsx` runs a
  strict sequential queue per device (one photo in flight, per-file status,
  manual Retry, no auto re-POST).
- **Several people at once** is where it breaks. Each upload is its own
  Vercel function and each one calls Anthropic immediately. There is no
  server-side coordination, so N simultaneous inspectors = N parallel vision
  calls against ONE API key. The labeled eval reproduced the failure mode
  with just two parallel calls on this key: latency climbs past the 70s
  per-request budget and requests abort. A 429 (rate limit) is surfaced as
  "all providers failed" — the photo IS saved, but its analysis is lost and
  the inspector has to press Retry per photo.
- Two independent fixes, both worth doing:
  1. **Raise the Anthropic usage tier** (console.anthropic.com → Limits).
     Tiers advance automatically with spend; tier 2+ gives multiples of the
     tokens-per-minute headroom that vision calls need. Zero code.
  2. **A real server-side queue** (§2) so overflow WAITS instead of failing.

Shipped tonight as a stopgap (commit after this doc): 429/529 responses now
honor `retry-after` with a bounded wait inside the request budget, and one
retry happens for malformed replies. That reduces losses; it does not
eliminate them under sustained load — only the queue does.

## 2. Analysis queue — design (≈ half a day)

Goal: a photo is never ignored. It is saved immediately, shows "Queued (N
ahead)", and gets analyzed as soon as capacity allows; if a function dies
mid-analysis the job is picked up again.

**Migration 0024 `analysis_jobs`:** `id, photo_id (unique), inspection_id,
status queued|running|done|failed, attempts int, max_attempts 4, run_after
timestamptz, locked_at, locked_by, last_error, created_at, updated_at`.
Index on (status, run_after). RLS: owner read via can_access_inspection;
writes service-role only.

**Upload route change:** stop calling the AI inline. Store the resized copy
(+ zoom copy), insert the photo row with `analyzed_at = null`, enqueue a
job, and return `{ photoId, queued: true, position }`. Then call the worker
immediately via Next's `after()` (fire-and-forget within the same
invocation) so the common case (no contention) still finishes in one round
trip.

**Worker `POST /api/jobs/run` (service role):**
- `select … from analysis_jobs where status='queued' and run_after<=now()
  order by created_at for update skip locked limit 1` — Postgres does the
  locking, so any number of concurrent workers never double-process.
- Global cap: count `running` jobs (locked in the last 90s); if ≥
  `AI_MAX_CONCURRENCY` (env, default 2) → exit; the sweeper will come back.
- Run the exact analysis path the upload route runs today (analyze +
  findings/what-to-look-for/not-visible inserts + checklist pre-fill + ai_calls).
- On 429/529/timeout: `attempts+1`, `run_after = now + backoff(attempts)`
  (15s, 45s, 2m, 5m), status back to `queued`. After max_attempts → `failed`
  with `last_error` (the UI offers Retry, which re-queues).
- Loop: after finishing one job, pick the next until the function's time
  budget is nearly spent, then exit.

**Sweeper:** `vercel.json` cron `*/1 * * * *` → `/api/jobs/run` (bearer
CRON_SECRET). Guarantees progress even if every `after()` trigger died.
Also re-queues `running` jobs whose `locked_at` is older than 3 minutes
(function killed mid-flight).

**UI:** photo card / queue row states `Queued (3 ahead) → Analyzing →
Done (N findings) / Failed → Retry`. Poll `/api/photos/[id]/status` every
3s while queued/analyzing (or Supabase Realtime later). The inspection
page's stat strip shows "2 photos still analyzing".

**Cost/scale note:** this is what makes the Facility tier ("unlimited
members") safe to sell — ten inspectors on one org no longer race the same
rate limit; they queue.

## 3. Life-safety-plan markup — design (≈ 1 day)

Goal: upload the facility's LSP / floor plan once, then drop a numbered pin
on it for each finding ("this is where it is"), and have that plan page
appear in the PDF. Deliberately NOT a CAD editor — pins + short labels.

**What exists:** migration 0001 created a `drawings` table + a private
`drawings` bucket (owner-scoped, admin-readable since 0021). Nothing in the
UI uses it yet — the `drawings` grep hits are the photo-editor's annotation
"drawings," a different thing. We can build on that table.

**Migration 0025:** extend `drawings` (name, storage_path, page, width,
height, sort) as needed + new `drawing_pins` (`id, drawing_id, inspection_id,
finding_id null, photo_id null, x numeric 0-1, y numeric 0-1, label text,
created_by, created_at`). RLS via can_access/can_write_inspection.

**Upload:** PDF or image. PDFs are rasterized IN THE BROWSER with pdf.js
(same CDN pattern the app already uses for exports) — one PNG per page at
~2000px wide, uploaded to the `drawings` bucket; the original PDF is kept
too. Images upload as-is (resized ≤ 3000px).

**Mark a spot:** on the photo page and on each finding card, a "Place on
plan" button opens the plan viewer (pinch-zoom/pan, `react-zoom-pan-pinch`
or a small hand-rolled transform); tap = pin at normalized (x, y). Pins are
numbered to match finding numbers; tapping a pin shows the finding title +
photo thumbnail; drag to move; long-press to delete. Optional 30-char label
("Rm 217", "Stair B").

**PDF export:** a "Plan markup" page per drawing: the PNG scaled to fit,
numbered circles at each pin, and a legend "1 — <finding title> (Photo 4)".
pdf-lib draws circles/text natively; no new dependency.

**Checklist tie-in (nice, cheap):** a pin can also be attached to a checklist
"No" answer, so an ILSM/CAP entry can say where in the compartment it is.

## 4. Order of work

1. Queue first (§2) — it protects the phone test and the Facility tier.
2. Plan markup (§3) — schema + upload + pins + PDF page, then the
   checklist tie-in.
3. Prompt iteration on the 13 persistent misses from the labeled eval
   (see memory / `scripts/vision-eval-gamebank.ts`) — each run costs ~$1.30
   and takes ~20 min single-file.


## 5. Technician mode — devices with barcodes on the plan (next build)

Stanley's ask (2026-09-02): "for fire extinguishers, emergency lights, exit
signs, fire door inspections — the tech scans a barcode on the device and
it shows the device's location on the LS plan (placed/edited manually the
first time). Maybe tabs for Inspector / Technician."

**Why the plan/pin model above already fits:** a pin is polymorphic
(`kind = 'device'`), the plan belongs to the FACILITY (so it persists across
rounds), and `assets` (migration 0026) carry the barcode + type + one pin.
Nothing has to be re-modeled; the technician module is UI + per-type
checklists on top of tables that exist now.

**Scope boundary (Stanley, 2026-09-02): barcodes are ONLY for device rounds.** An EOC round, a loss-control survey, or any checklist-template walk has no barcode step at all — it stays photo-driven in Inspector mode, and findings are pinned on the plan by hand. Technician mode is a separate, additive workflow for the devices that DO carry labels (extinguishers, emergency lights, exit signs, fire doors…).

**Two modes, one app.** A mode switch (header toggle, remembered per user
in `profiles.default_mode`) changes the home screen and the mobile tab bar:
- *Inspector*: Home · History · Upload · Findings · Actions (today's app).
- *Technician*: Scan · Devices · Rounds · Due · Facilities.
Both modes share facilities, plans, pins, exports, and the Team.

**Scan flow.** `/scan` opens the camera: Android Chrome has the native
`BarcodeDetector` API; iOS Safari doesn't, so fall back to `@zxing/browser`
(CDN, dynamic import, same pattern as pdf.js). Result → look up
`assets.barcode` within the facility (facility chosen once per round, or
inferred from the last scan) → device page. Unknown barcode → "Register
this device": pick type, label, snap a photo, **place it on the plan**
(the same PlanViewer in place mode), save. Manual entry field for damaged
labels.

**Device page.** Type, label, location text, the plan thumbnail with its
pin (tap → full viewer; move/delete as any pin), last result, next due,
history list. Big buttons: *Inspect now*, *Report a problem* (creates a
finding + action against the device, pinned automatically).

**Per-type checklists live in code** like the inspection templates
(`lib/assets/device-checklists.ts`): extinguisher monthly (NFPA 10 §7.2 —
location/access, gauge, pin+seal, tag, condition), emergency light monthly
30-second test + annual 90-minute (NFPA 101 §7.9.3), exit sign monthly/
annual (§7.10.9), fire door annual (NFPA 80 §5.2 — the 13 items), pull
station, eyewash weekly (ANSI Z358.1), AED monthly. Each answer set is
snapshotted into `asset_inspections.checklist` so a device's history is
exact even after the checklist changes.

**Rounds.** "Start a round" = pick facility + device type(s) → the app
lists devices in plan order (nearest-pin walk) with checkmarks as each is
scanned; a round is an inspection row (`inspections.kind = 'round'`, new
column) so it gets the same finalize/sign/export machinery; the PDF adds a
device table (label, location, result, due). Missed devices are the
report's first page — the point of a round is completeness.

**Due dates.** `assets.next_due_at` is computed from the type's cadence
after each inspection; the Technician home shows *Due this week / Overdue*
per facility; the existing daily cron can email a weekly "devices due" list
to the facility contact (reuse the action-notification mailer).

**Barcodes themselves.** Any Code-128/QR label works. For facilities
without labels the app can generate a printable sheet of QR codes
(label + facility id) — cheap win, `qrcode` is already a dependency.

**Build order (≈2 days):** mode switch + Devices list/detail + register-
with-pin (½ day) → scan (BarcodeDetector + ZXing fallback) (½ day) →
per-type checklists + asset_inspections + due dates (½ day) → rounds as
inspections + PDF device table + due digest (½ day).
