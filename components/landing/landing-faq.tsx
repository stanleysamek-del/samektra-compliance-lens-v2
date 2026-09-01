"use client";

import { useState } from "react";

/**
 * §09 FAQ — accordion. Stripped down editorial style: serif question,
 * mono Q.NN number, gold "+" toggle that rotates to "×" when open.
 */
/**
 * Honesty rule (2026-09-01 copy pass): every answer below is limited to
 * what the shipped product actually does. No invented certifications,
 * usage statistics, or partnership claims — a procurement reviewer WILL
 * check, and one falsifiable line poisons the true ones.
 */
const FAQ_ITEMS = [
  {
    q: "Is Compliance Lens a replacement for a certified inspector?",
    a: "No. Compliance Lens is a force-multiplier for licensed inspectors — CFPS, CHFM, CHSP, and AHJ-recognized officers. Every finding is reviewed and signed by the human inspector before export. The tool removes transcription, citation lookup, and report assembly — not professional judgment.",
  },
  {
    q: "Which photo conditions does the model handle?",
    a: "Any reasonably lit photo from a modern phone or camera. The model degrades gracefully in poor light — findings come back with reduced confidence, and you can re-run any photo with a deeper analysis or coach the AI with context it couldn't see. JPEG and PNG accepted; photos are resized to 1024px for analysis.",
  },
  {
    q: "How do you handle photos taken in patient-occupied areas?",
    a: "Photos are stored in a private bucket, never public — every image is served through short-lived signed URLs, scoped to your account or team. Our guidance for healthcare users is the same as for any EOC round: frame the condition, not the patient. Formal compliance attestations (BAA, SOC 2) are on the roadmap and we'll state them here only when they're real.",
  },
  {
    q: "Can I add a state or local code that isn't on your list?",
    a: "Tell us which jurisdiction and we'll be straight with you about timeline. Georgia Title 25 is already covered alongside the national codebases. You can also teach the AI your own house rules today — 'Teach Chip this' turns a correction into a permanent org rule applied to every future analysis.",
  },
  {
    q: "Will my AHJ accept the signed PDF?",
    a: "The PDF is built to be defensible: chain-of-custody hash captured from the original photo file, embedded photos with findings marked, cited code sections, severity, the corrective-action trail, and a sign-off page with inspector and manager signatures. Acceptance is always the AHJ's call — which is true of any report format — but everything they'd ask for is in there.",
  },
  {
    q: "What if the AI is wrong?",
    a: "Every finding is editable — severity, code citation, bounding box, and remediation — and you can delete a wrong call outright. Thumbs-down feedback and 'Coach the AI' corrections feed the next analysis, and org-level learned rules make it permanent. A model-confidence score travels with every finding so you know which calls to double-check.",
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
              § 09 — Questions
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
