"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

type Device = "iphone" | "ipad" | "web";

const DEVICES: { id: Device; label: string; glyph: string }[] = [
  { id: "iphone", label: "iPhone", glyph: "◧" },
  { id: "ipad",   label: "iPad",   glyph: "▭" },
  { id: "web",    label: "Web",    glyph: "⊞" },
];

// Auto-cited stamp copy — professional, outcome-focused
const STAMP_COPY = "“Finding cited. Report filed. 4 minutes.”";

export function LandingHero() {
  const [device, setDevice] = useState<Device>("iphone");

  const today = new Date();
  const dateStr = `${String(today.getMonth() + 1).padStart(2, "0")} / ${String(
    today.getDate(),
  ).padStart(2, "0")} / ${today.getFullYear()}`;

  return (
    <section style={{ position: "relative", padding: "32px 24px 80px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <article
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
                Issued&nbsp;&nbsp;{dateStr}
              </span>
            </div>
          </div>

          <div aria-hidden style={{ height: 1, background: "#0f1518", opacity: 0.85, marginBottom: 48 }} />

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

            {/* Right: device preview */}
            <div
              className="hero-preview-wrap"
              style={{
                display: "flex",
                justifyContent: "center",
                position: "relative",
                minHeight: 480,
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
              {["NFPA 101", "NFPA 99", "IBC", "IFC", "NEC", "CMS", "TJC", "ADA", "ANSI A117.1", "GA Title 25"].map((c) => (
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
          .hero-preview-wrap { min-height: 360px !important; }
        }
        @media (max-width: 600px) {
          .hero-meta-right { display: none !important; }
          .hero-signature { display: none !important; }
        }
      `}</style>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Device preview card
// ---------------------------------------------------------------------------

function HeroPreviewCard({ device }: { device: Device }) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: device === "web" ? 480 : device === "ipad" ? 420 : 360 }}>
      <DeviceMockup device={device} />

      {/* Floating stamp — professional outcome copy */}
      <div
        className="hero-float-stamp"
        style={{
          position: "absolute",
          bottom: device === "web" ? 32 : -8,
          left: device === "web" ? -24 : -40,
          background: "#ece8da",
          color: "#0f1518",
          border: "1px solid #0f1518",
          padding: "12px 14px",
          maxWidth: 220,
          boxShadow: "0 12px 24px -16px rgba(0,0,0,0.3)",
          zIndex: 10,
        }}
      >
        <span style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#b8902f" }}>
          Auto-cited ✓
        </span>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: 15, margin: "4px 0 0", lineHeight: 1.3, color: "#0f1518" }}>
          {STAMP_COPY}
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
  if (device === "iphone") {
    return (
      <div style={{ position: "relative", transition: "opacity 0.25s ease", filter: "drop-shadow(0 28px 40px rgba(15,21,24,0.18))" }}>
        <Image
          src="/hero-iphone.png"
          alt="Compliance Lens on iPhone — AI-detected compliance findings overlaid on a site photo"
          width={720}
          height={1480}
          priority
          sizes="(max-width: 900px) 280px, 360px"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>
    );
  }

  if (device === "ipad") {
    // iPad frame drawn in CSS — same screenshot scaled/letterboxed inside
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          filter: "drop-shadow(0 28px 40px rgba(15,21,24,0.18))",
          transition: "opacity 0.25s ease",
        }}
      >
        {/* iPad body */}
        <div
          style={{
            background: "#1a1a1f",
            borderRadius: 20,
            border: "2px solid #2a2a32",
            padding: "18px 12px",
            position: "relative",
          }}
        >
          {/* Home bar top */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3a3a44" }} />
          </div>
          {/* Screen */}
          <div
            style={{
              background: "#0a0d12",
              borderRadius: 10,
              overflow: "hidden",
              position: "relative",
              aspectRatio: "4/3",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
            }}
          >
            <Image
              src="/hero-iphone.png"
              alt="Compliance Lens on iPad"
              width={720}
              height={1480}
              sizes="420px"
              style={{
                height: "100%",
                width: "auto",
                display: "block",
                objectFit: "cover",
                objectPosition: "top",
              }}
            />
            {/* iPad UI chrome overlay — split-view hint */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(90deg, transparent 55%, rgba(10,13,18,0.85) 55%)",
                display: "flex",
                alignItems: "stretch",
              }}
            >
              {/* Right panel — inspection list sidebar */}
              <div style={{ marginLeft: "55%", flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 8, letterSpacing: "0.14em", color: "#5f6b72", textTransform: "uppercase", margin: 0 }}>Inspections</p>
                {[
                  ["Gwinnett Med.", "In Progress", "#c89b3c"],
                  ["St. Anselm Hosp.", "Finalized", "#607a3a"],
                  ["Northside Campus", "Draft", "#5f6b72"],
                ].map(([name, status, color]) => (
                  <div key={name} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "8px 10px", borderRadius: 4 }}>
                    <p style={{ fontFamily: "var(--font-geist-sans)", fontSize: 10, color: "#ece8da", margin: "0 0 3px" }}>{name}</p>
                    <p style={{ fontFamily: "var(--font-jetbrains-mono)", fontSize: 8, color: color as string, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>{status}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Home indicator */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#3a3a44" }} />
          </div>
        </div>
      </div>
    );
  }

  // Web / browser chrome
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        filter: "drop-shadow(0 28px 40px rgba(15,21,24,0.18))",
        transition: "opacity 0.25s ease",
      }}
    >
      {/* Browser window */}
      <div style={{ background: "#1a1a1f", borderRadius: 10, border: "2px solid #2a2a32", overflow: "hidden" }}>
        {/* Title bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: "1px solid #2a2a32", background: "#141418" }}>
          {/* Traffic lights */}
          {["#e05252","#e09a2a","#4caf50"].map((c) => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
          ))}
          {/* Address bar */}
          <div
            style={{
              flex: 1,
              marginLeft: 8,
              background: "#0a0d12",
              borderRadius: 4,
              padding: "4px 10px",
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 9,
              color: "#5f6b72",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ color: "#607a3a", fontSize: 8 }}>🔒</span>
            compliancelens.app/inspections
          </div>
        </div>
        {/* Screen content */}
        <div style={{ position: "relative", aspectRatio: "16/10", overflow: "hidden", background: "#0a0d12" }}>
          <Image
            src="/hero-iphone.png"
            alt="Compliance Lens on desktop browser"
            width={720}
            height={1480}
            sizes="480px"
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              height: "130%",
              width: "auto",
              objectFit: "cover",
              objectPosition: "top center",
            }}
          />
          {/* Desktop sidebar overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, rgba(10,13,18,0.92) 200px, transparent 200px)",
              display: "flex",
            }}
          >
            <div style={{ width: 200, padding: "14px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
              <p style={{ fontFamily: "var(--font-geist-sans)", fontSize: 11, fontWeight: 600, color: "#ece8da", margin: "0 0 12px", letterSpacing: "0.02em" }}>
                Compliance <span style={{ color: "#c89b3c" }}>Lens</span>
              </p>
              {[
                ["🏠", "Dashboard"],
                ["📋", "Inspections"],
                ["🔍", "Findings"],
                ["👥", "Team"],
                ["📊", "Reports"],
              ].map(([icon, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 4, background: label === "Inspections" ? "rgba(200,155,60,0.12)" : "transparent" }}>
                  <span style={{ fontSize: 10 }}>{icon}</span>
                  <span style={{ fontFamily: "var(--font-geist-sans)", fontSize: 10, color: label === "Inspections" ? "#c89b3c" : "#8a9097" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
