import type { NextConfig } from "next";

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
};

export default nextConfig;
