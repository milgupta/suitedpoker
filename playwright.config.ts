import { defineConfig, devices } from "@playwright/test";
import { missingIsolationVars } from "./tests/support/e2e-supabase";
import { loadLocalEnv } from "./tests/support/load-local-env";

// The E2E_* vars live in .env.local, which nothing has loaded at this point —
// Next loads it when the server boots, which is too late to decide what the
// server boots with.
loadLocalEnv();

const PORT = 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Points the APP UNDER TEST at the e2e Supabase project.
 *
 * Isolating `adminClient()` is only half of it. Three specs drive the real
 * signup form, so the users they create land wherever the SERVER's credentials
 * point — and without this the server reads .env.local and writes them into the
 * same `auth.users` table the signup and retention numbers come from.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, which is why `webServer.command`
 * running `next build` under this environment is what makes it stick. Next
 * never overwrites a variable that is already in `process.env`, so these win
 * over .env.local.
 *
 * All four or nothing. A run with the Supabase three but not the database URL
 * writes auth rows to the test project and every other row to production —
 * `tests/e2e/global-setup.ts` refuses that combination outright.
 */
function e2eServerEnv(): Record<string, string> {
  if (missingIsolationVars().length > 0) return {};

  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY ?? "",
    SUPABASE_SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "",
    DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
    // Auth redirects, Stripe return URLs and email links all derive from this.
    // Left at the production value they point a test run's confirmation link at
    // the live site.
    NEXT_PUBLIC_SITE_URL: baseURL,
  };
}

export default defineConfig({
  testDir: "./tests/e2e",
  /**
   * iCloud/Dropbox sync copies files mid-write as "name 2.spec.ts". They are
   * gitignored, so they never reach a commit — but they sit on disk and
   * Playwright happily discovers and RUNS them, which means a stale copy of a
   * spec reports failures against code that has since changed. Two of them were
   * live when this was added.
   */
  testIgnore: ["**/* [0-9].*"],
  /**
   * Runs once, before any spec, and refuses the run if the server it is about
   * to test would create users in the production project.
   */
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /**
   * Capped at 2 locally.
   *
   * Most of this suite creates a real Supabase user and logs it in. At the
   * default worker count (cores - 1, doubled across the two projects) Supabase's
   * own auth rate limiting starts refusing sign-ins, and roughly a dozen
   * unrelated tests fail with timeouts that look like product bugs. Two workers
   * keeps the whole suite green and still finishes in about four minutes.
   */
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  /**
   * 15s, not Playwright's 5s default.
   *
   * That default assumes a fast local component render. Every assertion here
   * waits on a real Next server, a real Postgres round-trip and a real Supabase
   * auth call, and a login → gate → redirect chain regularly takes ten seconds
   * under parallel workers. Two daily-challenge tests failed a full-suite run
   * on exactly that and passed in isolation — a load-dependent flake reads as a
   * product bug, and chasing one costs a twenty-minute run each time.
   *
   * Still tight enough to catch a navigation that genuinely never happens.
   */
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    // Mobile is the primary target for this product — 85% of traffic
    // will arrive on a phone from a Meta ad. Never let this project rot.
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: e2eServerEnv(),
  },
});
