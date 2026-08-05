import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        // Pure engine + unit tests. Node environment, no DOM, fast.
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "src/poker/**/*.test.ts"],
        },
      },
      {
        // Component tests. jsdom.
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/components/**/*.test.tsx", "tests/components/**/*.test.tsx"],
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
