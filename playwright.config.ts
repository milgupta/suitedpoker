import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

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
  },
});
