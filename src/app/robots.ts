import type { MetadataRoute } from "next";
import { clientEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = (clientEnv.NEXT_PUBLIC_SITE_URL ?? "https://suitedpoker.com").replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The paid product, the auth flow and every API route. Not a security
      // boundary — those are gated server-side — but a crawler wandering into
      // /arena burns budget on pages it will only ever see a redirect for.
      disallow: [
        "/api/",
        "/arena",
        "/drill",
        "/daily",
        "/learn",
        "/table",
        "/ranges",
        "/dashboard",
        "/practice",
        "/progress",
        "/account",
        "/admin",
        "/welcome",
        "/onboarding",
        "/diagnosis",
        "/paywall",
        "/auth/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
