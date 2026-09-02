"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";

type Device = "iphone" | "ipad" | "web";

const DEVICES: { id: Device; label: string; glyph: string }[] = [
  { id: "iphone", label: "iPhone", glyph: "◧" },
  { id: "ipad",   label: "iPad",   glyph: "▭" },
  { id: "web",    label: "Web",    glyph: "⊞" },
];

// Auto-cited stamp — rotates every 3.5s with a fade
const STAMP_QUOTES = [
  "Photos in. Citations out. Reports done.",
  "From finding to finished report. In minutes.",
  "The finding is documented before the dust settles.",
  "Inspection evidence that speaks for itself.",
];

export function LandingHero() {
  const [device, setDevice] = useState<Device>("iphone");

  const today = new Date();
  const dateStr = `${String(today.getMonth() + 1).padStart(2, "0")} / ${String(
    today.getDate(),
  ).padStart(2, "0")} / ${today.getFullYear()}`;

  return (
    <section
      className="hero-section"
      style={{ position: "relative", padding: "32px 24px 80px" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <article
          className="hero-card"
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
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
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
            <div className="hero-meta-right" style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#5f6b72",
                }}
              >
                File №&nbsp;&nbsp;CL-2026-481
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
                Issued&nbsp;&nbsp;{dateStr}
              </span>
            </div>
          </div>

          <div
            aria-hidden
            className="hero-rule"
            style={{ height: 1, background: "#0f1518", opacity: 0.85, marginBottom: 48 }}
          />

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
                className="hero-eyebrow"
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
                className="hero-h1"
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
                <em style={{ fontStyle: "italic", color: "#b8902f" }}>pocket.</em>
              </h1>
              <p
                className="hero-body"
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

              {/* Interactive platform pills */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
                {DEVICES.map(({ id, label, glyph }) => {
                  const active = device === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setDevice(id)}
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
                        cursor: "pointer",
                        background: active ? "#0f1518" : "transparent",
                        color: active ? "#ece8da" : "#0f1518",
                        transition: "background 0.18s ease, color 0.18s ease",
                      }}
                    >
                      <span style={{ color: active ? "#c89b3c" : "#b8902f" }}>{glyph}</span>
                      {label}
                    </button>
                  );
                })}
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
                  <span style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", color: "#c89b3c", fontSize: 18, lineHeight: 1 }}>→</span>
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
                  <span style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", color: "#b8902f", fontSize: 18, lineHeight: 1 }}>↓</span>
                </a>
              </div>

              {/* Signature block */}
              <div className="hero-signature" style={{ display: "flex", gap: 32, flexWrap: "wrap", marginTop: 40 }}>
                {[
                  ["Inspector", "M. Reyes, CFPS", true],
                  ["Facility", "St. Anselm Reg'l Hosp.", false],
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
                        fontFamily: italic ? "var(--font-instrument-serif)" : "var(--font-jetbrains-mono)",
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

            {/* Right: device preview — fixed height so switching devices never resizes the hero */}
            <div
              className="hero-preview-wrap"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                height: 520,
              }}
            >
              <HeroPreviewCard device={device} />
            </div>
          </div>

          {/* Codebase coverage strip */}
          <div aria-hidden style={{ height: 1, background: "#0f1518", opacity: 0.85, marginTop: 56, marginBottom: 20 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <span style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#5f6b72" }}>
              Codebase coverage
            </span>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              {["NFPA 101", "NFPA 99", "NFPA 10", "IBC", "IFC", "NEC", "CMS", "TJC", "ADA", "ANSI A117.1", "CDC / HAI", "GA Title 25"].map((c) => (
                <span key={c} style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 11, letterSpacing: "0.08em", color: "#0f1518" }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </article>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .hero-preview-wrap { height: 380px !important; }
        }
        @media (max-width: 600px) {
          .hero-meta-right { display: none !important; }
          .hero-signature { display: none !important; }
          /* Phone compaction — the desktop scale reads "elongated" on a
             375-430px screen: tighter card, smaller serif, denser rhythm. */
          .hero-section { padding: 16px 14px 48px !important; }
          .hero-card { padding: 24px 18px 24px !important; box-shadow: 10px 10px 0 -8px #d9d3c0 !important; }
          .hero-rule { margin-bottom: 24px !important; }
          .hero-eyebrow { margin-bottom: 12px !important; }
          .hero-h1 { font-size: clamp(30px, 8.6vw, 38px) !important; margin-bottom: 14px !important; }
          .hero-body { font-size: 15px !important; margin-bottom: 20px !important; }
          .hero-grid { gap: 28px !important; }
        }
      `}</style>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Device preview card
// ---------------------------------------------------------------------------

function HeroPreviewCard({ device }: { device: Device }) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // fade out → swap → fade in
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % STAMP_QUOTES.length);
        setVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <DeviceMockup device={device} />

      {/* Floating stamp — rotates through professional outcome quotes */}
      <div
        className="hero-float-stamp"
        style={{
          position: "absolute",
          bottom: 24,
          left: device === "iphone" ? -40 : -24,
          background: "#ece8da",
          color: "#0f1518",
          border: "1px solid #0f1518",
          padding: "12px 14px",
          maxWidth: 240,
          boxShadow: "0 12px 24px -16px rgba(0,0,0,0.3)",
          zIndex: 10,
        }}
      >
        <span style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#b8902f" }}>
          Auto-cited ✓
        </span>
        <p
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontStyle: "italic",
            fontSize: 15,
            margin: "4px 0 0",
            lineHeight: 1.3,
            color: "#0f1518",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.35s ease",
            minHeight: "3.2em", // reserve space for the longest quote, minimal gap
          }}
        >
          &ldquo;{STAMP_QUOTES[idx]}&rdquo;
        </p>
      </div>

      <style>{`
        @media (max-width: 600px) { .hero-float-stamp { display: none !important; } }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device mockup frames
// ---------------------------------------------------------------------------

function DeviceMockup({ device }: { device: Device }) {
  const shadow = "drop-shadow(0 24px 36px rgba(15,21,24,0.2))";

  if (device === "iphone") {
    return (
      <div style={{ filter: shadow, transition: "all 0.3s ease", maxHeight: "100%", display: "flex" }}>
        <Image
          src="/hero-iphone.png"
          alt="Compliance Lens on iPhone"
          width={640}
          height={1294}
          priority
          sizes="(max-width: 900px) 220px, 280px"
          style={{ display: "block", height: "100%", maxHeight: 500, width: "auto", objectFit: "contain" }}
        />
      </div>
    );
  }

  if (device === "ipad") {
    return (
      <div style={{ filter: shadow, transition: "all 0.3s ease", width: "100%", maxWidth: 520 }}>
        <Image
          src="/hero-ipad.png"
          alt="Compliance Lens on iPad"
          width={1212}
          height={1001}
          sizes="(max-width: 900px) 320px, 520px"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>
    );
  }

  // Web / Mac
  return (
    <div style={{ filter: shadow, transition: "all 0.3s ease", width: "100%", maxWidth: 520 }}>
      <Image
        src="/hero-Mac.png"
        alt="Compliance Lens on Mac"
        width={1341}
        height={956}
        sizes="(max-width: 900px) 320px, 520px"
        style={{ display: "block", width: "100%", height: "auto" }}
      />
    </div>
  );
}
