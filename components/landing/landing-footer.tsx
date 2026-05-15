import Link from "next/link";

/**
 * Footer — large editorial closer + 4-col nav grid + bottom bar +
 * giant outlined wordmark with drift animation.
 */
export function LandingFooter() {
  return (
    <footer
      style={{
        background: "#0f1518",
        color: "#ece8da",
        paddingTop: 96,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>
        {/* Big CTA closer */}
        <div
          style={{
            paddingBottom: 96,
            borderBottom: "1px solid rgba(236,232,218,0.2)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#8a9097",
              marginBottom: 24,
            }}
          >
            § 09 — Next walk-through
          </p>
          <h2
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: "clamp(40px, 7vw, 100px)",
              lineHeight: 0.95,
              letterSpacing: "-0.01em",
              marginBottom: 32,
              color: "#ece8da",
              textWrap: "balance",
              maxWidth: 1100,
              margin: "0 0 32px",
            }}
          >
            Walk it on{" "}
            <em style={{ fontStyle: "italic", color: "#c89b3c" }}>Tuesday.</em>
            <br />
            File it on Wednesday.
          </h2>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Link
              href="/signup"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 22px",
                background: "#c89b3c",
                color: "#0f1518",
                fontFamily: "var(--font-geist-sans)",
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid #c89b3c",
                textDecoration: "none",
              }}
            >
              Start your first inspection
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontStyle: "italic",
                  color: "#0f1518",
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                →
              </span>
            </Link>
            <a
              href="mailto:hello@compliancelens.app?subject=Walk-through%20request"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "13px 22px",
                background: "transparent",
                color: "#ece8da",
                fontFamily: "var(--font-geist-sans)",
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid #ece8da",
                textDecoration: "none",
              }}
            >
              Book a 20-min walk-through
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontStyle: "italic",
                  color: "#c89b3c",
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                →
              </span>
            </a>
            <span
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 11,
                color: "#8a9097",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginLeft: 12,
              }}
            >
              No credit card · 14-day trial
            </span>
          </div>
        </div>

        {/* Nav grid */}
        <div
          className="footer-grid"
          style={{
            padding: "64px 0 48px",
            display: "grid",
            gridTemplateColumns: "1.4fr repeat(4, 1fr)",
            gap: 48,
          }}
        >
          <div>
            <span
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 24,
                letterSpacing: "-0.01em",
                lineHeight: 1,
                color: "#ece8da",
              }}
            >
              Compliance{" "}
              <em style={{ fontStyle: "italic", color: "#c89b3c" }}>Lens</em>
            </span>
            <p
              style={{
                marginTop: 20,
                fontSize: 13,
                lineHeight: 1.55,
                color: "#8a9097",
                maxWidth: 280,
              }}
            >
              Compliance Lens is built by Samektra — a small team of
              life-safety officers, code consultants, and ML engineers based in
              Atlanta, GA.
            </p>
            <div
              style={{
                marginTop: 24,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  color: "#c89b3c",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                Talk to us
              </span>
              <a
                href="mailto:hello@compliancelens.app"
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 13,
                  color: "#ece8da",
                  textDecoration: "none",
                }}
              >
                hello@compliancelens.app
              </a>
            </div>
          </div>

          {[
            {
              title: "Product",
              items: [
                ["Inspections", "/inspections"],
                ["Findings", "/findings"],
                ["Reports", "#capabilities"],
                ["Codebases", "#codes"],
              ],
            },
            {
              title: "Solutions",
              items: [
                ["Hospitals", "#"],
                ["Universities", "#"],
                ["Senior living", "#"],
                ["Public agencies", "#"],
                ["Consultants", "#"],
              ],
            },
            {
              title: "Resources",
              items: [
                ["Sample report", "#"],
                ["Code library", "#codes"],
                ["FAQ", "#faq"],
              ],
            },
            {
              title: "Company",
              items: [
                ["About", "#"],
                ["Customers", "#"],
                ["Trust & security", "#"],
                ["Contact", "mailto:hello@compliancelens.app"],
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#c89b3c",
                  display: "block",
                  marginBottom: 16,
                }}
              >
                {col.title}
              </span>
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: 0,
                  margin: 0,
                }}
              >
                {col.items.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      style={{
                        fontSize: 14,
                        color: "#ece8da",
                        opacity: 0.85,
                        textDecoration: "none",
                      }}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            borderTop: "1px solid rgba(236,232,218,0.2)",
            padding: "24px 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "#8a9097",
              textTransform: "uppercase",
            }}
          >
            © {new Date().getFullYear()} Samektra Inc · Compliance Lens · Atlanta, GA
          </span>
          <div style={{ display: "flex", gap: 24 }}>
            {["Privacy", "Terms", "Trust"].map((x) => (
              <a
                key={x}
                href="#"
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  color: "#8a9097",
                  textTransform: "uppercase",
                  textDecoration: "none",
                }}
              >
                {x}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Giant wordmark closer */}
      <div style={{ overflow: "hidden", borderTop: "1px solid rgba(236,232,218,0.2)" }}>
        <div
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontSize: "clamp(120px, 22vw, 360px)",
            lineHeight: 0.85,
            color: "transparent",
            WebkitTextStroke: "1px rgba(236,232,218,0.18)",
            padding: "24px 0 12px",
            textAlign: "center",
            whiteSpace: "nowrap",
            animation: "mark-drift 22s ease-in-out infinite",
          }}
        >
          Compliance{" "}
          <em
            style={{
              fontStyle: "italic",
              color: "rgba(200,155,60,0.4)",
              WebkitTextStroke: "0",
            }}
          >
            Lens
          </em>
        </div>
      </div>

      <style>{`
        @keyframes mark-drift {
          0%, 100% { transform: translateX(-1.5%); }
          50%      { transform: translateX(1.5%); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes mark-drift { 0%,100% { transform: none; } }
        }
        @media (max-width: 900px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
        }
        @media (max-width: 600px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}
