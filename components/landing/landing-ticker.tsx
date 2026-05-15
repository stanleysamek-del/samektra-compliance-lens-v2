/**
 * Citation marquee — horizontal scrolling strip of code references.
 * Sits between hero and capabilities to add motion + reinforce the
 * "we read codes" pitch. Pure CSS animation, no JS.
 *
 * Render the citation list twice in the inner track so the keyframe
 * loop is seamless: translate from 0 to -50% takes exactly one list
 * width, then snaps back invisibly.
 */
const CITATIONS = [
  ["NFPA 101", "§7.1.10.1", "Means of egress obstructed"],
  ["NFPA 99", "§6.3.2.2", "Medical gas labeling"],
  ["IBC", "§1010.1.2", "Door operation"],
  ["NEC", "§110.26(A)", "Working clearance"],
  ["NFPA 10", "§6.1.3.3", "Extinguisher access"],
  ["CMS", "§482.41(b)", "Life safety from fire"],
  ["ADA", "§609.3", "Grab bar height"],
  ["NFPA 80", "§5.2.1", "Fire door clearance"],
  ["IFC", "§1031.2", "Maintenance of egress"],
  ["TJC", "EC.02.03.05", "Fire safety equipment"],
  ["ANSI A117.1", "§308", "Reach ranges"],
  ["NFPA 101", "§19.3.6.1", "Smoke compartmentation"],
];

export function LandingTicker() {
  // Each citation rendered as a single inline-flex chunk for the marquee.
  const chunk = (idx: number) =>
    CITATIONS.map((c, i) => (
      <span
        key={`${idx}-${i}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          whiteSpace: "nowrap",
          marginRight: 42,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 11,
            color: "#b8902f",
            letterSpacing: "0.08em",
          }}
        >
          {c[0]}
        </span>
        <span
          style={{
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 11,
            color: "#5f6b72",
            letterSpacing: "0.04em",
          }}
        >
          {c[1]}
        </span>
        <span
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontSize: 18,
            color: "#0f1518",
          }}
        >
          {c[2]}
        </span>
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#0f1518",
            opacity: 0.4,
            marginLeft: 6,
          }}
        />
      </span>
    ));

  return (
    <section
      aria-hidden
      style={{
        background: "#f3efe3",
        borderTop: "1px solid #0f1518",
        borderBottom: "1px solid #0f1518",
        padding: "14px 0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          width: "max-content",
          animation: "cl-ticker 60s linear infinite",
        }}
        className="cl-ticker-track"
      >
        {/* Render the list twice so the -50% translate loops seamlessly */}
        {chunk(0)}
        {chunk(1)}
      </div>
      <style>{`
        @keyframes cl-ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .cl-ticker-track:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .cl-ticker-track { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
