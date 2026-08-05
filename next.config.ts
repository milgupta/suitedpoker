import type { NextConfig } from "next";

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS = POSTHOG_HOST.replace("us.i.posthog.com", "us-assets.i.posthog.com");

const nextConfig: NextConfig = {
  /**
   * PostHog is proxied through our own origin.
   *
   * Every mainstream adblock list blocks posthog.com by hostname. Without this
   * rewrite a large slice of traffic — disproportionately the technical users
   * most likely to try a poker tool — silently never appears in the funnel, and
   * you cannot tell that from genuine drop-off.
   */
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${POSTHOG_ASSETS}/static/:path*` },
      { source: "/ingest/:path*", destination: `${POSTHOG_HOST}/:path*` },
    ];
  },

  // The proxy above needs the trailing slash preserved or PostHog 404s.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
