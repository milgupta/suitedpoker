import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The opt-in live suites: real API calls, real credentials, real money-adjacent
 * services. Kept out of `vitest.config.mts` entirely rather than excluded from
 * it, because an exclusion in the default config also blocks an explicit run —
 * which is exactly what happened the first time.
 *
 *   npm run test:ai      — the Gemini coach
 *   npm run test:stripe  — the payment boundary
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    name: "live",
    environment: "node",
    include: ["tests/unit/coach-live.test.ts", "tests/unit/stripe-webhook-live.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
