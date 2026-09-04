import type { NextConfig } from "next";

/**
 * Content-Security-Policy. Every origin below is something the app
 * actually loads — audit before adding one:
 *
 *   'self'                        Next.js bundles, next/font self-hosted
 *                                 fonts, /api/* routes, same-origin images.
 *   'unsafe-inline' (script-src)  Next.js App Router hydration emits inline
 *                                 scripts; without nonces (not wired yet)
 *                                 this is required. No 'unsafe-eval' — the
 *                                 pdf.js loader uses a real dynamic import.
 *   'unsafe-inline' (style-src)   Tailwind v4 + the landing components'
 *                                 inline <style> blocks. Fonts come from
 *                                 next/font (self-hosted) — no googleapis.
 *   https://cdnjs.cloudflare.com  pdf.js (pdf.min.mjs + its worker) loaded
 *                                 on demand by components/plans/plan-uploader.
 *                                 Needed in script-src (module import),
 *                                 worker-src (the worker script) and
 *                                 connect-src (module fetch by the browser).
 *   https://*.supabase.co         Signed storage URLs for photos / plans /
 *                                 signatures (img-src) and the browser
 *                                 Supabase client — PostgREST, Auth, Storage
 *                                 uploads (connect-src) + Realtime (wss).
 *   data: / blob:                 Canvas → PNG previews, object URLs for
 *                                 local file previews, pdf.js worker blobs.
 *   frame-ancestors 'none'        Belt-and-braces with X-Frame-Options.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdnjs.cloudflare.com",
  "worker-src 'self' blob: https://cdnjs.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), geolocation=(self), microphone=()",
  },
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Vercel may serve the same deployment under multiple hostnames
      // (apex, www, the *.vercel.app preview URL). Server actions are
      // origin-checked, so we allow all of them — otherwise a redirect
      // from one to another causes a 400.
      allowedOrigins: [
        "compliancelens.app",
        "www.compliancelens.app",
        "samektra-compliance-lens-v2.vercel.app",
        "samektra-compliance-lens-v2-stanley-sameks-projects.vercel.app",
      ],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
