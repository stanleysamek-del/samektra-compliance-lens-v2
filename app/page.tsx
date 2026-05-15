import { redirect } from "next/navigation";
import { getUserOrNullFast } from "@/lib/supabase/get-user-fast";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingTicker } from "@/components/landing/landing-ticker";
import { LandingCapabilities } from "@/components/landing/landing-capabilities";
import { LandingWorkflow } from "@/components/landing/landing-workflow";
import { LandingPlatforms } from "@/components/landing/landing-platforms";
import { LandingDashboardPreview } from "@/components/landing/landing-dashboard-preview";
import { LandingCodes } from "@/components/landing/landing-codes";
import { LandingReportMock } from "@/components/landing/landing-report-mock";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingFAQ } from "@/components/landing/landing-faq";
import { LandingFooter } from "@/components/landing/landing-footer";

/**
 * Editorial marketing site for compliancelens.app. Cream paper + ink +
 * gold-italic accent design system; serif (Instrument Serif) display,
 * Geist sans body, JetBrains Mono labels.
 *
 * Logged-in users are redirected straight to /inspections so they don't
 * have to scroll past marketing every time. Logged-out visitors see the
 * full editorial experience.
 *
 * Design tokens are scoped via inline styles on the root so this page's
 * cream palette doesn't bleed into the dark app chrome.
 */
export default async function Home() {
  const user = await getUserOrNullFast();
  if (user) redirect("/inspections");

  return (
    <div
      style={{
        background: "#ece8da",
        color: "#0f1518",
        fontFamily: "var(--font-geist-sans)",
        minHeight: "100dvh",
      }}
    >
      {/* Subtle paper grain across the whole site */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage:
            "radial-gradient(rgba(15,21,24,0.03) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
          pointerEvents: "none",
          zIndex: 1,
          opacity: 0.5,
        }}
      />

      {/* Section order matches screens.md `/` section spec. The interactive
          4-stage demo widget (§ 02) is deliberately omitted — it's a heavy
          stateful prototype; can be added as a focused follow-up. */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <LandingNav />
        <LandingHero />
        <LandingTicker />
        <LandingCapabilities />
        <LandingWorkflow />
        <LandingPlatforms />
        <LandingDashboardPreview />
        <LandingCodes />
        <LandingReportMock />
        <LandingPricing />
        <LandingFAQ />
        <LandingFooter />
      </div>

      {/* Selection styling — gold highlight, matching brand */}
      <style>{`
        ::selection { background: #c89b3c; color: #0f1518; }
      `}</style>
    </div>
  );
}
