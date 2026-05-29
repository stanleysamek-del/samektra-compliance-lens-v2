import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Canonicalize on the apex domain so the PKCE code-verifier cookie (set on
  // compliancelens.app) is always present when /auth/callback runs. Without
  // this, a user on www.compliancelens.app would get "code challenge does not
  // match" because the verifier cookie was stored on the apex domain.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.compliancelens.app" }],
        destination: "https://compliancelens.app/:path*",
        permanent: true,
      },
    ];
  },
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
};

export default nextConfig;
