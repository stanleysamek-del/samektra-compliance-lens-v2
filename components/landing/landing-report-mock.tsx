/**
 * §06½ Report mock — sample signed PDF preview. Paper-stack offset
 * shadow on a slightly warmer cream than the surrounding body, header
 * + severity boxes + finding-table excerpt + signature block + a faint
 * "Specimen" watermark rotated -18°. Pairs with a left-side copy block.
 */
const FINDING_ROWS: Array<[string, string, string, "High" | "Medium" | "Low"]> = [
  ["F-01", "NFPA 101 §7.1.10.1", "Means of egress obstructed", "High"],
  ["F-02", "NFPA 10 §6.1.3.3", "Extinguisher access", "Medium"],
  ["F-03", "NFPA 101 §7.10.1.5", "Exit sign illumination", "Low"],
  ["F-04", "CMS §482.41(b)(1)", "Penetration in fire barrier", "Medium"],
  ["F-05", "NEC §110.26(A)", "Working clearance", "High"],
];

const SEV_COLOR: Record<string, string> = {
  High: "#a8362b",
  Medium: "#b8762a",
  Low: "#607a3a",
};

export function LandingReportMock() {
  return (
    <section style={{ background: "#f3efe3", padding: "96px 24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          className="report-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.3fr",
            gap: 64,
            alignItems: "start",
          }}
        >
          {/* Left: copy + deliverables grid */}
          <div style={{ position: "sticky", top: 100 }}>
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
              § 06½ — The deliverable
            </p>
            <h2
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: "clamp(32px, 4.6vw, 56px)",
                lineHeight: 1.02,
                letterSpacing: "-0.01em",
                marginBottom: 24,
                margin: "0 0 24px",
                color: "#0f1518",
                textWrap: "balance",
              }}
            >
              The kind of report your AHJ{" "}
              <em style={{ fontStyle: "italic", color: "#b8902f" }}>
                actually reads.
              </em>
            </h2>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.6,
                color: "#1a2226",
                marginBottom: 28,
                textWrap: "pretty",
              }}
            >
              Every signed PDF includes a chain-of-custody manifest, the
              original photographs at full resolution, the cited code text
              inline, the corrective action plan, and your signature block.
              Nothing hand-typed.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 32,
              }}
            >
              {[
                ["CAP", "Corrective Action Plan"],
                ["LSRA", "Life Safety Risk Assessment"],
                ["ILSM", "Interim Life Safety Measures"],
                ["PDF", "Signed inspection report"],
              ].map(([id, name]) => (
                <div
                  key={id}
                  style={{
                    padding: "14px 16px",
                    border: "1px solid #0f1518",
                    background: "#ece8da",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains-mono)",
                      fontSize: 12,
                      color: "#b8902f",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {id}
                  </span>
                  <div
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontSize: 18,
                      marginTop: 4,
                      color: "#0f1518",
                    }}
                  >
                    {name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: paper-stack report mock */}
          <div
            style={{
              background: "#fdfbf3",
              border: "1px solid #0f1518",
              boxShadow:
                "24px 24px 0 -20px #b9b39e, 48px 48px 0 -42px #b9b39e",
              padding: "40px 44px",
              position: "relative",
              color: "#0a0a0a",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 24,
                gap: 16,
                position: "relative",
                zIndex: 2,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "#5f6b72",
                  }}
                >
                  COMPLIANCE LENS · INSPECTION REPORT
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontSize: 28,
                    lineHeight: 1.1,
                    marginTop: 4,
                  }}
                >
                  St. Anselm Reg&rsquo;l Hospital
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 11,
                    color: "#5f6b72",
                    marginTop: 6,
                  }}
                >
                  EAST TOWER · 3RD FLOOR · LIFE SAFETY WALKTHROUGH
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
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
                    marginBottom: 8,
                  }}
                >
                  Signed · 05/14/26
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 10,
                    color: "#5f6b72",
                  }}
                >
                  FILE CL-2026-481 · PAGE 1 / 14
                </div>
              </div>
            </div>

            <div
              aria-hidden
              style={{
                height: 1,
                background: "#0a0a0a",
                marginBottom: 24,
                position: "relative",
                zIndex: 2,
              }}
            />

            {/* Severity summary boxes */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
                marginBottom: 28,
                position: "relative",
                zIndex: 2,
              }}
            >
              {[
                ["11", "Findings", "#0a0a0a"],
                ["3", "High", "#a8362b"],
                ["6", "Medium", "#b8762a"],
                ["2", "Low", "#607a3a"],
              ].map(([n, label, color]) => (
                <div
                  key={label}
                  style={{ border: `1px solid ${color}`, padding: "10px 12px" }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontSize: 28,
                      lineHeight: 1,
                      color,
                    }}
                  >
                    {n}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-jetbrains-mono)",
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#5f6b72",
                      marginTop: 4,
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Findings table excerpt */}
            <div
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#5f6b72",
                marginBottom: 8,
                position: "relative",
                zIndex: 2,
              }}
            >
              Findings · excerpt
            </div>
            <div
              style={{
                borderTop: "1px solid #0a0a0a",
                borderBottom: "1px solid #0a0a0a",
                position: "relative",
                zIndex: 2,
              }}
            >
              {FINDING_ROWS.map((row, i) => (
                <div
                  key={row[0]}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "50px 150px 1fr 70px",
                    padding: "10px 0",
                    borderTop: i > 0 ? "1px solid #d9d3c0" : "none",
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains-mono)",
                      fontSize: 11,
                    }}
                  >
                    {row[0]}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains-mono)",
                      fontSize: 11,
                      color: "#5f6b72",
                    }}
                  >
                    {row[1]}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontSize: 16,
                    }}
                  >
                    {row[2]}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains-mono)",
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: SEV_COLOR[row[3]],
                      textAlign: "right",
                    }}
                  >
                    {row[3]}
                  </span>
                </div>
              ))}
            </div>

            {/* Signature block */}
            <div
              style={{
                marginTop: 32,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 32,
                position: "relative",
                zIndex: 2,
              }}
            >
              {[
                ["M. Reyes, CFPS", "Inspecting officer"],
                ["D. Whittaker", "Facility safety officer"],
              ].map(([name, role]) => (
                <div key={name}>
                  <div
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontStyle: "italic",
                      fontSize: 22,
                      paddingBottom: 4,
                      borderBottom: "1px solid #0a0a0a",
                    }}
                  >
                    {name}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-jetbrains-mono)",
                      fontSize: 9,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: "#5f6b72",
                      marginTop: 6,
                    }}
                  >
                    {role}
                  </div>
                </div>
              ))}
            </div>

            {/* Specimen watermark */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) rotate(-18deg)",
                fontFamily: "var(--font-instrument-serif)",
                fontStyle: "italic",
                fontSize: 120,
                color: "rgba(200,155,60,0.10)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                zIndex: 1,
              }}
            >
              Specimen
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .report-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  );
}
