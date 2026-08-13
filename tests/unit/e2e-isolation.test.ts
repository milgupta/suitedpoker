import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ISOLATION_VARS, missingIsolationVars, projectRefOf } from "../support/e2e-supabase";

/**
 * The e2e suite creates ~60 auth users per run. Whether those land in a throwaway
 * project or in the table the signup and retention numbers are computed from is
 * decided by four environment variables and one Playwright config — and the
 * failure mode is silent in both directions.
 *
 * The `E2E_*` vars are absent on a fresh clone and in CI, so nothing here can
 * assert on a live configuration. What it can assert is that the RULES survive
 * an edit: all four required together, and every one of them actually reaching
 * the server the suite tests.
 */

const CONFIG = readFileSync(resolve(process.cwd(), "playwright.config.ts"), "utf8");

describe("isolation variables", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of ISOLATION_VARS) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    saved.clear();
  });

  it("reports every variable missing on a fresh clone", () => {
    expect(missingIsolationVars()).toEqual([...ISOLATION_VARS]);
  });

  it("reports none missing once all four are set", () => {
    for (const name of ISOLATION_VARS) process.env[name] = "x";
    expect(missingIsolationVars()).toEqual([]);
  });

  /**
   * The case the whole guard exists for. Isolating Supabase auth without
   * isolating the database writes users to the test project and every profile,
   * drill attempt and sim hand to production — while `isolated` reads true and
   * the warning stops printing.
   */
  it("treats the database URL as required, not optional", () => {
    process.env.E2E_SUPABASE_URL = "https://ref.supabase.co";
    process.env.E2E_SUPABASE_ANON_KEY = "anon";
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = "service";

    expect(missingIsolationVars()).toEqual(["E2E_DATABASE_URL"]);
  });

  it("counts an empty string as missing", () => {
    for (const name of ISOLATION_VARS) process.env[name] = "";
    expect(missingIsolationVars()).toEqual([...ISOLATION_VARS]);
  });
});

describe("projectRefOf", () => {
  it("takes the ref from a Supabase project URL", () => {
    expect(projectRefOf("https://abcdefghijklm.supabase.co")).toBe("abcdefghijklm");
  });
});

describe("the app under test", () => {
  /**
   * Isolating `adminClient()` is half the job. `auth.spec.ts` and
   * `analytics.spec.ts` drive the real signup form, so the users they create
   * land wherever the SERVER's credentials point.
   */
  it("receives every e2e credential through webServer.env", () => {
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
    ]) {
      expect(CONFIG, `${key} is not passed to the server under test`).toMatch(
        new RegExp(`${key}:\\s*process\\.env\\.E2E_`),
      );
    }
  });

  it("passes nothing through when isolation is not configured", () => {
    expect(CONFIG).toMatch(/missingIsolationVars\(\)\.length > 0\) return \{\}/);
  });

  it("runs the global setup that proves where the server sends auth", () => {
    expect(CONFIG).toMatch(/globalSetup:\s*"\.\/tests\/e2e\/global-setup\.ts"/);
  });
});
