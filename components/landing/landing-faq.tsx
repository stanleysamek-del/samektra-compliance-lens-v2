"use client";

import { useState } from "react";

/**
 * §08 FAQ — accordion. Stripped down editorial style: serif question,
 * mono Q.NN number, gold "+" toggle that rotates to "×" when open.
 */
const FAQ_ITEMS = [
  {
    q: "Is Compliance Lens a replacement for a certified inspector?",
    a: "No. Compliance Lens is a force-multiplier for licensed inspectors — CFPS, CHFM, CHSP, and AHJ-recognized officers. Every finding is reviewed and signed by the human inspector before export. The tool removes transcription, citation lookup, and report assembly — not professional judgment.",
  },
  {
    q: "Which photo conditions does the model handle?",
    a: "iPhone 12 or newer, daylight or facility lighting (≥30 fc). The model degrades gracefully in low light — findings are returned with reduced confidence and flagged for re-capture. HEIC, JPEG, and PNG accepted up to 48 MP.",
  },
  {
    q: "How do you handle PHI in patient-occupied photos?",
    a: "All processing happens in a HIPAA-aligned, BAA-covered environment. Faces and visible PHI are auto-redacted in exported reports by default; raw images are encrypted at rest with per-tenant keys. SOC 2 Type II report available under NDA.",
  },
  {
    q: "Can I add a state or local code that isn't on your list?",
    a: "Yes. Onboarding a new codebase takes about a week for jurisdictions with a published, structured code. We've added Georgia Title 25, several California Title 24 sections, and city-level fire-marshal supplements on customer request. Email codes@compliancelens.app.",
  },
  {
    q: "Will my AHJ accept the signed PDF?",
    a: "Yes — that's the goal. The PDF includes chain-of-custody hash, original photos, cited code text, severity, CAP entries, and signatures. We work directly with state fire marshal offices and TJC tracer surveyors to keep templates aligned to current submission requirements.",
  },
  {
    q: "What if the AI is wrong?",
    a: "Every finding is editable — severity, code citation, bounding box, and remediation. Dismissals require a documented reason and become part of the audit trail. A model-confidence score travels with every finding. In 14 months of customer use, override rates have averaged 6.4%.",
  },
];

export function LandingFAQ() {
  const [openIdx, setOpenIdx] = useState<number>(0);

  return (
    <section
      id="faq"
      style={{ background: "#f3efe3", padding: "96px 24px" }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div
          className="faq-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: 64,
            alignItems: "start",
          }}
        >
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
              § 08 — Questions
            </p>
            <h2
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: "clamp(36px, 4.6vw, 60px)",
                lineHeight: 1.02,
                letterSpacing: "-0.01em",
                margin: 0,
                color: "#0f1518",
                textWrap: "balance",
              }}
            >
              What inspectors ask first.
            </h2>
            <p
              style={{
                marginTop: 24,
                fontSize: 15,
                lineHeight: 1.6,
                color: "#5f6b72",
                maxWidth: 320,
              }}
            >
              Don&apos;t see your question? Email us at{" "}
              <span style={{ color: "#b8902f" }}>hello@compliancelens.app</span>
              . A real person responds, usually within the same business day.
            </p>
          </div>

          <div>
            {FAQ_ITEMS.map((item, i) => {
              const isOpen = openIdx === i;
              return (
                <div
                  key={item.q}
                  style={{
                    borderTop: "1px solid #0f1518",
                    borderBottom:
                      i === FAQ_ITEMS.length - 1 ? "1px solid #0f1518" : "none",
                  }}
                >
                  <button
                    onClick={() => setOpenIdx(isOpen ? -1 : i)}
                    style={{
                      width: "100%",
                      padding: "24px 0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 24,
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "#0f1518",
                    }}
                    aria-expanded={isOpen}
                  >
                    <span style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-jetbrains-mono)",
                          fontSize: 11,
                          color: "#5f6b72",
                          letterSpacing: "0.14em",
                        }}
                      >
                        Q.{String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-instrument-serif)",
                          fontSize: 22,
                          lineHeight: 1.2,
                          color: "#0f1518",
                        }}
                      >
                        {item.q}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      style={{
                        fontFamily: "var(--font-jetbrains-mono)",
                        fontSize: 18,
                        color: "#b8902f",
                        flexShrink: 0,
                        marginTop: 6,
                        transform: isOpen ? "rotate(45deg)" : "rotate(0)",
                        transition: "transform .2s ease",
                      }}
                    >
                      +
                    </span>
                  </button>
                  <div
                    style={{
                      maxHeight: isOpen ? 500 : 0,
                      overflow: "hidden",
                      transition: "max-height .35s ease",
                    }}
                  >
                    <p
                      style={{
                        padding: "0 0 28px 60px",
                        fontSize: 15,
                        lineHeight: 1.65,
                        color: "#1a2226",
                        maxWidth: 700,
                        textWrap: "pretty",
                        margin: 0,
                      }}
                    >
                      {item.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .faq-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        }
      `}</style>
    </section>
  );
}
