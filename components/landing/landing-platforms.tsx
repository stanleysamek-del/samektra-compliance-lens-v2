/**
 * §04½ Platforms — three platforms (iPhone field app, iPad reviewer,
 * Web command center) on an ink background. Each card has an abstract
 * mock viewport rather than a realistic device-frame illustration —
 * keeps server-rendering simple while still conveying the value prop.
 */
const PLATFORMS = [
  {
    name: "iPhone",
    badge: "FIELD",
    title: "In the corridor.",
    body: "Snap with one hand. Photos auto-tag location and time. Findings appear before you reach the next door.",
  },
  {
    name: "iPad",
    badge: "REVIEW",
    title: "On the bench.",
    body: "Review the inspection at full size. Tighten bounding boxes, swap citations, sign with a pencil. Built for the survey room.",
  },
  {
    name: "Web",
    badge: "COMMAND",
    title: "At the desk.",
    body: "Every walk-through, every signed report, every CAP entry. Multi-user, role-aware, and audit-ready.",
  },
];

export function LandingPlatforms() {
  return (
    <section
      id="platforms"
      style={{
        background: "#1a2226",
        color: "#ece8da",
        padding: "96px 24px",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 56 }}>
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
            § 04½ — Platforms
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
              maxWidth: 900,
            }}
          >
            Same inspection,{" "}
            <em style={{ fontStyle: "italic", color: "#c89b3c" }}>
              three surfaces.
            </em>
          </h2>
        </div>

        <div
          className="platforms-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 0,
            border: "1px solid rgba(236,232,218,0.25)",
          }}
        >
          {PLATFORMS.map((p, i) => (
            <div
              key={p.name}
              style={{
                padding: "32px 28px",
                borderRight:
                  i < PLATFORMS.length - 1
                    ? "1px solid rgba(236,232,218,0.12)"
                    : "none",
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontSize: 32,
                    color: "#ece8da",
                  }}
                >
                  {p.name}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    color: "#c89b3c",
                  }}
                >
                  {p.badge}
                </span>
              </div>

              {/* Abstract preview viewport — varies aspect ratio per platform */}
              <PlatformViewport name={p.name} />

              <div>
                <p
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontSize: 22,
                    lineHeight: 1.2,
                    margin: 0,
                    color: "#ece8da",
                  }}
                >
                  {p.title}
                </p>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "#8a9097",
                    marginTop: 8,
                    marginBottom: 0,
                  }}
                >
                  {p.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .platforms-grid { grid-template-columns: 1fr !important; }
          .platforms-grid > div { border-right: none !important; border-bottom: 1px solid rgba(236,232,218,0.12) !important; }
          .platforms-grid > div:last-child { border-bottom: none !important; }
        }
      `}</style>
    </section>
  );
}

/**
 * Per-platform abstract viewport. iPhone = 9:16, iPad = 4:3, Web = 16:9.
 * No device frame; just an ink panel with a faint photo placeholder and
 * a single colored bbox to imply "AI flagged a finding here".
 */
function PlatformViewport({ name }: { name: string }) {
  const aspect =
    name === "iPhone" ? "9 / 16" : name === "iPad" ? "4 / 3" : "16 / 9";
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: aspect,
        width: "100%",
        maxWidth: name === "iPhone" ? 180 : "100%",
        background:
          "linear-gradient(135deg, #0f1518 0%, #2a363c 50%, #0f1518 100%)",
        border: "1px solid rgba(236,232,218,0.18)",
        overflow: "hidden",
      }}
    >
      {/* Top status strip */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          right: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--font-jetbrains-mono)",
          fontSize: 8,
          letterSpacing: "0.14em",
          color: "#8a9097",
        }}
      >
        <span>CAPTURE · LIVE</span>
        <span style={{ color: "#c89b3c" }}>0.94</span>
      </div>

      {/* Bbox callout — positioned roughly center */}
      <div
        style={{
          position: "absolute",
          top: "32%",
          left: "22%",
          width: "44%",
          height: "32%",
          border: "1.5px solid #ef4d3f",
          boxShadow: "0 0 0 1px rgba(239,77,63,0.25)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: -14,
            left: -1,
            background: "#ef4d3f",
            color: "#0f1518",
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 7,
            letterSpacing: "0.14em",
            padding: "1px 4px",
            textTransform: "uppercase",
          }}
        >
          High · NFPA 101
        </span>
      </div>

      {/* Bottom finding bar */}
      <div
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 7,
            letterSpacing: "0.14em",
            color: "#c89b3c",
            textTransform: "uppercase",
          }}
        >
          NFPA 101 §7.1.10.1
        </span>
        <div
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontSize: 11,
            color: "#ece8da",
            marginTop: 2,
            lineHeight: 1.2,
          }}
        >
          Egress obstructed
        </div>
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
  );
}
