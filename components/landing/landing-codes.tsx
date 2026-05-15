/**
 * §05 Codes — directory table of supported codebases on ink background.
 * Mono code IDs in gold, serif names in paper, mono scope + rule counts.
 */
const CODES = [
  { id: "NFPA 101", name: "Life Safety Code", scope: "Egress, occupancy, hazards", rules: "1,820" },
  { id: "NFPA 99", name: "Health Care Facilities", scope: "Med gas, electrical, gas, vacuum", rules: "740" },
  { id: "NFPA 10", name: "Portable Fire Extinguishers", scope: "Selection, placement, inspection", rules: "210" },
  { id: "IBC", name: "International Building Code", scope: "Structure, occupancy class, egress", rules: "2,640" },
  { id: "IFC", name: "International Fire Code", scope: "Fire prevention, hazardous materials", rules: "1,950" },
  { id: "NEC (NFPA 70)", name: "National Electrical Code", scope: "Wiring, working clearances, grounding", rules: "3,180" },
  { id: "CMS", name: "Conditions of Participation", scope: "CoP §482.41, life safety from fire", rules: "410" },
  { id: "TJC", name: "The Joint Commission", scope: "EC, EM, LS standards", rules: "880" },
  { id: "ADA", name: "ADA Standards for Accessible Design", scope: "2010 Standards, Title II / III", rules: "720" },
  { id: "ANSI A117.1", name: "Accessible Buildings", scope: "Reach ranges, mounting, clear floor", rules: "510" },
  { id: "CDC / HAI", name: "Infection-control · environmental", scope: "Surfaces, water, ventilation, hygiene", rules: "420" },
  { id: "GA T.25", name: "Georgia Title 25", scope: "State fire-safety adoption and amendments", rules: "340" },
];

export function LandingCodes() {
  return (
    <section
      id="codes"
      style={{
        background: "#1a2226",
        padding: "96px 24px",
        color: "#ece8da",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div
          className="codes-header"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr",
            gap: 64,
            marginBottom: 64,
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
                color: "#8a9097",
                marginBottom: 14,
              }}
            >
              § 05 — Codebases
            </p>
            <h2
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: "clamp(36px, 5vw, 68px)",
                lineHeight: 1.02,
                letterSpacing: "-0.01em",
                margin: 0,
                color: "#ece8da",
                textWrap: "balance",
              }}
            >
              We read the{" "}
              <em style={{ fontStyle: "italic", color: "#c89b3c" }}>codes</em>{" "}
              so your team doesn&apos;t have to scroll through them.
            </h2>
          </div>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: "#8a9097",
              maxWidth: 540,
              paddingBottom: 12,
              textWrap: "pretty",
              margin: 0,
            }}
          >
            Each codebase is parsed to the section level. A single photo can
            return findings from three different codes; we reconcile severity,
            citation, and remediation in one record.
          </p>
        </div>

        {/* Table */}
        <div style={{ border: "1px solid rgba(236,232,218,0.25)" }}>
          {/* Header */}
          <div
            className="codes-row"
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr 1.4fr 120px",
              padding: "14px 20px",
              borderBottom: "1px solid rgba(236,232,218,0.25)",
              background: "rgba(236,232,218,0.04)",
            }}
          >
            {[
              ["Standard", false],
              ["Name", false],
              ["Scope", true],
              ["Rules indexed", true],
            ].map(([h, hideOnNarrow]) => (
              <span
                key={h as string}
                className={hideOnNarrow ? "codes-hide-narrow" : ""}
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#8a9097",
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {CODES.map((c, i) => (
            <div
              key={c.id}
              className="codes-row"
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 1.4fr 120px",
                padding: "18px 20px",
                borderBottom:
                  i < CODES.length - 1
                    ? "1px solid rgba(236,232,218,0.12)"
                    : "none",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 13,
                  color: "#c89b3c",
                  letterSpacing: "0.04em",
                }}
              >
                {c.id}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: 20,
                  color: "#ece8da",
                }}
              >
                {c.name}
              </span>
              <span
                className="codes-hide-narrow"
                style={{ fontSize: 13, color: "#8a9097" }}
              >
                {c.scope}
              </span>
              <span
                className="codes-hide-narrow"
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 12,
                  color: "#ece8da",
                }}
              >
                {c.rules}
              </span>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: 24,
            fontSize: 13,
            color: "#8a9097",
            textAlign: "center",
          }}
        >
          New AHJ on the horizon? Email{" "}
          <span style={{ color: "#c89b3c" }}>codes@compliancelens.app</span> —
          onboarding a new codebase takes about a week.
        </p>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .codes-header { grid-template-columns: 1fr !important; gap: 32px !important; }
          .codes-row { grid-template-columns: 120px 1fr !important; }
          .codes-hide-narrow { display: none !important; }
        }
      `}</style>
    </section>
  );
}
