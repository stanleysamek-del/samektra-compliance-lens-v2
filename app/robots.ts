import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://compliancelens.app";

export default function robots(): MetadataRoute.Robots {
  // Auth-walled product. Allow crawlers on the marketing surfaces only.
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/inspections",
          "/onboarding",
          "/auth",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
