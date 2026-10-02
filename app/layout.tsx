import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceStatusBanner } from "@/components/service-status-banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial type for the auth screens. Instrument Serif is the display
// face, JetBrains Mono provides eyebrows + metadata labels. Both are
// scoped to AuthLayout via CSS variables so they don't pollute the app
// chrome.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://compliancelens.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Compliance Lens by Samektra",
    template: "%s · Compliance Lens",
  },
  description:
    "AI-powered code compliance inspection — NFPA, IBC, IFC, NEC, CMS, The Joint Commission, ADA, ANSI, and Georgia Title 25. Walk a building, snap photos, generate CAP, LSRA, ILSM, and a signed PDF report.",
  applicationName: "Compliance Lens",
  authors: [{ name: "Samektra" }],
  keywords: ["compliance", "code inspection", "NFPA", "IBC", "IFC", "NEC", "Joint Commission", "life safety", "ADA", "Samektra"],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Compliance Lens",
    title: "Compliance Lens by Samektra",
    description: "AI-powered code compliance inspection. CAP, LSRA, ILSM, and signed PDF reports — generated from photos.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Compliance Lens by Samektra",
    description: "AI-powered code compliance inspection. CAP, LSRA, ILSM, and signed PDF reports — generated from photos.",
  },
  icons: { icon: "/favicon.ico" },
};

// viewport-fit=cover makes env(safe-area-inset-*) real on iPhones (the tab
// bar, toasts and photo editor pad around the home indicator).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf8f2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
      // The script below sets data-contrast before React hydrates.
      suppressHydrationWarning
    >
      <head>
        {/* High-sun mode (☀ in the header) is a per-device setting. Apply it
            before first paint so the page never flashes the normal theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var c=localStorage.getItem("cl-contrast");if(c==="high"||c==="normal")document.documentElement.dataset.contrast=c}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ServiceStatusBanner />
        {children}
      </body>
    </html>
  );
}
