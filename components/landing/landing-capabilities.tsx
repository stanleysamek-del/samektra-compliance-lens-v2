/**
 * §03 Capabilities — 4-card grid of inspection-grade tools.
 * Borderless grid where cells share 1px ink hairlines; alternating
 * paper / paper-2 cell backgrounds; gold-italic number eyebrow per card.
 */
const FEATURES = [
  {
    num: "01",
    title: "Photo-first capture",
    body:
      "Snap with the iOS app or upload from desktop. Each frame is geotagged, time-stamped, and chain-of-custody hashed.",
    foot: "Offline-capable",
  },
  {
    num: "02",
    title: "Snap & analyze",
    body:
      "Photos are instantly inspected against fire, electrical, egress, ADA, and infection-control rules. Each frame run against ten codebases with overlap reconciled.",
    foot: "10 codebases · 14,000+ rules",
  },
  {
    num: "03",
    title: "Edit & verify",
    body:
      "AI flags. You confirm. Severity, code citations, and bounding boxes are all editable before sign-off. Every edit logged for the audit trail.",
    foot: "Inspector-in-the-loop",
  },
  {
    num: "04",
    title: "Export deliverables",
    body:
      "CAP, LSRA, ILSM as native Excel. A signed PDF report with embedded photos and citations — ready for the manager and the file.",
    foot: "Excel · PDF · CSV",
  },
];

export function LandingCapabilities() {
  return (
    <section
      id="capabilities"
      style={{ background: "#ece8da", padding: "96px 24px" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          className="cap-header"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: 64,
            marginBottom: 80,
            alignItems: "end",
          }}
        >
          <div>
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
              § 03 — Capabilities
            </p>
            <h2
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: "clamp(36px, 5vw, 68px)",
                lineHeight: 1.02,
                letterSpacing: "-0.01em",
                margin: 0,
                color: "#0f1518",
                textWrap: "balance",
              }}
            >
              From walk-through to{" "}
              <em style={{ fontStyle: "italic", color: "#b8902f" }}>
                signed report
              </em>
              , in one tool.
            </h2>
          </div>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: "#1a2226",
              maxWidth: 540,
              paddingBottom: 12,
              textWrap: "pretty",
              margin: 0,
            }}
          >
            Compliance Lens isn&apos;t a spreadsheet with a logo. It&apos;s an
            inspection-grade workflow built on the codes you&apos;re actually
            audited against — wired end-to-end so a photo on Tuesday becomes a
            deliverable on Wednesday.
          </p>
        </div>

        {/* 4-up grid */}
        <div
          className="cap-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
            borderTop: "1px solid #0f1518",
            borderLeft: "1px solid #0f1518",
          }}
        >
          {FEATURES.map((f, i) => (
            <div
              key={f.num}
              style={{
                padding: "32px 28px 28px",
                borderRight: "1px solid #0f1518",
                borderBottom: "1px solid #0f1518",
                background: i % 2 === 0 ? "#ece8da" : "#f3efe3",
                minHeight: 320,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  color: "#b8902f",
                }}
              >
                {f.num}
              </span>
              <h3
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: 28,
                  lineHeight: 1.05,
                  margin: "20px 0 16px",
                  color: "#0f1518",
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: "#1a2226",
                  flex: 1,
                  textWrap: "pretty",
                  margin: 0,
                }}
              >
                {f.body}
              </p>
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: "1px solid #b9b39e",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#5f6b72",
                  }}
                >
                  {f.foot}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .cap-header { grid-template-columns: 1fr !important; gap: 32px !important; }
          .cap-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .cap-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
