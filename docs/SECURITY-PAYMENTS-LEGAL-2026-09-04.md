# Security, payments, and legal posture — Compliance Lens v2

Prepared 2026-09-04 from four research passes (provider security, payments,
legal, and a code audit of this repo at `b83749b`). Every factual claim about
a provider carries the URL and check date in the source reports below; prices
are USD, ex-tax, as published on that date. Where something could not be
confirmed it says **unverified**.

Stanley's framing, verbatim: "it all depends on services we connect to …
accepting payment … we need deep research … we cannot grant or be
responsible for any data breach or loss, think about how to word it well and
still be legally protected."

---

## 0. The short version

1. **Our security is mostly our providers' security plus our configuration.**
   Supabase (Pro), Vercel (Pro), Anthropic, and Resend are all SOC 2 Type II
   attested with AES-256 at rest and TLS in transit. What is NOT covered by
   default: Supabase daily backups **do not include Storage objects** (the
   photos), there is **no uptime SLA** on either Pro plan, and several
   dashboard toggles are off until we flip them (§1.3).
2. **We are not HIPAA-ready and should say so.** Resend cannot sign a BAA at
   all; Supabase needs the Team plan (+$599/mo) plus a HIPAA add-on (~$350);
   Vercel's BAA is $350/mo. Floor ≈ $1,400/mo before usage. The honest posture
   for now: **not for PHI, no BAA** — photograph the corridor, not the
   patient — stated in the Terms and enforced in the product (§1.5).
3. **Payments: Stripe direct, hosted Checkout, ACH for the big tiers.**
   Georgia does not tax SaaS and we are years from any other state's
   threshold, so paying a merchant-of-record 5–6% for tax handling we don't
   need is wasteful; healthcare buyers want invoices, PO numbers, net-30 and
   a W-9 from Samektra, which MoRs can't give. Hosted Checkout keeps us in
   PCI SAQ A — card numbers never touch our servers (§2).
4. **"Not responsible for any breach" is not enforceable as written**, and a
   blanket version can void the whole clause. What holds up in Georgia B2B:
   a commitment to *commercially reasonable safeguards*, a *prompt notice*
   promise, an honest "no system is perfectly secure," the customer's own
   export duty, and a **liability cap (12 months' fees) with carve-outs for
   gross negligence and willful misconduct**. Drafts in §3 — for attorney
   review, not to publish as-is.
5. **The code audit found the app is in good shape** (RLS on all 24 tables,
   no `using (true)`, private buckets, no signed URLs in emails/PDFs, no
   secrets in git) plus a short list of real fixes, most applied the same
   night (§4).

---

## 1. Provider security — what we get, what we must do

### 1.1 Per-provider table (checked 2026-09-04)

| | Supabase (Pro, us-east-1) | Vercel (Pro) | Anthropic API | Resend | Google OAuth |
|---|---|---|---|---|---|
| Certifications | SOC 2 Type 2, ISO 27001, HIPAA-ready, GDPR. **SOC 2 report download only on Team/Enterprise.** | SOC 2 Type 2, ISO 27001:2022, PCI SAQ-D/A, EU-US DPF; report downloadable on Pro since 2026-08-19 | SOC 2 Type I & II, ISO 27001:2022, ISO/IEC 42001:2023, HIPAA-ready | SOC 2 Type II, GDPR DPA | identity provider only |
| Encryption | AES-256 at rest (incl. Storage), TLS in transit; **SSL enforcement on Postgres is off until enabled** | AES-256 at rest, TLS 1.3; "sensitive" env vars write-only | HIPAA mode adds encryption/audit; algorithm not published (**unverified**) | AES-256 at rest, TLS 1.3+ | OAuth/OIDC over TLS |
| Backups / DR | Pro: daily, **7-day** retention; **Storage objects NOT included**. PITR add-on: RPO ~2 min, $100/mo per 7 days | platform backups not available to customers; code is in GitHub, data in Supabase | stateless | point-in-time backups 7 days | n/a |
| Data retention | logs 7 d (Pro); auth audit logs 7 d; platform audit logs Team+ | runtime logs **1 day** on Pro (30 d with Observability Plus); audit logs Enterprise only | inputs/outputs deleted within **30 days** (trust-and-safety flagged content up to 2 years); **no training on API data** (Commercial Terms); ZDR sales-gated and unavailable for Covered Models | email content + logs **30 days**, stored in the US | Google receives name/email/picture; does not use it for ads |
| BAA | **Team ($599/mo) or Enterprise + HIPAA add-on (~$350/mo, staff-quoted, unverified on pricing page)** | **$350/mo self-serve on Pro** | self-serve in Console (Messages API incl. inline images is eligible; Batch/Files APIs are not); permanent once enabled | **"cannot sign a BAA"** | n/a |
| Uptime SLA | **none on Pro/Team** (99.9% Enterprise) | **none on Pro** (99.99% Enterprise) | none published (**unverified**) | none found (**unverified**) | n/a |
| Residency | project region = Postgres + Auth + Storage → us-east-1 | functions default US; may transfer to processors' regions | default `inference_geo: "global"`; `"us"` pins to US at **1.1×** token price | United States | n/a |

Other verified facts worth keeping: Supabase dashboard MFA is TOTP-only with
org-wide enforcement on Pro+; end-user TOTP MFA is included; leaked-password
protection is Pro+; **network restrictions cover only direct Postgres
connections, not the REST/Auth/Storage APIs**; signed URLs grant access to
anyone holding the link until expiry and are not invalidated by auth-key
rotation. Vercel Firewall: DDoS mitigation and custom rules are free on all
plans; rate-limiting rules are usage-priced on Pro; OWASP CRS available on Pro.

### 1.2 What we can honestly claim (once §1.3 is done) — and must not

**Can claim:** encrypted at rest (AES-256) and in transit (TLS) at every
provider · hosted on SOC 2 Type II / ISO 27001-attested infrastructure ·
database and files in AWS us-east-1 · photos analyzed by Anthropic under
commercial terms — **not used for model training**, deleted within 30 days
(flagged content excepted) · private storage, row-level security on every
table and bucket, time-limited links · daily database backups (+ PITR to ~2
minutes only if bought) · independent immutable off-site copy (only once
§1.4 is live) · mandatory MFA for staff on all admin consoles.

**Must NOT claim:** "HIPAA compliant" / "BAA available" · "SOC 2 certified"
about *ourselves* (say "hosted on SOC 2-attested infrastructure") · any
uptime percentage · "zero data retention" for AI · "data never leaves the
US" unless `inference_geo: "us"` is enforced · that we can hand over
Supabase's SOC 2 report (Team+ only; Vercel's yes).

### 1.3 DO THIS — Stanley's dashboard checklist (free, in priority order)

- [ ] **Supabase org:** enforce org-wide MFA; add a second org owner (recovery); rotate the service-role key and confirm it exists **only** as a Vercel *sensitive* env var.
- [ ] **Supabase project (compliance-lens):** Settings → Database → **enforce SSL**; **network restrictions** on (allow only what needs direct Postgres — Vercel uses supabase-js, unaffected); Auth → **leaked-password protection** on; email confirmations on; OTP expiry ≤ 1 h; **custom SMTP** for auth mail (Resend domain).
- [ ] **Vercel team:** enable **"Enforce Sensitive Environment Variables"**; MFA on every Vercel login; add Firewall rate-limit rules on `/api/photos/*`, `/api/jobs/*`, `/forgot-password`, `/signup` (e.g. 60 req/min/IP); turn on the OWASP CRS in **Log** mode first.
- [ ] **Anthropic console:** decide on `inference_geo: "us"` (1.1× cost) if "processed in the US" goes into the statement; keep using the Messages API with inline images (never Files/Batch for photos).
- [ ] **Resend:** TOTP MFA on every member; policy: emails carry links, never findings or photos.
- [ ] **Signed URLs:** reduce TTL from 60 min toward the minimum the UI needs (code task, §4).

### 1.4 Buy (value per dollar)

1. **Off-provider mirror — ~$5–10/mo.** Nightly `pg_dump` + Storage sync to Cloudflare R2 with a **Bucket Lock** (object lock = mistake/ransomware insurance), plus a quarterly restore drill. This is the only thing that backs up the photos at all. Doubles as the LifeSafetyWiki mirror.
2. **Supabase PITR 7-day — $100/mo.** RPO 24 h → 2 min.
3. Vercel log drain (~$0.50/GB) or Observability Plus only if incident forensics needs >1 day of logs.
4. **Do not** buy Supabase Team/HIPAA or the Vercel BAA until a customer contractually requires PHI handling and funds it.

### 1.5 HIPAA reality

A photo is PHI when it identifies a person in connection with their care —
a face, a wristband, a name on a whiteboard or chart in frame (45 CFR
164.514(b)). The moment a hospital uploads that, we are a Business Associate
and every provider that touches it needs its own BAA — and Resend cannot
give one. So: **the product is not offered for PHI.** In-product: a capture
banner ("frame the condition, not the patient — no faces, wristbands, charts,
screens"), an onboarding acknowledgment, and a one-tap delete for "contains a
person." In the Terms: customer warrants no PHI; no BAA is provided (§3(g)).
Revisit only when a customer funds the ~$1,400/mo chain.

---

## 2. Payments — Stripe direct, hosted Checkout

### 2.1 Why not a merchant of record

| | Stripe (Checkout + Billing + Tax) | Stripe Managed Payments (MoR) | Paddle | Lemon Squeezy |
|---|---|---|---|---|
| Merchant of record | **Samektra** | Stripe | Paddle | LS (Stripe-owned; product in maintenance mode) |
| Fees (US card) | 2.9% + 30¢ + 0.7% Billing | 6.4% + 30¢ + Billing | 5% + 50¢ | 5.5% + 50¢ on subs |
| ACH | 0.8%, $5 cap | unverified | unverified | no |
| Invoices / net-30 / PO | yes (Invoicing 0.4%, $2 cap; `send_invoice`, `days_until_due: 30`, custom PO field) | **no** one-off invoices | custom pricing only | weak |
| Payouts | T+2 business days | same | monthly | twice monthly |

Georgia does **not** tax SaaS; every other state's economic-nexus threshold
is ~$100k/state — years away at $19–$399/mo. Stripe Tax ($0.5%/txn only
where registered) monitors thresholds and warns before they bite. Healthcare
and Portfolio buyers want Samektra's name on the invoice, a PO number, net-30
and ACH — MoRs are the seller, not us. A $399 ACH charge costs $3.19 vs
$11.87 on card.

**App stores:** a PWA on our domain is outside store rules. If we ever wrap
it for the stores: keep purchases on the web and make the store app
login-only ("consumption-only" is explicitly allowed on Play; Apple's
3.1.3(c) enterprise exemption covers org sales; the US external-link rule is
still being litigated — treat as unverified).

### 2.2 Security / PCI

Hosted Checkout + Customer Portal + hosted invoice page = **PCI SAQ A**
(full-redirect; do NOT use embedded Elements — that adds script-security
obligations under DSS 4.0.1). Never accept, log or proxy a card number; store
only Stripe IDs (`cus_`, `sub_`, `si_`), brand + last4. Webhooks: raw body,
`stripe.webhooks.constructEvent`, dedupe by `event.id` (Stripe re-delivers
for 3 days, no ordering guarantee), rotate `whsec_`. `Idempotency-Key` on
every create call. Secrets only in server env (restricted key scoped to
Checkout/Billing/Customer). Radar Lite is free. Pin API version
`2026-06-24.dahlia`+; since `basil`, `current_period_end` lives on
`subscription.items.data[].current_period_end`.

### 2.3 Implementation (what we build — ~1 day)

Tables (service-role write only; members SELECT their org's row):

```
billing_customers (org_id pk → organizations, stripe_customer_id unique, email, created_at)
subscriptions     (id text pk = sub_…, org_id, status, tier pro|facility|healthcare|portfolio,
                   price_id, quantity, current_period_end, cancel_at_period_end, trial_end,
                   collection_method, grace_until, updated_at)
stripe_events     (id text pk = evt_…, type, received_at, processed_at)   -- idempotent log
```

Routes/actions: `POST /api/stripe/webhook` (raw body, signature, insert
`stripe_events` on conflict do nothing → 200; handle
`checkout.session.completed`, `customer.subscription.*`, `invoice.paid`,
`invoice.payment_failed`); server actions `createCheckoutSession({orgId,
tier, seats})` (mode subscription, `org_id` in **subscription metadata**,
14-day trial with `missing_payment_method: 'pause'`, `automatic_tax`,
`tax_id_collection`, PO custom field, ToS consent) and `createPortalSession`;
`lib/entitlements.ts getEntitlements(orgId)` from the local row (active if
`trialing|active`, or `past_due` inside a 14-day `grace_until`); canceled /
unpaid → **read-only**, never delete data. Pro = per-seat `quantity`;
Facility/Healthcare = flat; solo users get an auto-created personal org so
billing always hangs off an org. Net-30 accounts created from the Dashboard
with `collection_method: 'send_invoice'`.

### 2.4 Stanley's Stripe to-do

Activate the account (EIN, bank, T+2 payouts) · brand + ToS/privacy URLs ·
products/prices `pro_monthly` (per-seat $19), `facility_monthly` $149,
`healthcare_monthly` $399, tax code `txcd_10103001` · Stripe Tax on with GA
head office · Customer Portal on (cancel at period end, update payment, plan
switch, seat quantity for Pro) · Smart Retries 2 weeks then `unpaid` ·
trial-ending emails on · ACH Direct Debit + Link enabled · webhook endpoint +
`whsec_` · restricted secret key · complete the SAQ A in Settings →
Compliance (annual).

### 2.5 Honest customer-facing payment language

> Payments are processed by Stripe, a PCI DSS Level 1 certified provider.
> Card and bank details are entered on Stripe-hosted pages and never touch
> Compliance Lens servers; we store only a Stripe customer reference and your
> subscription status. Update your payment method, download invoices, or
> cancel any time from the billing portal. Cancelling stops future charges at
> the end of the current period; your data stays readable on the free tier.

Don't claim "PCI compliant" as a product feature or "we never see any payment
data" (we see last4/brand and invoices).

---

## 3. Legal — what holds up, and draft language

**Draft for review by a licensed Georgia attorney. Not legal advice. Do not
publish as customer-facing terms until counsel has reviewed it, confirmed the
entity name and current statutory text, and resolved every [BRACKET].**

### 3.1 What a Georgia B2B SaaS can and cannot disclaim

- Enforceable norm: cap at **fees paid in the prior 12 months**, exclusion of
  consequential/indirect damages, AS-IS warranty disclaimer — when
  **"explicit, prominent, clear and unambiguous"** (Georgia treats remedy
  limits as exculpatory: bold/caps + standalone heading).
- Courts will not enforce a waiver of **gross negligence, willful
  misconduct, or fraud** — draft the carve-out yourself.
- **O.C.G.A. § 13-8-2(b) / *Lanier at McEver* (Ga. 2008):** in
  construction/design contracts a fee-cap that shifts third-party
  bodily-injury/property-damage liability is void. A software subscription
  isn't such a contract, but (a) never draft the cap to cover third-party
  injury/property damage, and (b) any separate Samektra on-site
  inspection/consulting agreement needs its own clause reviewed.
- Venue: Georgia enforces forum-selection clauses; Gwinnett County courts +
  N.D. Ga. Atlanta Division are defensible.

### 3.2 Breach: what cannot be disclaimed

- **O.C.G.A. § 10-1-912(b):** a business that "maintains computerized data
  on behalf of" an information broker or a government data collector must
  notify that customer **within 24 hours** of discovering a breach — so if a
  hospital authority, county, or school system is ever a customer, that
  clock is ours. "Personal information" = name + SSN / license / financial
  account / password; photos, plans and findings generally are not, but
  credentials and any IDs on uploaded documents are.
- Every US state has a breach law keyed to the **affected individual's
  residence**; ~20 states impose fixed deadlines (30 days in CA, CO, FL, ME,
  RI, WA). The FTC treats unreasonable security as an unfair practice
  regardless.
- Enforceable posture instead of "not responsible": commercially reasonable
  safeguards + prompt notice + "no system is perfectly secure" + customer
  export duty + cap with gross-negligence carve-out.

### 3.3 AI, professional-judgment, and e-signature precedents

Anthropic's own terms: outputs "may be false, incomplete, misleading" and
must be independently checked. Engineering-calc tools with AI assistants:
"not engineering advice … must be reviewed by a licensed PE … the responsible
engineer holds professional responsibility." NSPE: AI "must not replace
engineering judgement." NFPA AHJ definition to borrow verbatim: "an
organization, office, or individual responsible for enforcing the
requirements of a code or standard." ESIGN § 7001 and Georgia UETA
(O.C.G.A. § 10-12-9) let us claim attribution via a security procedure —
**not** "legally binding," "court-admissible," "forensic," or "chain of
custody."

### 3.4 Privacy scope

CCPA/CPRA does not apply below $26.6M revenue / 100k CA consumers — say so.
Georgia has **no comprehensive privacy law as of 2026** (SB 111 was gutted).
The policy must still cover: categories collected, purposes, no sale/no
ads, **subprocessor list** (Supabase — database/auth/storage; Vercel —
hosting; Anthropic — AI processing; Resend — transactional email; Google —
sign-in only), retention schedule, deletion on request, cookies (session
only), no under-18s, security summary, contact, effective date. Data
ownership: customer owns; we get a limited license "solely to provide,
secure, support, and improve the Service." **Never train models on customer
data** — closes the activity-based CPRA trigger too.

### 3.5 DRAFT TERMS (B2B, Georgia law)

**(a) Service description and AI disclaimer.** Compliance Lens ("Service") is software operated by Samektra, [LLC/entity], a Georgia company ("Samektra," "we"). You upload photographs, floor plans, notes, and inspection findings ("Customer Data"). The Service uses automated tools, including third-party artificial-intelligence models, to draft suggested findings, suggested code references, and report text ("AI Output"). **AI Output is a draft, not a conclusion.** It may be incomplete, out of date, cite the wrong edition or section, or be simply wrong. Every finding, citation, and severity rating must be reviewed and confirmed by a qualified person you designate before it is finalized, signed, or shown to anyone. You are responsible for that review and for everything in a finalized report. We do not train AI models on your Customer Data.

**(b) Not a substitute for professional judgment; not the AHJ.** The Service is a documentation and workflow tool. It does not inspect buildings, does not practice engineering, architecture, or law, and does not provide professional services of any kind. Samektra is not an "authority having jurisdiction" as that term is used in NFPA codes, the International Fire Code, or Georgia law, and nothing produced by the Service is a code determination, approval, variance, or enforcement decision of any fire marshal, building official, accreditation surveyor, or insurer. Only the applicable AHJ decides whether a condition complies. Where a task requires a licensed professional or certified inspector, you must engage one; the Service does not satisfy that requirement.

**(c) Customer Data ownership and license.** As between you and Samektra, you own all Customer Data and all finalized reports generated from it. You grant Samektra a non-exclusive, worldwide, royalty-free license to host, copy, process, transmit, and display Customer Data solely to provide, secure, support, and improve the Service for you, and as required by law. We will not sell Customer Data or use it for advertising. Aggregated, de-identified usage statistics that cannot identify you or any building are not Customer Data. You represent that you have the rights and consents needed to upload Customer Data, including any images of people or premises.

**(d) Security commitments and no guarantee.** We will maintain commercially reasonable administrative, technical, and physical safeguards designed to protect Customer Data against unauthorized access, disclosure, alteration, or loss, appropriate to the nature of the data and the size of our business. As of the Effective Date these include: encryption in transit (TLS) and at rest, role-based access controls, authenticated per-tenant access to stored files, logging, and reliance on infrastructure providers listed in our Subprocessor List that maintain SOC 2 Type II or ISO 27001 attestations. We may update these measures, but not in a way that materially reduces overall protection during your subscription term. **You acknowledge that no method of transmission or storage is completely secure and that we cannot guarantee that unauthorized third parties will never defeat our safeguards.** Our responsibility for a security incident is governed by Sections (e) and (h); we are not responsible for incidents caused by your credentials, your users, your devices, or your networks.

**(e) Security incident notification.** If we confirm a breach of security that results in unauthorized access to or acquisition of unencrypted Customer Data ("Security Incident"), we will notify your designated administrator without undue delay and in any case within [72 hours / 24 hours where you are a government entity or information broker under O.C.G.A. § 10-1-912(b)] after confirmation, describe what we know, and cooperate reasonably with your investigation and with any notices you must give to individuals or regulators. Unless required by law, we will not notify your customers, regulators, or the public on your behalf. Timing may be adjusted only to the extent a law-enforcement agency directs a delay.

**(f) Backups and your export responsibility.** We maintain routine backups of the Service database and stored files for operational recovery [state cadence, e.g. "daily, retained 30 days"]. Backups are not an archival service for you. The Service lets you export reports (PDF, Excel) and your uploaded files at any time, and you are responsible for downloading and retaining copies that you need for regulatory, insurance, accreditation, or records-retention purposes, including any period required by O.C.G.A. Title 25, NFPA 25 Chapter 4, CMS, or The Joint Commission. We are not liable for loss of data you did not export.

**(g) Prohibited uses, including PHI without a BAA.** You will not use the Service to: (1) upload, store, or transmit **Protected Health Information** as defined by HIPAA (45 C.F.R. § 160.103), or any patient names, medical record numbers, diagnoses, or images identifying a patient, unless and until Samektra and you have executed a written Business Associate Agreement and we have confirmed in writing that your account is provisioned for PHI; you represent that Customer Data uploaded to a standard account contains no PHI, and you will crop, blur, or omit patient identifiers from photographs; (2) upload Social Security numbers, driver's license numbers, financial account numbers, or passwords of any individual; (3) submit content you do not have the right to share; (4) use AI Output as a substitute for a required professional inspection, engineering analysis, or legal opinion; (5) represent a Service report as an AHJ approval or certification; (6) reverse-engineer, scrape, or resell the Service; or (7) violate any law. We may suspend accounts used in breach of this Section and may delete PHI we discover on a standard account after notice to you.

**(h) WARRANTY DISCLAIMER; LIMITATION OF LIABILITY.** THE SERVICE AND ALL AI OUTPUT ARE PROVIDED "AS IS" AND "AS AVAILABLE." TO THE FULLEST EXTENT PERMITTED BY LAW, SAMEKTRA DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, AND ANY WARRANTY THAT THE SERVICE WILL IDENTIFY EVERY DEFICIENCY, THAT AI OUTPUT WILL BE CORRECT OR COMPLETE, OR THAT A REPORT WILL BE ACCEPTED BY ANY AHJ, SURVEYOR, OR INSURER. EXCEPT FOR THE EXCLUDED CLAIMS, NEITHER PARTY WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST DATA, FINES, CITATIONS, LOSS OF ACCREDITATION, OR INSURANCE CONSEQUENCES, EVEN IF ADVISED OF THEIR POSSIBILITY. EXCEPT FOR THE EXCLUDED CLAIMS, EACH PARTY'S TOTAL LIABILITY ARISING OUT OF THIS AGREEMENT WILL NOT EXCEED THE FEES YOU PAID TO SAMEKTRA FOR THE SERVICE IN THE **[TWELVE (12)] MONTHS** BEFORE THE EVENT GIVING RISE TO THE CLAIM [or $[X], if greater]. "EXCLUDED CLAIMS" MEANS A PARTY'S GROSS NEGLIGENCE, WILLFUL MISCONDUCT, OR FRAUD; YOUR BREACH OF SECTION (g); AND EITHER PARTY'S INDEMNITY OBLIGATIONS. THESE LIMITS ARE A FUNDAMENTAL BASIS OF THE BARGAIN AND APPLY REGARDLESS OF THE THEORY OF LIABILITY. [Optional: a separate "Data Breach Cap" of [2×] fees for Security Incidents caused by our ordinary negligence — common in current SaaS negotiations and improves enforceability.]

**(i) Mutual, narrow indemnity.** You will defend and indemnify Samektra against third-party claims arising from (1) Customer Data, including any claim that it infringes rights or contains PHI or personal information in breach of Section (g), (2) your use of any report, or (3) your violation of law. Samektra will defend and indemnify you against third-party claims that the Service itself, as provided by us and used as permitted, infringes a United States patent, copyright, or trademark, provided we may modify or replace the Service or terminate and refund prepaid fees. The indemnified party must give prompt notice, tender control of the defense, and cooperate. Indemnity does not cover bodily injury or property damage at any building — those risks stay with the owner, operator, and their contractors.

**(j) Term, termination, data return, and deletion.** Either party may terminate for convenience with [30] days' notice, or immediately for material breach not cured within [15] days. On termination you may export Customer Data for **[30] days**, after which we will delete it from production systems within [30] days and from backups within [90] days, except data we must retain by law or to resolve a dispute. We may retain de-identified usage statistics. On written request during a subscription we will delete specified Customer Data within [30] days.

**(k) Governing law and venue.** This Agreement is governed by the laws of the State of Georgia, without regard to conflict-of-law rules. Each party consents to the exclusive jurisdiction and venue of the state and superior courts of **Gwinnett County, Georgia**, and the United States District Court for the Northern District of Georgia, Atlanta Division, and waives any objection based on inconvenient forum, including under O.C.G.A. § 9-10-31.1. [Decide: courts vs. binding arbitration.] The Service is offered to businesses only; you represent you are entering this Agreement on behalf of a business.

**Integrity feature — approved product copy (not a Terms clause).** "Each photo is hashed with SHA-256 the moment it is uploaded, and the hash is embedded in the report. Anyone holding the original file can recompute the hash and confirm the image has not been altered since it was captured in Compliance Lens. Signatures are captured from authenticated accounts with a timestamp and device record. Compliance Lens does not verify the real-world identity of signers beyond their account login, and a report is not a substitute for your own records-handling procedures." Avoid: "legally binding," "court-admissible," "forensic," "certified," "chain of custody."

---

## 4. Code audit of this repo — findings and status

**Already solid (don't undo):** RLS enabled on all 24 tables with zero
`using (true)` policies; every security-definer function checks the caller;
all three buckets private, no `getPublicUrl` anywhere, signed URLs never in
emails or PDFs; every route/action calls `getUser()` first; no secrets in the
repo or git history; no `dangerouslySetInnerHTML`, email templates
HTML-escape; upload path built server-side from `user.id` (no traversal);
explicit abort timeouts on every AI call; `maxDuration` on every long route;
admin routes `notFound()` for non-admins.

**Fixed 2026-09-04 (commit after this doc):** deleted the unmetered
`/api/analyze` route (P0) · security headers incl. CSP/HSTS/XFO (P0) ·
CRON_SECRET mandatory in production + constant-time compare (P1) · storage
read policies so teammates can view shared photos/signatures (P1 — they
couldn't) · bucket size/MIME limits (P1) · pdf.js loaded without
`new Function` (P1) · Resend fetch timeouts, invite tokens no longer logged
(P1/P2) · daily AI spend cap per user/org (`check_ai_budget`, env
`AI_DAILY_BUDGET_USER_USD` default 10, `AI_DAILY_BUDGET_ORG_USD` default 50)
(P0-3) · invite rate cap · plan path validation · auth `next` sanitized ·
stale `drawings_owner_objects` policy dropped.

**Still open:** vendor `pdfjs-dist` instead of cdnjs (npm install is broken
in this repo — pnpm lockfile; do it in a session with pnpm) · make the
4-table analysis write atomic via an RPC (retry can duplicate findings) ·
Vercel Firewall rules (dashboard) · reduce signed-URL TTL · `email_exists`
RPC is an unauthenticated account-enumeration oracle (documented tradeoff —
add a Firewall rule on `/forgot-password`) · run `pnpm audit --prod` before
each deploy.

---

## 5. Order of work

1. Stanley: §1.3 toggles (30 min) + apply migration 0027.
2. Buy the R2 mirror + PITR (§1.4) when the first paying customer signs.
3. Attorney review of §3.5; then publish Terms, Privacy (with subprocessor
   list), and a Security page using only §1.2's "can claim" list.
4. Stripe (§2.3/2.4) — build when the pricing page goes live.
5. Remaining audit items (§4 "still open").

Source reports (full text with URLs) are in this session's transcript; the
per-provider numbers above are exactly those reports' figures.
