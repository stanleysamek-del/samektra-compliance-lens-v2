"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Sticky editorial nav for the landing page. Transparent at top, then
 * gains a paper-tinted blur background when scrolled. Mono nav links,
 * serif wordmark, "by Samektra" badge, gold-italic Create account CTA.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: scrolled ? "rgba(236,232,218,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(8px) saturate(120%)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(8px) saturate(120%)" : "none",
        borderBottom: scrolled ? "1px solid #b9b39e" : "1px solid transparent",
        transition: "background .2s ease, border-color .2s ease",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        {/* Wordmark + Samektra badge */}
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            color: "#0f1518",
            textDecoration: "none",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: 22,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            Compliance{" "}
            <em style={{ fontStyle: "italic", color: "#b8902f" }}>Lens</em>
          </span>
          <span
            className="hide-on-mobile-nav"
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#5f6b72",
              padding: "4px 8px",
              border: "1px solid #b9b39e",
            }}
          >
            by Samektra
          </span>
        </Link>

        {/* Center nav links (desktop) */}
        <nav className="landing-nav-links" style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {[
            ["Workflow", "#workflow"],
            ["Capabilities", "#capabilities"],
            ["Codes", "#codes"],
            ["Pricing", "#pricing"],
            ["FAQ", "#faq"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#0f1518",
                opacity: 0.8,
                textDecoration: "none",
                transition: "opacity .15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Auth CTAs */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/login"
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#0f1518",
              padding: "10px 0",
              textDecoration: "none",
            }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 18px",
              background: "#0f1518",
              color: "#ece8da",
              fontFamily: "var(--font-geist-sans)",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid #0f1518",
              textDecoration: "none",
              transition: "background .15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#1a2226")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#0f1518")}
          >
            Create account
            <span
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontStyle: "italic",
                color: "#c89b3c",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              →
            </span>
          </Link>
        </div>
      </div>

      {/* Responsive: hide center nav links < 800px */}
      <style>{`
        @media (max-width: 800px) {
          .landing-nav-links { display: none !important; }
          .hide-on-mobile-nav { display: none !important; }
        }
      `}</style>
    </header>
  );
}
