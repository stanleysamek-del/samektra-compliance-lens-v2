# Compliance Lens — competitive strategy & pricing vs SafetyCulture

Drafted 2026-08-31 (evening before the V2 finish-and-test session).
Stanley's directive: "we need to be competitive to SafetyCulture and
better, we need better strategy and pricing."

Status: **APPROVED — Stanley blessed the §6.5 pricing and the overall
approach 2026-08-31 evening ("I love that, yes thats the right approach").**
The tiers below are no longer a recommendation; they are the pricing.
Tomorrow's honesty copy pass installs them on the landing. Positioning +
competitive intel verified via three research passes (2026-08-31, sources
cited inline). Headline market fact: SafetyCulture rebranded to **Mitti**
on Aug 11, 2026.

---

## §1 The one-sentence position

**SafetyCulture documents what your people already know. Compliance Lens
knows the code.**

SC is a forms engine: someone must author the checklist, know the
standard, and interpret the finding. CL's moat is that the intelligence is
IN the product — photo in, cited finding out (NFPA/IBC/IFC/NEC/CMS/TJC/GA
Title 25), severity, remediation, and the healthcare-grade deliverables
(CAP / LSRA / ILSM / EOC-structured PDF) that a surveyor actually asks
for. Nobody buys a form builder because they love forms; they buy it to
pass inspections. We sell the outcome, not the stationery.

## §2 Where SC is structurally weak — VERIFIED 2026-08-31 research sweep

Context that matters: SC rebranded the product to **"Mitti"** (2026) and
had CEO turbulence in early 2025 (new CEO out in ~3 months, founder
returned) — a brand-confusion window for a challenger. Their renewals run
**$24/user/mo billed annually** (Premium quoted $24–29; "Lite" limited
seats $5/user/mo).

Ranked by how often real customers complain (Capterra, G2, Trustpilot,
App Store reviews, 2025–2026 sources on file):

1. **Per-seat pricing punishes occasional users — #1 complaint,
   confirmed.** Occasional inspectors pay full seat price; **all users
   must be on the same plan tier** (one power user forces everyone up);
   costs "get steep fast." A Feb-2026 Trustpilot reviewer was refused
   monthly billing on added seats — full upfront annual or nothing.
   Auto-renew needs 30-day WRITTEN notice, no refunds; a Jul-2026
   reviewer got "the runaround" trying to close an account. This is the
   wedge for our packaging (§4).
2. **Offline/sync unreliability — dominant in app-store reviews.**
   Crashes mid-inspection, photo uploads failing "even with great WiFi,"
   sync failures losing work → manual re-entry; support blames the
   connection. Bonus wound: a **3-mobile-device cap** forces constant
   logout/login on shared tablets. (We still don't attack offline until
   our Phase 2 queue ships and is boring — but "fails loudly, never
   silently" is a design requirement now, and the device cap is safe to
   counter-position immediately: no device limits.)
3. **Report/template rigidity.** "Reports always look like a
   SafetyCulture report"; no custom report builder; serious analytics
   means bolting on Power BI. Our CAP/LSRA/ILSM/EOC deliverables are the
   counter — surveyor-shaped, not form-shaped.
4. **Export friction / watermark lock-in.** Free-tier and guest-seat PDF
   exports carry a "Powered by SafetyCulture" watermark; the bulk
   Exporter is Premium/Enterprise-only, so lower tiers can't mass-export
   their own history. Counter-position hard: **full export, no
   watermark, every tier, forever** — say it on the pricing page.
5. **Permission-model confusion** — even their own docs admit the
   default admin role can't see all org content.
6. **AI shallowness.** Their 2025 AI is prompt→checklist generation,
   "a little generic," zero domain intelligence, zero citations. Least
   complained about only because expectations are low — which means the
   photo→cited-finding demo lands as a category difference, not a
   feature comparison. "Coach the AI" + learned org rules compound
   switching costs in OUR favor.
7. **Where churners actually go:** GoAudits (offline + white-label
   reports), Lumiform, Fluix, flowdit, Xenia, SiteDocs. Stated reasons:
   seat cost, clunkiness, report customization, offline trust. Nobody in
   that list has code intelligence either — churners are settling for
   cheaper forms, not better answers.

## §3 What we must NOT do

- **Do not out-feature SC on breadth.** They have a decade of sensors,
  lone worker, training, marketplace. Racing that catalog loses. We win
  on depth in compliance intelligence + deliverables.
- **Do not price like enterprise software while shipping a v2.** The
  current landing ($89/inspector/mo, $1,250/facility/mo) reads 3.7× SC's
  seat price with a fraction of the surface area. Indicative or not,
  anyone comparison-shopping bounces. Pricing must make trying us feel
  obviously safe.
- **Do not advertise features that don't exist** (SSO, offline, iOS
  app until real). A procurement reviewer at Stanley's own workplace
  WILL check. The honesty copy pass in tomorrow's plan is part of the
  competitive strategy, not housekeeping.

## §4 Packaging principles (numbers in §6.5)

1. **Anchor on the building, not the seat.** Facilities budget per
   building (inspections, service contracts, insurance are all priced
   that way — so is Central Station). Per-facility flat with UNLIMITED
   members inside the facility turns SC's top complaint into our
   headline: "Stop counting seats."
2. **Unlimited viewers/occasional users everywhere, always.** The person
   who closes one corrective action a month must never cost money —
   assignees, managers signing off, viewers: free. Only the facility (or
   the solo pro) pays.
3. **A real free tier, not a trial.** Solo inspector, 1 facility, capped
   AI analyses/month — enough to feel the photo→cited-finding magic on a
   real walk. The magic IS the demo; gating it kills the funnel. AI cost
   per analysis is cents (two-stage Groq/Haiku) — the margin math
   supports a generous cap.
4. **A solo-professional tier under SC's per-seat price.** Independent
   inspectors and consultants are the LifeSafetyWiki audience — meet
   them at or below the $24/seat anchor so switching is a no-brainer,
   and let them carry CL into every client building they walk.
5. **Everything included that SC paywalls.** API, exports, report
   branding, analytics — included. Each "included" line on the pricing
   page is a direct shot at an SC upsell.
6. **Healthcare is the premium tier, not an add-on maze.** CAP/LSRA/ILSM,
   EOC rounding, K-tag awareness — the hospital tier prices against the
   cost of one bad survey day, not against SC.
7. **Bundle path with Samektra services.** CL software + Central Station
   management + Samektra consultations is a ladder no software-only
   competitor can copy. The /services page is already the menu.

## §5 Go-to-market assets SC cannot copy

- **LifeSafetyWiki**: 163-article encyclopedia, tools, Clara, study
  tracks — organic traffic of exactly the buyers (inspectors, facility
  managers, healthcare safety officers). Every article already carries a
  Samektra services CTA; CL joins that funnel free.
- **Stanley's own workplace** as design partner + first case study:
  replace SC at work, then publish the story ("why our hospital EOC team
  left SafetyCulture") — the single most credible marketing asset
  possible in this niche.
- **Central Station + vendor network**: findings can become quotes and
  managed follow-ups. SC ends at the report; we end at the fixed
  deficiency.
- **Field Call / Failure Library content engine**: thousands of real
  finding photos and a community trained to spot violations — content
  marketing and eventually training data flywheel.

## §6 The market map (verified 2026-08-31)

**SafetyCulture → "Mitti" (rebranded Aug 11, 2026;** safetyculture.com/pricing
301s to mitti.com/pricing — verified by direct fetch). Their packaging:
- Premium **$24/seat/mo annual, $29 monthly** (the 2024 increase from $19
  is still the resented number). Free: 10 seats, 5 templates, 3-yr
  history cap, 300 AI credits/seat. "Lite" seats $5 but capped at 12
  inspections/YEAR. Annual is upfront, seats never flex down, all seats
  must share one tier, 30-day written notice to cancel.
- **AI is now credit-metered** (300/500/800 credits per seat by tier,
  overage billed) — they made their AI a utility bill.
- **Enterprise quietly offers site-based pricing** — they KNOW per-seat
  is their wound; they just reserve the cure for custom quotes.
- Training is a separate license; Lone Worker (SHEQSY) is +$10/user/mo.

**The rest of the market:**
- Horizontal per-seat cluster: $10–45/user/mo (GoAudits $10, MaintainX
  $20–65, Forms On Fire $20–28, Fulcrum $43+ with 5-seat minimum).
- Fire-vertical ops suites: **$75–180/user/mo** (ServiceTrade ~$75,
  Inspect Point ~$129 annual-only + implementation fee, Uptick ~$180) —
  priced against technician revenue, all scheduling/dispatch/billing
  suites, none with code intelligence.
- **Per-location flat pricing has real precedent:** Jolt ~$90–150/
  location/mo (restaurant ops), Xenia per-site "from $99/mo", and small
  fire challengers explicitly weaponizing it — FireInspect: "$79/mo flat,
  no per-user tax."
- Healthcare EOC tooling (TheWorxHub, Soleran) is uniformly quote-only
  enterprise — no published numbers, high-four/five-figure annual
  contracts by reputation. A published price is itself differentiation.

## §6.5 Recommended pricing (for Stanley to bless / adjust)

Two buyers, two anchors — so two paid shapes, per-inspector AND
per-facility, never per-seat-for-everyone:

| Tier | Price | Who | What |
|---|---|---|---|
| **Field** (free) | $0 | anyone | 1 user · 1 facility · ~100 AI photo analyses/mo · ALL exports, **no watermark ever** |
| **Pro** | **$19/mo** annual ($24 monthly) | solo inspectors & consultants | unlimited facilities · high AI cap (~1,000 photos/mo fair-use) · CAP/LSRA/ILSM · report branding · API included |
| **Facility** | **$149/facility/mo** annual ($179 monthly) | one building, whole team | **unlimited members** · everything in Pro · team actions board · org learned rules |
| **Healthcare Facility** | **$399/facility/mo** annual | hospitals, ASCs, LTC | Facility + EOC rounding structure, K-tag awareness, survey-prep deliverables, priority support |
| **Portfolio** | custom | multi-building owners, PM groups, health systems | volume per-facility rates · SSO when Phase 4 ships · **Central Station managed-service bundle** |

Why these exact numbers:
- **$19 Pro is a story, not just a price** — it's the number Mitti raised
  away from in 2024. "The price they left behind, with intelligence they
  never had." At/below their $24 anchor, and 4–9× under the fire-vertical
  seats (Inspect Point $129, Uptick $180) for the audience LSW already
  reaches.
- **$149 Facility sits inside the proven Jolt band** ($90–150/location)
  and makes the headline math work: a 10-person EOC/maintenance team on
  Mitti = **$240/mo** (annual, upfront, same-tier-forced). CL = **$149
  flat, unlimited people**. At 25 people: $600 vs $149. The bigger the
  team, the harder the wedge hits — and the occasional user (the #1
  Mitti complaint) costs literally zero.
- **$399 Healthcare prices against survey risk, not against Mitti.**
  $4,788/yr against quote-only competitors and against the cost of one
  bad survey day; the deliverables (CAP/LSRA/ILSM shaped for surveyors)
  are the justification. Published pricing alone beats the
  TheWorxHub/Soleran quote-wall on trust.
- **AI: generous caps, no credit math.** Mitti just taught its users to
  ration AI credits. Our two-stage Groq/Haiku pipeline costs cents per
  photo — caps exist as fair-use backstops, not meters. "No AI credits.
  Just take the photo" goes on the pricing page.

Guarantees on the pricing page (each one targets a verified complaint):
1. **No watermarks, any tier** (their free/guest exports are stamped).
2. **Full export, free, forever** (their bulk Exporter is Premium-up).
3. **No device limits** (their 3-mobile-device cap on shared tablets).
4. **Unlimited viewers & assignees** (their Lite seat is $5 and capped
   at 12 inspections/yr).
5. **Price locked — 12 months written notice before any increase**
   (their $19→$24 renewal-surprise resentment).
6. Cancel monthly plans anytime, no written-notice ritual.

Launch mechanics:
- **Founding Facility offer**: first N buildings lock launch pricing for
  life + a named case-study slot. Urgency without discounting.
- **Switching offer**: "Leaving Mitti? We'll import your history free" —
  their export friction becomes our onboarding feature. (Their bulk
  Exporter being Premium-only means the switcher can pull data while
  still subscribed — document that path in a migration guide.)
- Stanley's workplace = design partner + the first public case study
  ("why our hospital EOC team replaced SafetyCulture").

Risks, stated honestly:
- Mitti can extend site-based pricing down-market — price alone is not
  the moat; the code intelligence + deliverables + Samektra services
  ladder are. Price is the door, not the house.
- The rebrand window (SafetyCulture→Mitti confusion) favors challengers
  RIGHT NOW; SEO for "SafetyCulture alternative" is a timely LSW article.
- These prices assume Phase 1 ships and the E2E gate passes; nothing
  goes on the public landing before the honesty copy pass.

## §7 How this feeds tomorrow (2026-09-01)

- The honesty copy pass (plan Part A item 8) now includes replacing the
  $89/$1,250 indicative tiers with the §6 pricing.
- The E2E test gate is unchanged — pricing means nothing if the loop
  doesn't close on a phone.
- The promo video's closing card should carry the new pricing hook
  ("Stop counting seats") once §6 is blessed by Stanley.
