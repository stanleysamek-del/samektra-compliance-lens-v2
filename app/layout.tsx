import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
