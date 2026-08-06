/**
 * The build refuses a production deploy that cannot take money.
 *
 * Every one of these is a failure that looks completely healthy from the
 * outside: checkout succeeds and nobody is charged, or payment succeeds and
 * nobody gets access. They are invisible until a customer emails, which is why
 * they belong in the build rather than in a runbook.
 */

import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_IN_PRODUCTION,
  formatProblems,
  isProductionDeploy,
  productionEnvProblems,
  REQUIRED_IN_PRODUCTION,
} from "../../src/lib/env-required";

/** Everything set, and set to production-shaped values. */
function goodEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const { name } of REQUIRED_IN_PRODUCTION) env[name] = "set";
  env.STRIPE_SECRET_KEY = "sk_live_abc";
  return env;
}

describe("what production requires", () => {
  it("passes a complete environment", () => {
    expect(productionEnvProblems(goodEnv())).toEqual([]);
  });

  it.each(REQUIRED_IN_PRODUCTION.map((v) => v.name))("fails when %s is missing", (name) => {
    const env = goodEnv();
    delete env[name];

    const problems = productionEnvProblems(env);
    expect(problems.map((p) => p.name)).toContain(name);
    expect(problems.find((p) => p.name === name)?.problem).toBe("missing");
  });

  it("treats an empty string as missing", () => {
    // Vercel stores a cleared variable as "", not as absent.
    const env = { ...goodEnv(), STRIPE_WEBHOOK_SECRET: "   " };
    expect(productionEnvProblems(env).map((p) => p.name)).toContain("STRIPE_WEBHOOK_SECRET");
  });

  it("reports EVERY problem, not just the first", () => {
    const env = goodEnv();
    delete env.DATABASE_URL;
    delete env.CRON_SECRET;
    expect(productionEnvProblems(env)).toHaveLength(2);
  });

  it("names the webhook secret as silently catastrophic", () => {
    // The one where payment succeeds and access is never granted.
    const entry = REQUIRED_IN_PRODUCTION.find((v) => v.name === "STRIPE_WEBHOOK_SECRET");
    expect(entry?.because).toContain("NEVER granted");
  });
});

describe("what production forbids", () => {
  it("refuses a test-mode Stripe key", () => {
    // Takes no money at all while every checkout appears to succeed.
    const env = { ...goodEnv(), STRIPE_SECRET_KEY: "sk_test_abc" };
    const problems = productionEnvProblems(env);
    expect(problems.map((p) => p.name)).toContain("STRIPE_SECRET_KEY");
    expect(problems[0]?.problem).toBe("forbidden");
  });

  it("refuses a test-mode publishable key", () => {
    const env = { ...goodEnv(), NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc" };
    expect(productionEnvProblems(env).map((p) => p.name)).toContain(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    );
  });

  it("refuses a lingering Meta test event code", () => {
    // Routes every conversion to the test panel and reports none of them.
    const env = { ...goodEnv(), META_TEST_EVENT_CODE: "TEST12345" };
    expect(productionEnvProblems(env).map((p) => p.name)).toContain("META_TEST_EVENT_CODE");
  });

  it("refuses an entitlement bypass", () => {
    const env = { ...goodEnv(), DEV_BYPASS_ENTITLEMENT: "true" };
    expect(productionEnvProblems(env).map((p) => p.name)).toContain("DEV_BYPASS_ENTITLEMENT");
  });

  it("allows the live keys", () => {
    const env = {
      ...goodEnv(),
      STRIPE_SECRET_KEY: "sk_live_abc",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_abc",
      DEV_BYPASS_ENTITLEMENT: "false",
    };
    expect(productionEnvProblems(env)).toEqual([]);
  });

  it("has a reason for every forbidden value", () => {
    for (const entry of FORBIDDEN_IN_PRODUCTION) {
      expect(entry.because.length, entry.name).toBeGreaterThan(20);
    }
  });
});

describe("when the check runs at all", () => {
  it("runs for a Vercel production deploy", () => {
    expect(isProductionDeploy({ VERCEL_ENV: "production" })).toBe(true);
  });

  it("does NOT run for a preview deploy", () => {
    // A preview build is also NODE_ENV=production. Failing those would block
    // every branch deploy, including the one fixing the missing variable.
    expect(isProductionDeploy({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
  });

  it("does NOT run for a local build", () => {
    expect(isProductionDeploy({ NODE_ENV: "production" })).toBe(false);
    expect(isProductionDeploy({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("the message someone reads at 2am", () => {
  it("names the variable and what it breaks", () => {
    const env = goodEnv();
    delete env.STRIPE_WEBHOOK_SECRET;

    const message = formatProblems(productionEnvProblems(env));
    expect(message).toContain("STRIPE_WEBHOOK_SECRET");
    expect(message).toContain("NEVER granted");
    expect(message).toContain("Vercel");

    console.log(message);
  });
});
