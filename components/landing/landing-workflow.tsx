import { CountUp } from "@/components/landing/count-up";

/**
 * §04 Workflow + §04½ Stats — paired section. Horizontal 4-step strip
 * showing Walk → Snap → Verify → Export, followed by a 4-up stat block
 * with CountUp animations that trigger when scrolled into view.
 */
const WORKFLOW = [
  ["Walk", "Officer walks the route; phone in hand."],
  ["Snap", "Photos auto-tag location and time."],
  ["Verify", "AI flags. Officer accepts, edits, or rejects."],
  ["Export", "CAP / LSRA / ILSM / PDF — signed and filed."],
] as const;

const STATS = [
  {
    n: 8,
    suffix: " hrs",
    label: "Typical walk-through, before",
    sub: "A 200,000 sf hospital, paper checklists, two officers.",
    gold: false,
  },
  {
    n: 41,
    suffix: " min",
    label: "Same walk-through, after",
    sub: "Photos in pocket, findings on the laptop by lunch.",
    gold: true,
  },
  {
    n: 9,
    suffix: "",
    label: "Codebases cross-referenced",
    sub: "Conflicts and overlaps reconciled per finding.",
    gold: false,
  },
  {
    n: 0,
    suffix: "",
    label: "Manual transcription steps",
    sub: "CAP / LSRA / ILSM populated from the source photo.",
    gold: false,
  },
];

export function LandingWorkflow() {
  return (
    <section
      id="workflow"
      style={{ background: "#f3efe3", padding: "96px 24px" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
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
          § 04 — Workflow
        </p>
        <h2
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontSize: "clamp(32px, 4vw, 56px)",
            lineHeight: 1.02,
            letterSpacing: "-0.01em",
            maxWidth: 800,
            margin: "0 0 48px 0",
            color: "#0f1518",
            textWrap: "balance",
          }}
        >
          Four steps from corridor to{" "}
          <em style={{ fontStyle: "italic", color: "#b8902f" }}>
            court-defensible
          </em>
          .
        </h2>

        <div style={{ position: "relative" }}>
          {/* Static baseline */}
          <div
            aria-hidden
            className="workflow-baseline"
            style={{
              position: "absolute",
              top: 28,
              left: "6%",
              right: "6%",
              height: 1,
              background: "#0f1518",
            }}
          />

          <div
            className="workflow-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 24,
              position: "relative",
            }}
          >
            {WORKFLOW.map(([title, body], i) => (
              <div key={title} style={{ background: "#f3efe3" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    marginBottom: 16,
                    background: "#f3efe3",
                    paddingRight: 8,
                  }}
                >
                  <span
                    style={{
                      width: 56,
                      height: 56,
                      border: "1px solid #0f1518",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#f3efe3",
                      fontFamily: "var(--font-instrument-serif)",
                      fontSize: 28,
                      color: "#0f1518",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontSize: 28,
                      color: "#0f1518",
                    }}
                  >
                    {title}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "#1a2226",
                    margin: 0,
                  }}
                >
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div
          className="stats-grid"
          style={{
            marginTop: 96,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
            borderTop: "1px solid #0f1518",
            borderBottom: "1px solid #0f1518",
          }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                padding: "32px 24px",
                borderRight: i < 3 ? "1px solid #0f1518" : "none",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif)",
                  fontSize: "clamp(48px, 5vw, 72px)",
                  lineHeight: 1,
                  color: s.gold ? "#b8902f" : "#0f1518",
                }}
              >
                <CountUp to={s.n} suffix={s.suffix} duration={1300 + i * 120} />
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  marginTop: 6,
                  color: "#0f1518",
                }}
              >
                {s.label}
              </span>
              <span style={{ fontSize: 12, color: "#5f6b72", lineHeight: 1.5 }}>
                {s.sub}
              </span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .workflow-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 32px !important; }
          .workflow-baseline { display: none !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .stats-grid > div:nth-child(2) { border-right: none !important; }
          .stats-grid > div:nth-child(1), .stats-grid > div:nth-child(2) { border-bottom: 1px solid #0f1518 !important; }
        }
        @media (max-width: 600px) {
          .workflow-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: 1fr !important; }
          .stats-grid > div { border-right: none !important; border-bottom: 1px solid #0f1518 !important; }
          .stats-grid > div:last-child { border-bottom: none !important; }
        }
      `}</style>
    </section>
  );
}
