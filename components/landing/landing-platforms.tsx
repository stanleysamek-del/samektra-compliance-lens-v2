"use client";

import Image from "next/image";
import { useState, useEffect } from "react";

/**
 * §04 Platforms — interactive showcase of the three surfaces.
 * Uses the REAL product screenshots (same assets as the hero) and keeps
 * the hero's interactions: clickable iPhone / iPad / Web buttons that
 * swap the device, plus the rotating "Auto-cited" note stamp.
 */

type Device = "iphone" | "ipad" | "web";

const PLATFORMS: {
  id: Device;
  name: string;
  badge: string;
  glyph: string;
  title: string;
  body: string;
  src: string;
  alt: string;
  w: number;
  h: number;
  frame: { maxHeight: number; maxWidth: string };
}[] = [
  {
    id: "iphone",
    name: "iPhone",
    badge: "FIELD",
    glyph: "◧",
    title: "In the corridor.",
    body: "Snap with one hand. Photos auto-tag location and time. Findings appear before you reach the next door.",
    src: "/hero-iphone.png",
    alt: "Compliance Lens on iPhone",
    w: 640,
    h: 1294,
    frame: { maxHeight: 460, maxWidth: "100%" },
  },
  {
    id: "ipad",
    name: "iPad",
    badge: "REVIEW",
    glyph: "▭",
    title: "On the bench.",
    body: "Review the inspection at full size. Tighten bounding boxes, swap citations, sign with a pencil. Built for the survey room.",
    src: "/hero-ipad.png",
    alt: "Compliance Lens on iPad",
    w: 1212,
    h: 1001,
    frame: { maxHeight: 440, maxWidth: "100%" },
  },
  {
    id: "web",
    name: "Web",
    badge: "COMMAND",
    glyph: "⊞",
    title: "At the desk.",
    body: "Every walk-through, every signed report, every CAP entry. Multi-user, role-aware, and audit-ready.",
    src: "/hero-Mac.png",
    alt: "Compliance Lens on the web",
    w: 1341,
    h: 956,
    frame: { maxHeight: 440, maxWidth: "100%" },
  },
];

const STAMP_QUOTES = [
  "Photos in. Citations out. Reports done.",
  "From finding to finished report. In minutes.",
  "The finding is documented before the dust settles.",
  "Inspection evidence that speaks for itself.",
];

export function LandingPlatforms() {
  const [device, setDevice] = useState<Device>("iphone");
  const active = PLATFORMS.find((p) => p.id === device)!;

  // Rotating note
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % STAMP_QUOTES.length);
        setVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="platforms"
      style={{ background: "#1a2226", color: "#ece8da", padding: "96px 24px" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
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
            § 04 — Platforms
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

        {/* Device switch buttons */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 32 }}>
          {PLATFORMS.map((p) => {
            const on = device === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setDevice(p.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 16px",
                  border: `1px solid ${on ? "#c89b3c" : "rgba(236,232,218,0.3)"}`,
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  background: on ? "#c89b3c" : "transparent",
                  color: on ? "#0f1518" : "#ece8da",
                  transition: "background .18s ease, color .18s ease, border-color .18s ease",
                }}
              >
                <span style={{ color: on ? "#0f1518" : "#c89b3c" }}>{p.glyph}</span>
                {p.name}
                <span style={{ opacity: 0.6, fontSize: 9 }}>{p.badge}</span>
              </button>
            );
          })}
        </div>

        {/* Viewer + copy */}
        <div
          className="platforms-stage"
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr",
            gap: 48,
            alignItems: "center",
            border: "1px solid rgba(236,232,218,0.25)",
            padding: "40px",
          }}
        >
          {/* Device viewport */}
          <div
            className="platforms-viewport"
            style={{
              position: "relative",
              height: 480,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              key={active.id}
              src={active.src}
              alt={active.alt}
              width={active.w}
              height={active.h}
              priority
              sizes="(max-width: 900px) 80vw, 640px"
              style={{
                height: "auto",
                width: "auto",
                objectFit: "contain",
                filter: "drop-shadow(0 28px 40px rgba(0,0,0,0.45))",
                animation: "platform-fade .4s ease",
                ...active.frame,
              }}
            />

            {/* Rotating note stamp */}
            <div
              className="platforms-stamp"
              style={{
                position: "absolute",
                bottom: 16,
                left: 0,
                background: "#ece8da",
                color: "#0f1518",
                border: "1px solid #0f1518",
                padding: "12px 14px",
                maxWidth: 240,
                boxShadow: "0 12px 24px -16px rgba(0,0,0,0.5)",
                zIndex: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-jetbrains-mono)",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#b8902f",
                }}
              >
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
                  transition: "opacity .35s ease",
                  minHeight: "3.2em",
                }}
              >
                &ldquo;{STAMP_QUOTES[idx]}&rdquo;
              </p>
            </div>
          </div>

          {/* Selected platform copy */}
          <div>
            <span
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#c89b3c",
              }}
            >
              {active.name} · {active.badge}
            </span>
            <p
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 34,
                lineHeight: 1.1,
                margin: "12px 0 14px",
                color: "#ece8da",
              }}
            >
              {active.title}
            </p>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: "#8a9097",
                margin: 0,
                maxWidth: 360,
              }}
            >
              {active.body}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes platform-fade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 900px) {
          .platforms-stage { grid-template-columns: 1fr !important; gap: 28px !important; padding: 24px !important; }
          .platforms-viewport { height: 360px !important; }
        }
        @media (max-width: 600px) {
          .platforms-stamp { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .platforms-viewport :global(img) { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
