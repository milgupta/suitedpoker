import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ─────────────────────────────────────────────────────────────
  // ARCHITECTURAL RULE — src/poker/** is PURE TypeScript.
  // It must never import React, a database client, next/*, or
  // anything that performs network I/O. This keeps the entire
  // poker brain unit-testable in milliseconds, deterministic
  // under a seeded RNG, and reusable by the drill engine and the
  // bot simulator alike. See README.
  // ─────────────────────────────────────────────────────────────
  {
    files: ["src/poker/**/*.ts", "src/poker/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "@/components/*",
                "@/db",
                "@/db/*",
                "@/app/*",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
                "@supabase/*",
                "stripe",
                "@upstash/*",
                "resend",
                "posthog-js",
                "posthog-node",
                "framer-motion",
                "motion",
                "motion/*",
              ],
              message:
                "src/poker must stay PURE TypeScript — no React, no DB, no network, no framework. See the architectural rule in README.md.",
            },
          ],
          paths: [
            {
              name: "node:fs",
              message: "src/poker must not touch the filesystem.",
            },
            {
              name: "node:http",
              message: "src/poker must not perform network I/O.",
            },
            {
              name: "node:https",
              message: "src/poker must not perform network I/O.",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
