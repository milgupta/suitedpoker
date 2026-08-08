import createMDX from "@next/mdx";
import type { NextConfig } from "next";
import { formatProblems, isProductionDeploy, productionEnvProblems } from "./src/lib/env-required";

/**
 * THE BUILD REFUSES A PRODUCTION DEPLOY THAT CANNOT TAKE MONEY.
 *
 * Every env var is optional in the schemas so a fresh clone and CI both work
 * with an empty .env.local. That is right for development and wrong for
 * production: a deploy missing STRIPE_WEBHOOK_SECRET accepts payments and never
 * grants access, and nothing surfaces it until a customer emails.
 *
 * Gated on VERCEL_ENV === "production" specifically. NODE_ENV cannot tell a
 * production deploy from a preview — both are "production" — and failing
 * previews would block every branch.
 */
if (isProductionDeploy(process.env)) {
  const problems = productionEnvProblems(process.env);
  if (problems.length > 0) {
    console.error(formatProblems(problems));
    process.exit(1);
  }
}

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS = POSTHOG_HOST.replace("us.i.posthog.com", "us-assets.i.posthog.com");

const nextConfig: NextConfig = {
  /**
   * The deploy environment, inlined into the client bundle at build time.
   *
   * The Meta pixel is gated on this — anything but "production" logs instead of
   * sending, so a laptop and a preview deploy cannot reach the live dataset.
   *
   * NOT left to Vercel's `NEXT_PUBLIC_VERCEL_ENV`: that one exists only when the
   * project has "Automatically expose System Environment Variables" enabled, and
   * a silently absent value here reads as "not production", which would turn the
   * production pixel off with nothing to show for it. `VERCEL_ENV` is always
   * present in a Vercel build, so deriving it here removes the dependency on a
   * dashboard checkbox.
   */
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "",
  },

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

  /**
   * `.mdx` is a MODULE type, not a page type — `pageExtensions` deliberately
   * excludes it. Lessons are imported by a registry and rendered inside the
   * lesson shell, never routed to directly.
   */
  pageExtensions: ["ts", "tsx"],
};

/**
 * Lessons compile at BUILD time.
 *
 * Runtime MDX was tried twice and failed twice: next-mdx-remote/rsc renders
 * client components without their props (every Checkpoint arrived empty), and
 * its legacy client path dies under React 19 with a null useState. Compiling
 * through Next's own pipeline makes a lesson an ordinary component — props
 * work because nothing crosses a boundary it was not designed for.
 */
const withMDX = createMDX({
  options: {
    /**
     * Without this, MDX tries to parse the frontmatter's `{ "type": ... }` as a
     * JSX expression and dies with "Could not parse expression with acorn".
     * The block is metadata — src/lib/curriculum.ts owns it — so MDX skips it.
     */
    remarkPlugins: [["remark-frontmatter", ["yaml"]]],
  },
});

export default withMDX(nextConfig);
