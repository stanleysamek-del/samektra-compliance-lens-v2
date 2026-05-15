import Link from "next/link";

/**
 * §07 Pricing — three tiers, document-style. Middle tier inverted
 * (ink fill, paper text) and badged "MOST CHOSEN".
 */
const TIERS = [
  {
    name: "Inspector",
    tagline: "For solo consultants and independent CFPS practitioners.",
    price: "$89",
    period: "/ inspector / mo",
    featured: false,
    includes: [
      "Unlimited photo inspections",
      "All 9 codebases",
      "CAP, LSRA, ILSM exports",
      "Signed PDF reports",
      "20 GB photo storage",
      "Email support",
    ],
    cta: "Start a 14-day trial",
    href: "/signup",
  },
  {
    name: "Facility",
    tagline:
      "For hospitals, university campuses, and multi-building portfolios.",
    price: "$1,250",
    period: "/ facility / mo",
    featured: true,
    includes: [
      "Everything in Inspector",
      "Up to 12 inspectors",
      "Per-facility audit trail",
      "AHJ submission templates",
      "TJC tracer integration",
      "SSO / SCIM",
      "Dedicated implementation lead",
      "Priority support (4-hr response)",
    ],
    cta: "Book a walk-through",
    href: "/signup",
  },
  {
    name: "Enterprise",
    tagline: "For health systems, public agencies, and integrated portfolios.",
    price: "Custom",
    period: "volume + region",
    featured: false,
    includes: [
      "Everything in Facility",
      "Custom codebases (state/local)",
      "On-prem photo storage option",
      "BAA · HIPAA · SOC 2 Type II",
      "Custom report templates",
      "Quarterly business review",
      "Named CSM + solutions engineer",
    ],
    cta: "Contact sales",
    href: "mailto:hello@compliancelens.app",
  },
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
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0,
            border: "1px solid #0f1518",
          }}
        >
          {TIERS.map((t, i) => (
            <div
              key={t.name}
              style={{
                padding: "40px 32px",
                borderRight: i < 2 ? "1px solid #0f1518" : "none",
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
                  marginBottom: 24,
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
                  color: t.featured ? "#0f1518" : "#0f1518",
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

        <p
          style={{
            marginTop: 32,
            fontSize: 13,
            color: "#5f6b72",
            textAlign: "center",
          }}
        >
          Annual billing available. Non-profit and public-sector discounts on
          request. All plans include the iOS field app at no extra cost.
        </p>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
          .pricing-grid > div { border-right: none !important; border-bottom: 1px solid #0f1518 !important; }
          .pricing-grid > div:last-child { border-bottom: none !important; }
        }
      `}</style>
    </section>
  );
}
