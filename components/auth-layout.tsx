import Link from "next/link";
import type { PropsWithChildren } from "react";

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  /** Eyebrow above the title, in mono small caps. Defaults to "§ Sign in"
   *  style values based on the page; pass explicitly for clarity. */
  eyebrow?: string;
}>;

/**
 * Editorial cream-paper auth shell — used by login / signup / forgot /
 * reset pages. Deliberately distinct from the dark teal app chrome:
 * these are brand-forward marketing-adjacent moments, the rest of the
 * app is functional dark UI.
 *
 * Design tokens are scoped to this component via CSS variables on the
 * root so the editorial palette doesn't leak into the rest of the app.
 *
 * Spec source: design_handoff_compliance_lens (Compliance App Design.zip)
 *  - cream background (#ece8da), card paper-2 (#f3efe3)
 *  - 1px ink border, 0 border-radius — rectangular by intent
 *  - Instrument Serif display, JetBrains Mono labels, Geist body
 *  - Gold (#c89b3c) for italic accent + CTA
 *  - Underline-only form inputs (handled inside children)
 */
export function AuthLayout({ title, subtitle, eyebrow, children }: Props) {
  return (
    <div
      className="relative flex min-h-dvh flex-col"
      style={
        {
          // Scoped editorial palette — only inside the auth shell.
          "--ink": "#0f1518",
          "--ink-2": "#1a2226",
          "--paper": "#ece8da",
          "--paper-2": "#f3efe3",
          "--paper-3": "#d9d3c0",
          "--rule-paper": "#b9b39e",
          "--gold": "#c89b3c",
          "--gold-soft": "#b8902f",
          "--slate": "#5f6b72",
          background: "#ece8da",
          color: "#0f1518",
          fontFamily: "var(--font-geist-sans)",
        } as React.CSSProperties
      }
    >
      {/* Subtle paper grain — pure CSS, no image asset needed */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(15,21,24,0.04) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
          opacity: 0.6,
        }}
      />

      {/* ============== Top wordmark strip ============== */}
      <header className="relative z-10 flex h-14 items-center justify-between px-6 sm:px-10">
        <Link
          href="/"
          className="flex items-baseline gap-2"
          style={{ color: "#0f1518", textDecoration: "none" }}
        >
          <span
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#5f6b72",
            }}
          >
            Samektra
          </span>
          <span
            aria-hidden
            style={{ color: "#b9b39e", fontSize: 12 }}
          >
            ·
          </span>
          <span
            style={{
              fontFamily: "var(--font-instrument-serif)",
              fontSize: 18,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            Compliance{" "}
            <em
              style={{
                fontStyle: "italic",
                color: "#b8902f",
              }}
            >
              Lens
            </em>
          </span>
        </Link>
        <span
          style={{
            fontFamily: "var(--font-jetbrains-mono)",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#5f6b72",
          }}
        >
          v2
        </span>
      </header>

      {/* ============== Center card ============== */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-5 pb-16 pt-4 sm:px-8">
        <div className="auth-card-wrap w-full" style={{ maxWidth: 440 }}>
          <div
            className="auth-card"
            style={{
              background: "#f3efe3",
              border: "1px solid #0f1518",
              position: "relative",
            }}
          >
            {/* Eyebrow */}
            <div
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#5f6b72",
                marginBottom: 4,
              }}
            >
              {eyebrow ?? "§ Authentication"}
            </div>

            {/* Hairline under eyebrow */}
            <div
              aria-hidden
              style={{
                height: 1,
                background: "#0f1518",
                opacity: 0.85,
                marginBottom: 18,
                width: 32,
              }}
            />

            {/* Title — serif display, italic accent on the last word */}
            <h1
              style={{
                fontFamily: "var(--font-instrument-serif)",
                fontSize: 36,
                letterSpacing: "-0.01em",
                lineHeight: 1.05,
                color: "#0f1518",
                margin: 0,
                textWrap: "balance",
              }}
            >
              {title}
            </h1>

            {subtitle ? (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "#5f6b72",
                  textWrap: "pretty",
                }}
              >
                {subtitle}
              </p>
            ) : null}

            {/* Hairline divider between header block + form */}
            <div
              aria-hidden
              style={{
                height: 1,
                background: "#0f1518",
                opacity: 0.85,
                margin: "24px 0 20px",
              }}
            />

            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
