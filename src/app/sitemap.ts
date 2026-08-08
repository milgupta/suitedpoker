import type { MetadataRoute } from "next";
import { clientEnv } from "@/lib/env";

/**
 * Only the pages a search engine should index.
 *
 * Everything under (app) is behind a paywall and every legal page is
 * boilerplate; listing them dilutes the crawl budget on a small site. The
 * marketing surface is five URLs and that is the whole sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (clientEnv.NEXT_PUBLIC_SITE_URL ?? "https://suitedpoker.com").replace(/\/$/, "");
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
