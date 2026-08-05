/**
 * Loads `.env.local` for tests that need real credentials.
 *
 * `@next/env` deliberately skips `.env.local` when NODE_ENV is `test`, so that
 * everyone's test run produces the same result regardless of their local
 * machine. That is the right default — but it means a test which is supposed to
 * run against a real service would silently skip forever, and a security test
 * that never runs is worse than no security test.
 *
 * So this is explicit and opt-in: only tests that genuinely need live
 * credentials call it.
 *
 * Existing environment variables always win, so CI can override without editing
 * anything.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadLocalEnv(file = ".env.local"): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (key === "" || process.env[key] !== undefined) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
