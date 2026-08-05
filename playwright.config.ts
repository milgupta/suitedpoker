import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
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
