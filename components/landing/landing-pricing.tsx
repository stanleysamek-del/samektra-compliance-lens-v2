import Link from "next/link";

/**
 * §07 Pricing — approved 2026-08-31 (docs/STRATEGY-competitive-pricing.md
 * §6.5). The strategic frame: SafetyCulture (now Mitti) charges $24/seat
 * and its #1 review complaint is occasional users paying full seats. We
 * anchor on the BUILDING, not the seat — Facility is flat with unlimited
 * members — and everything they paywall (exports, branding, no
 * watermarks) is included. Every guarantee below targets a verified
 * complaint from their own reviews; don't soften them.
 *
 * Honesty rule: every line here must be TRUE of the shipped product.
 * SSO/SCIM, on-prem, and compliance certifications stay OFF this page
 * until they exist.
 */
const TIERS = [
  {
    name: "Field",
    tagline: "Try the AI on a real walk. Free means free.",
    price: "$0",
    period: "forever",
    featured: false,
    includes: [
      "1 user · 1 facility",
      "100 AI photo analyses / mo",
      "Cited findings — code section included",
      "CAP, LSRA, ILSM + PDF exports",
      "No watermarks, ever",
      "Full data export, free, always",
    ],
    cta: "Start free",
    href: "/signup",
  },
  {
    name: "Pro",
    tagline: "For solo inspectors and consultants — every building you walk.",
    price: "$19",
    period: "/ mo billed annually · $24 monthly",
    featured: false,
    includes: [
      "Everything in Field",
      "Unlimited facilities",
      "1,000 AI photo analyses / mo",
      "Coach the AI + learned rules",
      "Your logo on reports",
      "Priority email support",
    ],
    cta: "Go Pro",
    href: "/signup",
  },
  {
    name: "Facility",
    tagline: "One building, your whole team. Stop counting seats.",
    price: "$149",
    period: "/ facility / mo · $179 monthly",
    featured: true,
    includes: [
      "Unlimited team members",
      "Assignees & viewers always free",
      "Corrective-actions board + email nudges",
      "Team workspace + shared learned rules",
      "Signature sign-off on reports",
      "Everything in Pro, org-wide",
    ],
    cta: "Start your building",
    href: "/signup",
  },
  {
    name: "Healthcare",
    tagline: "EOC / life-safety teams under CMS and Joint Commission survey.",
    price: "$399",
    period: "/ facility / mo",
    featured: false,
    includes: [
      "Everything in Facility",
      "EOC-structured PDF reports",
      "CAP / LSRA / ILSM at team scale",
      "Survey-prep deliverables",
      "Priority support",
      "Costs less than one bad survey day",
    ],
    cta: "Book a walk-through",
    href: "mailto:hello@compliancelens.app",
  },
];

/** Each guarantee targets a verified complaint in SafetyCulture (now
 *  Mitti) reviews — watermarked exports, Premium-gated bulk export,
 *  3-device caps, per-seat math, renewal price surprises. */
const GUARANTEES = [
  "No watermarks on any tier",
  "Full export, free, forever",
  "No device limits",
  "Unlimited viewers & assignees",
  "12-month notice before any price change",
  "Cancel monthly plans anytime",
];

export function LandingPricing() {
  return (
    <section
      id="pricing"
      style={{ background: "#ece8da", padding: "96px 24px" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <p
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#5f6b72",
              marginBottom: 14,
            }}
          >
            § 07 — Pricing
          </p>
          <h2
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: "clamp(36px, 5vw, 68px)",
              lineHeight: 1.02,
              letterSpacing: "-0.01em",
              maxWidth: 900,
              margin: "0 auto",
              color: "#0f1518",
              textWrap: "balance",
            }}
          >
            One line item.
            <br />
            <em style={{ fontStyle: "italic", color: "#b8902f" }}>
              Cheaper than a single citation.
            </em>
          </h2>
        </div>

        <div
          className="pricing-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
            border: "1px solid #0f1518",
          }}
        >
          {TIERS.map((t, i) => (
            <div
              key={t.name}
              style={{
                padding: "40px 28px",
                borderRight: i < TIERS.length - 1 ? "1px solid #0f1518" : "none",
                background: t.featured ? "#0f1518" : "#ece8da",
                color: t.featured ? "#ece8da" : "#0f1518",
                display: "flex",
                flexDirection: "column",
                position: "relative",
              }}
            >
              {t.featured ? (
                <span
                  style={{
                    position: "absolute",
                    top: -1,
                    right: -1,
                    background: "#c89b3c",
                    color: "#0f1518",
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    padding: "6px 12px",
                  }}
                >
                  Most chosen
                </span>
              ) : null}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontSize: 32,
                  }}
                >
                  {t.name}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    color: t.featured ? "#c89b3c" : "#5f6b72",
                  }}
                >
                  TIER {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: t.featured ? "#8a9097" : "#5f6b72",
                  minHeight: 42,
                  margin: "0 0 24px",
                }}
              >
                {t.tagline}
              </p>

              <div
                style={{
                  paddingBottom: 24,
                  marginBottom: 24,
                  borderBottom: `1px solid ${
                    t.featured ? "rgba(236,232,218,0.2)" : "#b9b39e"
                  }`,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontSize: 56,
                    lineHeight: 1,
                  }}
                >
                  {t.price}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 12,
                    color: t.featured ? "#8a9097" : "#5f6b72",
                    marginLeft: 6,
                  }}
                >
                  {t.period}
                </span>
              </div>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  flex: 1,
                }}
              >
                {t.includes.map((line) => (
                  <li
                    key={line}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      fontSize: 14,
                      lineHeight: 1.45,
                    }}
                  >
                    <span
                      style={{
                        color: "#c89b3c",
                        fontFamily: "var(--font-jetbrains-mono)",
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      ✓
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={t.href}
                style={{
                  marginTop: 32,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "13px 22px",
                  background: t.featured ? "#c89b3c" : "transparent",
                  color: "#0f1518",
                  fontFamily: "var(--font-geist-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  border: t.featured
                    ? "1px solid #c89b3c"
                    : "1px solid #0f1518",
                  textDecoration: "none",
                }}
              >
                {t.cta}
                <span
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontStyle: "italic",
                    color: t.featured ? "#0f1518" : "#b8902f",
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                >
                  →
                </span>
              </Link>
            </div>
          ))}
        </div>

        {/* The guarantees strip — each line counters a documented
            SafetyCulture/Mitti complaint. This is positioning, not filler. */}
        <div
          style={{
            marginTop: 40,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "10px 28px",
          }}
        >
          {GUARANTEES.map((g) => (
            <span
              key={g}
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "#0f1518",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ color: "#b8902f" }}>✓</span>
              {g}
            </span>
          ))}
        </div>

        <p
          style={{
            marginTop: 28,
            fontSize: 13,
            color: "#5f6b72",
            textAlign: "center",
          }}
        >
          Multi-building portfolio or health system?{" "}
          <a
            href="mailto:hello@compliancelens.app"
            style={{ color: "#0f1518", textDecorationColor: "#b8902f" }}
          >
            Talk to us about Portfolio pricing
          </a>
          {" "}— volume per-facility rates plus the option of a Samektra
          analyst running the program for you. Non-profit and public-sector
          discounts on request.
        </p>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .pricing-grid > div { border-right: none !important; border-bottom: 1px solid #0f1518 !important; }
          .pricing-grid > div:nth-child(odd) { border-right: 1px solid #0f1518 !important; }
          .pricing-grid > div:nth-last-child(-n+2) { border-bottom: none !important; }
        }
        @media (max-width: 640px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
          .pricing-grid > div { border-right: none !important; border-bottom: 1px solid #0f1518 !important; }
          .pricing-grid > div:last-child { border-bottom: none !important; }
        }
      `}</style>
    </section>
  );
}
