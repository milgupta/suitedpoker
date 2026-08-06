import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // See tests/support/server-only-stub.ts for why this is aliased.
      "server-only": fileURLToPath(new URL("./tests/support/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    /**
     * The engine suite runs exhaustive property tests — 100,000 random spots,
     * 200,000 weighted draws, a full five-card enumeration. Alone they take
     * ~2s; under the parallel load of the whole suite they cross Vitest's 5s
     * default and fail as timeouts, which looks exactly like a real regression
     * and wastes an afternoon.
     *
     * The tests are legitimately long-running, so the budget is raised rather
     * than the sample sizes being cut.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
    projects: [
      {
        // Pure engine + unit tests. Node environment, no DOM, fast.
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "src/poker/**/*.test.ts"],
          /**
           * EVERY *-live suite is opt-in, and every one of them has its own
           * npm script. They make real API calls: Gemini generations that cost
           * money and need quota, and Stripe customers and subscriptions that
           * are created for real in test mode.
           *
           * Only coach-live was listed here. stripe-webhook-live and chat-live
           * matched `tests/unit/**` and had therefore been running inside every
           * `npm run verify` — creating Stripe objects and burning Gemini quota
           * on each commit, and failing outright whenever the Playwright suite
           * happened to be touching the same Stripe account.
           *
           * Left in the default run they turn an external billing problem into
           * a red build gate that blocks every commit; a suite that self-skips
           * instead would quietly stop being the check it was written to be.
           *
           *   npm run test:ai · npm run test:chat · npm run test:stripe
           */
          // See the note in playwright.config.ts: sync-conflict duplicates are
          // gitignored but still on disk, and Vitest runs them.
          exclude: ["tests/unit/*-live.test.ts", "**/* [0-9].*"],
        },
      },
      {
        // Component tests. jsdom.
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: [
            "src/components/**/*.test.tsx",
            "tests/components/**/*.test.tsx",
            // Browser-API tests that are not components — anything reading
            // computed styles or matchMedia.
            "tests/dom/**/*.test.{ts,tsx}",
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/poker/**", "src/lib/**"],
      // src/poker is correctness-critical. Stage 9.3 raises this to 90.
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
    },
  },
});
