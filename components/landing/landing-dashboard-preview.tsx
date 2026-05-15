/**
 * §06 Dashboard preview — browser-chrome card containing a mock of the
 * gated /inspections route. KPI strip + filter chips + table + footer.
 * Static (no interactive filtering) since this is purely visual on the
 * marketing page.
 */
const INSPECTIONS = [
  { id: "CL-2026-481", facility: "St. Anselm Regional Hospital", area: "3-East · East Tower", date: "05/14/26", findings: 11, high: 3, status: "signed", officer: "M. Reyes, CFPS" },
  { id: "CL-2026-478", facility: "Mercy Med · ICU", area: "Floor 2 · Wing C", date: "05/13/26", findings: 7, high: 1, status: "in-review", officer: "D. Whittaker" },
  { id: "CL-2026-476", facility: "Memorial Hospital · 4-West", area: "East corridor", date: "05/13/26", findings: 14, high: 4, status: "open", officer: "M. Reyes, CFPS" },
  { id: "CL-2026-474", facility: "Bayview Senior Living", area: "Common areas + B1", date: "05/12/26", findings: 9, high: 0, status: "signed", officer: "A. Patel" },
  { id: "CL-2026-471", facility: "Northside Clinic · Bldg 2", area: "Mechanical room", date: "05/12/26", findings: 5, high: 2, status: "submitted", officer: "D. Whittaker" },
  { id: "CL-2026-468", facility: "St. Anselm Regional Hospital", area: "2-North", date: "05/11/26", findings: 4, high: 0, status: "signed", officer: "M. Reyes, CFPS" },
  { id: "CL-2026-465", facility: "Veterans Medical Campus", area: "Outpatient block", date: "05/10/26", findings: 18, high: 5, status: "in-review", officer: "A. Patel" },
];

const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  open: { label: "Open", color: "#e89233", dot: "#e89233" },
  "in-review": { label: "In review", color: "#c89b3c", dot: "#c89b3c" },
  submitted: { label: "Submitted", color: "#7aa9d1", dot: "#7aa9d1" },
  signed: { label: "Signed", color: "#9bc25a", dot: "#9bc25a" },
};

export function LandingDashboardPreview() {
  const total = INSPECTIONS.length;
  const open =
    INSPECTIONS.filter((i) => i.status === "open").length +
    INSPECTIONS.filter((i) => i.status === "in-review").length;
  const signed = INSPECTIONS.filter((i) => i.status === "signed").length;
  const high = INSPECTIONS.reduce((acc, i) => acc + i.high, 0);

  return (
    <section
      id="dashboard"
      style={{ background: "#ece8da", padding: "96px 24px" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          className="dash-header"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr",
            gap: 64,
            marginBottom: 48,
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
              § 06 — Dashboard
            </p>
            <h2
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: "clamp(32px, 5vw, 64px)",
                lineHeight: 1.02,
                letterSpacing: "-0.01em",
                margin: 0,
                color: "#0f1518",
                textWrap: "balance",
              }}
            >
              Your{" "}
              <em style={{ fontStyle: "italic", color: "#b8902f" }}>
                inspections
              </em>
              , at a glance.
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
            Every walk-through, every signed report, every CAP entry — in one
            place. The dashboard is your audit trail, your work queue, and the
            home you&apos;ll show the surveyor.
          </p>
        </div>

        {/* Browser chrome card */}
        <div
          style={{
            border: "1px solid #0f1518",
            background: "#f3efe3",
            boxShadow: "0 24px 40px -28px rgba(0,0,0,0.3)",
          }}
        >
          {/* Title bar */}
          <div
            style={{
              background: "#0f1518",
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#5a5a5a" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#5a5a5a" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#5a5a5a" }} />
            <span
              style={{
                marginLeft: 16,
                padding: "4px 10px",
                background: "rgba(236,232,218,0.08)",
                borderRadius: 3,
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 11,
                color: "rgba(236,232,218,0.7)",
                letterSpacing: "0.04em",
              }}
            >
              compliancelens.app/inspections
            </span>
            <span style={{ marginLeft: "auto" }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "#c89b3c",
                  color: "#0f1518",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: 13,
                }}
              >
                MR
              </span>
            </span>
          </div>

          {/* App header */}
          <div
            style={{
              padding: "20px 28px",
              borderBottom: "1px solid #b9b39e",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 10,
                  color: "#5f6b72",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                SAMEKTRA · COMPLIANCE LENS v2
              </span>
              <h3
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: 26,
                  marginTop: 4,
                  margin: "4px 0 0",
                  color: "#0f1518",
                }}
              >
                Inspections
              </h3>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontFamily: "var(--font-geist-sans)",
                  border: "1px solid #0f1518",
                  color: "#0f1518",
                }}
              >
                Filter ▾
              </span>
              <span
                style={{
                  padding: "8px 14px",
                  fontSize: 12,
                  fontFamily: "var(--font-geist-sans)",
                  background: "#0f1518",
                  color: "#ece8da",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                + New inspection
                <span
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontStyle: "italic",
                    color: "#c89b3c",
                  }}
                >
                  →
                </span>
              </span>
            </div>
          </div>

          {/* KPI strip */}
          <div
            className="kpi-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              borderBottom: "1px solid #b9b39e",
            }}
          >
            {[
              { label: "Total", value: total, sub: "", color: "#0f1518" },
              { label: "Open + review", value: open, sub: "active", color: "#c89b3c" },
              { label: "Signed", value: signed, sub: "this month", color: "#7a9e4a" },
              { label: "High-severity", value: high, sub: "across portfolio", color: "#a8362b" },
            ].map((k, i) => (
              <div
                key={k.label}
                style={{
                  padding: "18px 22px",
                  borderRight: i < 3 ? "1px solid #b9b39e" : "none",
                }}
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
                  {k.label}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontSize: 36,
                      lineHeight: 1,
                      color: k.color,
                    }}
                  >
                    {k.value}
                  </span>
                  {k.sub ? (
                    <span style={{ fontSize: 11, color: "#5f6b72" }}>{k.sub}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* Filter chips */}
          <div
            style={{
              padding: "14px 28px",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              borderBottom: "1px solid #b9b39e",
            }}
          >
            {[
              ["All", true],
              ["Open", false],
              ["In review", false],
              ["Submitted", false],
              ["Signed", false],
            ].map(([label, active]) => (
              <span
                key={label as string}
                style={{
                  padding: "6px 12px",
                  background: active ? "#0f1518" : "transparent",
                  color: active ? "#ece8da" : "#0f1518",
                  border: "1px solid #0f1518",
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Table header */}
          <div
            className="dash-row"
            style={{
              display: "grid",
              gridTemplateColumns: "140px 1.4fr 1fr 90px 110px 1fr 140px",
              padding: "12px 28px",
              borderBottom: "1px solid #b9b39e",
              background: "#d9d3c0",
            }}
          >
            {["File №", "Facility", "Area", "Date", "Findings", "Officer", "Status"].map(
              (h) => (
                <span
                  key={h}
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#5f6b72",
                  }}
                >
                  {h}
                </span>
              ),
            )}
          </div>

          {/* Rows */}
          {INSPECTIONS.map((row, i) => {
            const s = STATUS_META[row.status];
            return (
              <div
                key={row.id}
                className="dash-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1.4fr 1fr 90px 110px 1fr 140px",
                  padding: "16px 28px",
                  borderBottom:
                    i < INSPECTIONS.length - 1 ? "1px solid #b9b39e" : "none",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 12,
                    color: "#b8902f",
                  }}
                >
                  {row.id}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontSize: 17,
                    color: "#0f1518",
                    lineHeight: 1.2,
                  }}
                >
                  {row.facility}
                </span>
                <span style={{ fontSize: 13, color: "#1a2226" }}>{row.area}</span>
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 12,
                    color: "#5f6b72",
                  }}
                >
                  {row.date}
                </span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontSize: 20,
                      color: "#0f1518",
                    }}
                  >
                    {row.findings}
                  </span>
                  {row.high > 0 ? (
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains-mono)",
                        fontSize: 10,
                        color: "#a8362b",
                        letterSpacing: "0.08em",
                      }}
                    >
                      · {row.high} high
                    </span>
                  ) : null}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "var(--font-instrument-serif)",
                    fontStyle: "italic",
                    color: "#1a2226",
                  }}
                >
                  {row.officer}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: s.dot,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains-mono)",
                        fontSize: 11,
                        color: s.color,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {s.label}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}

          {/* Footer */}
          <div
            style={{
              padding: "14px 28px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid #b9b39e",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 11,
                color: "#5f6b72",
                letterSpacing: "0.1em",
              }}
            >
              Showing {INSPECTIONS.length} of {INSPECTIONS.length}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <span
                style={{
                  padding: "6px 10px",
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  border: "1px solid #b9b39e",
                  color: "#5f6b72",
                }}
              >
                ← Prev
              </span>
              <span
                style={{
                  padding: "6px 10px",
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  border: "1px solid #0f1518",
                  color: "#0f1518",
                }}
              >
                Next →
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1000px) {
          .dash-header { grid-template-columns: 1fr !important; gap: 32px !important; }
          .dash-row {
            grid-template-columns: 100px 1fr 100px !important;
            row-gap: 8px !important;
          }
          .dash-row > :nth-child(3),
          .dash-row > :nth-child(4),
          .dash-row > :nth-child(6) {
            display: none !important;
          }
        }
        @media (max-width: 600px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .kpi-grid > div:nth-child(2) { border-right: none !important; }
          .kpi-grid > div:nth-child(1), .kpi-grid > div:nth-child(2) { border-bottom: 1px solid #b9b39e !important; }
        }
      `}</style>
    </section>
  );
}
