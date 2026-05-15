import Link from "next/link";

/**
 * Editorial "inspection record" hero. Cream paper card with metadata
 * strip, oversized serif headline with italic gold accent, body copy,
 * platform pills, CTA pair, signature block, codebase coverage strip.
 *
 * Right column is a static document-preview card (a simplified version
 * of the auto-cycling iPhone in the reference) — keeps things lightweight
 * and server-renderable. Can be upgraded to the animated phone later.
 */
export function LandingHero() {
  const today = new Date();
  const dateStr = `${String(today.getMonth() + 1).padStart(2, "0")} / ${String(
    today.getDate(),
  ).padStart(2, "0")} / ${today.getFullYear()}`;

  return (
    <section
      style={{
        position: "relative",
        padding: "32px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <article
          style={{
            border: "1px solid #0f1518",
            background: "#f3efe3",
            padding: "56px 56px 48px",
            position: "relative",
            boxShadow: "20px 20px 0 -16px #d9d3c0",
          }}
        >
          {/* Metadata strip */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 28,
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "5px 10px",
                  border: "1px solid #c89b3c",
                  color: "#b8902f",
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  background: "rgba(200,155,60,0.04)",
                }}
              >
                Your Compliance Ally
              </span>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#5f6b72",
                }}
              >
                by Samektra · v2 staging
              </span>
            </div>
            <div
              className="hero-meta-right"
              style={{ display: "flex", alignItems: "center", gap: 24 }}
            >
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#5f6b72",
                }}
              >
                Issued&nbsp;&nbsp;{dateStr}
              </span>
            </div>
          </div>

          <div aria-hidden style={{ height: 1, background: "#0f1518", opacity: 0.85, marginBottom: 48 }} />

          {/* Two-column body */}
          <div
            className="hero-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 1fr",
              gap: 56,
              alignItems: "center",
            }}
          >
            {/* Left: headline + body */}
            <div>
              <p
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#5f6b72",
                  marginBottom: 24,
                }}
              >
                § 01 — The thesis
              </p>
              <h1
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: "clamp(40px, 6.4vw, 88px)",
                  lineHeight: 1.02,
                  letterSpacing: "-0.01em",
                  margin: "0 0 24px 0",
                  textWrap: "balance",
                  color: "#0f1518",
                }}
              >
                The compliance officer that fits in your{" "}
                <em style={{ fontStyle: "italic", color: "#b8902f" }}>
                  pocket.
                </em>
              </h1>
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.55,
                  color: "#1a2226",
                  maxWidth: 540,
                  marginBottom: 28,
                  textWrap: "pretty",
                }}
              >
                Walk a building. Snap a photo. Compliance Lens flags violations
                against fire, electrical, egress, ADA, and infection-control
                rules — then exports your CAP, LSRA, ILSM, and signed PDF
                report.
              </p>

              {/* Platform pills */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 28,
                }}
              >
                {[
                  ["iPhone", "◧"],
                  ["iPad", "▭"],
                  ["Web", "⊞"],
                ].map(([label, glyph]) => (
                  <span
                    key={label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      border: "1px solid #0f1518",
                      fontFamily: "var(--font-jetbrains-mono)",
                      fontSize: 11,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                    }}
                  >
                    <span style={{ color: "#b8902f" }}>{glyph}</span>
                    {label}
                  </span>
                ))}
              </div>

              {/* CTAs */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 32 }}>
                <Link
                  href="/signup"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 22px",
                    background: "#0f1518",
                    color: "#ece8da",
                    fontFamily: "var(--font-geist-sans)",
                    fontSize: 14,
                    fontWeight: 500,
                    border: "1px solid #0f1518",
                    textDecoration: "none",
                  }}
                >
                  Create your account
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
                </Link>
                <a
                  href="#workflow"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "13px 22px",
                    background: "transparent",
                    color: "#0f1518",
                    fontFamily: "var(--font-geist-sans)",
                    fontSize: 14,
                    fontWeight: 500,
                    border: "1px solid #0f1518",
                    textDecoration: "none",
                  }}
                >
                  See it work
                  <span
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontStyle: "italic",
                      color: "#b8902f",
                      fontSize: 18,
                      lineHeight: 1,
                    }}
                  >
                    ↓
                  </span>
                </a>
              </div>

              {/* Signature block — hides on small screens */}
              <div className="hero-signature" style={{ display: "flex", gap: 32, flexWrap: "wrap", marginTop: 40 }}>
                {[
                  ["Inspector", "M. Reyes, CFPS", true],
                  ["Facility", "St. Anselm Reg’l Hosp.", false],
                  ["Authority", "TJC · CMS", false],
                ].map(([label, value, italic]) => (
                  <div key={label as string} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains-mono)",
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "#5f6b72",
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        fontFamily: italic
                          ? "var(--font-instrument-serif)"
                          : "var(--font-jetbrains-mono)",
                        fontStyle: italic ? "italic" : "normal",
                        fontSize: italic ? 20 : 13,
                        color: "#0f1518",
                        paddingBottom: 4,
                        borderBottom: "1px solid #0f1518",
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: simplified inspection record preview */}
            <div
              className="hero-preview-wrap"
              style={{
                display: "flex",
                justifyContent: "center",
                position: "relative",
                minHeight: 480,
              }}
            >
              <HeroPreviewCard />
            </div>
          </div>

          {/* Codebase coverage strip */}
          <div aria-hidden style={{ height: 1, background: "#0f1518", opacity: 0.85, marginTop: 56, marginBottom: 20 }} />
          <div
            style={{
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
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#5f6b72",
              }}
            >
              Codebase coverage
            </span>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              {["NFPA 101", "NFPA 99", "IBC", "IFC", "NEC", "CMS", "TJC", "ADA", "ANSI A117.1", "GA Title 25"].map((c) => (
                <span
                  key={c}
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    color: "#0f1518",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </article>
      </div>

      {/* Responsive — stack columns, hide secondary metadata + signature on small */}
      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .hero-preview-wrap { min-height: 360px !important; }
        }
        @media (max-width: 600px) {
          .hero-meta-right { display: none !important; }
          .hero-signature { display: none !important; }
        }
      `}</style>
    </section>
  );
}

/**
 * Static mock of an inspection finding card — stands in for the
 * auto-cycling iPhone preview in the JSX reference. Renders without
 * any client-side state so it's pure SSR.
 */
function HeroPreviewCard() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 340,
      }}
    >
      {/* Main card */}
      <div
        style={{
          background: "#0f1518",
          color: "#ece8da",
          padding: "18px 18px 16px",
          border: "1px solid #0f1518",
          boxShadow: "0 24px 50px -28px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#8a9097",
            }}
          >
            CAPTURE · LIVE
          </span>
          <span
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 9,
              letterSpacing: "0.12em",
              color: "#c89b3c",
            }}
          >
            ● 0.94 CONF
          </span>
        </div>

        {/* Photo placeholder — abstract gradient stand-in for the on-screen image */}
        <div
          style={{
            position: "relative",
            aspectRatio: "4 / 3",
            background:
              "linear-gradient(135deg, #1a2226 0%, #2a363c 45%, #1a2226 100%)",
            marginBottom: 12,
            overflow: "hidden",
            border: "1px solid rgba(236,232,218,0.1)",
          }}
        >
          {/* Bbox overlay */}
          <div
            style={{
              position: "absolute",
              top: "32%",
              left: "20%",
              width: "44%",
              height: "38%",
              border: "1.5px solid #ef4d3f",
              boxShadow: "0 0 0 1px rgba(239,77,63,0.25)",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -18,
                left: -1,
                background: "#ef4d3f",
                color: "#0f1518",
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 8,
                letterSpacing: "0.14em",
                padding: "2px 5px",
                textTransform: "uppercase",
              }}
            >
              High · NFPA 101
            </span>
          </div>
          {/* Vignette */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 50% 55%, transparent 50%, rgba(10,16,19,0.55) 100%)",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* Finding strip */}
        <div style={{ borderTop: "1px solid rgba(236,232,218,0.18)", paddingTop: 10 }}>
          <span
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "#c89b3c",
              textTransform: "uppercase",
            }}
          >
            NFPA 101 §7.1.10.1
          </span>
          <p
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: 18,
              lineHeight: 1.2,
              margin: "6px 0 4px",
              color: "#ece8da",
            }}
          >
            Egress obstructed
          </p>
          <p
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 9,
              letterSpacing: "0.06em",
              color: "#8a9097",
              margin: 0,
            }}
          >
            severity HIGH · auto-cited
          </p>
        </div>
      </div>

      {/* Floating "auto-cited" stamp lower-left */}
      <div
        className="hero-float-stamp"
        style={{
          position: "absolute",
          bottom: -24,
          left: -32,
          background: "#ece8da",
          color: "#0f1518",
          border: "1px solid #0f1518",
          padding: "12px 14px",
          maxWidth: 200,
          boxShadow: "0 12px 24px -16px rgba(0,0,0,0.3)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#b8902f",
          }}
        >
          Auto-cited ✓
        </span>
        <p
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontStyle: "italic",
            fontSize: 15,
            margin: "4px 0 0",
            lineHeight: 1.2,
            color: "#0f1518",
          }}
        >
          &ldquo;Walked it Tuesday, filed Wednesday.&rdquo;
        </p>
      </div>

      <style>{`
        @media (max-width: 600px) {
          .hero-float-stamp { display: none !important; }
        }
      `}</style>
    </div>
  );
}
