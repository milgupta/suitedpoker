import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRedis, __setRedisForTests } from "../../src/lib/redis";
import { isEntitled, ENTITLING_STATUSES } from "../../src/lib/entitlement-rule";

/**
 * Next's types mark NODE_ENV readonly, which is right for app code and wrong
 * for a test that exists to prove behaviour differs between environments.
 */
function setEnv(key: string, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

const FUTURE = new Date("2030-01-01T00:00:00Z").toISOString();
const PAST = new Date("2020-01-01T00:00:00Z").toISOString();

describe("the entitlement rule", () => {
  it("admits an active subscription whose period has not ended", () => {
    expect(isEntitled({ status: "active", currentPeriodEnd: FUTURE })).toBe(true);
  });

  it("admits a trialing subscription", () => {
    expect(isEntitled({ status: "trialing", currentPeriodEnd: FUTURE })).toBe(true);
  });

  it("REFUSES an active subscription whose period has already ended", () => {
    // Stripe can lag on status changes. Trusting `status` alone is how a
    // cancelled user keeps access for another day.
    expect(isEntitled({ status: "active", currentPeriodEnd: PAST })).toBe(false);
  });

  it("refuses a missing subscription", () => {
    expect(isEntitled(null)).toBe(false);
  });

  it.each(["canceled", "incomplete", "unpaid", "paused", ""])(
    "refuses status %s even with a future period end",
    (status) => {
      expect(isEntitled({ status, currentPeriodEnd: FUTURE })).toBe(false);
    },
  );

  it("gives past_due a grace period rather than refusing it outright", () => {
    // Changed in 7.4, deliberately. 1.3 refused past_due, which locks out a
    // paying customer the instant their bank declines a routine renewal —
    // a refund and a chargeback rather than a recovered subscription.
    // The exact boundaries live in tests/unit/entitlement-grace.test.ts.
    expect(isEntitled({ status: "past_due", currentPeriodEnd: FUTURE })).toBe(true);
  });

  it("refuses a row with no period end", () => {
    expect(isEntitled({ status: "active", currentPeriodEnd: null })).toBe(false);
  });

  it("refuses an unparseable period end rather than throwing", () => {
    expect(isEntitled({ status: "active", currentPeriodEnd: "not a date" })).toBe(false);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(isEntitled({ status: "active", currentPeriodEnd: new Date(FUTURE) })).toBe(true);
  });

  it("treats the boundary as expired, not entitled", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    expect(isEntitled({ status: "active", currentPeriodEnd: now.toISOString() }, now)).toBe(false);
  });

  it("entitles on exactly two statuses", () => {
    expect([...ENTITLING_STATUSES]).toEqual(["active", "trialing"]);
  });
});

describe("the development bypass", () => {
  const OLD = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD };
    vi.resetModules();
  });

  it("CANNOT fire in production, however the flag is set", async () => {
    // The acceptance criterion for 1.3. This must be structural, not a
    // convention — env.server.ts forces the flag off when NODE_ENV is
    // production, so no caller can opt back in.
    setEnv("NODE_ENV", "production");
    setEnv("DEV_BYPASS_ENTITLEMENT", "true");
    vi.resetModules();

    const { serverEnv, __resetServerEnvForTests } = await import("../../src/lib/env.server");
    __resetServerEnvForTests();

    expect(serverEnv().DEV_BYPASS_ENTITLEMENT).toBe(false);
  });

  it("is available outside production", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("DEV_BYPASS_ENTITLEMENT", "true");
    vi.resetModules();

    const { serverEnv, __resetServerEnvForTests } = await import("../../src/lib/env.server");
    __resetServerEnvForTests();

    expect(serverEnv().DEV_BYPASS_ENTITLEMENT).toBe(true);
  });

  it("defaults to off", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("DEV_BYPASS_ENTITLEMENT", undefined);
    vi.resetModules();

    const { serverEnv, __resetServerEnvForTests } = await import("../../src/lib/env.server");
    __resetServerEnvForTests();

    expect(serverEnv().DEV_BYPASS_ENTITLEMENT).toBe(false);
  });
});

describe("the entitlement cache", () => {
  const OLD = { ...process.env };

  /**
   * Resolves redis and entitlement from the SAME module registry.
   *
   * vi.resetModules() means a dynamic import creates a fresh copy of redis.ts
   * with its own client — so seeding the statically-imported one would leave
   * entitlement talking to a different instance entirely.
   */
  async function freshModules() {
    vi.resetModules();
    const redisModule = await import("../../src/lib/redis");
    const envModule = await import("../../src/lib/env.server");
    envModule.__resetServerEnvForTests();
    const entitlementModule = await import("../../src/lib/entitlement");
    return { redisModule, entitlementModule };
  }

  beforeEach(() => {
    setEnv("NODE_ENV", "test");
    setEnv("DEV_BYPASS_ENTITLEMENT", "false");
  });

  afterEach(() => {
    __setRedisForTests(null);
    process.env = { ...OLD };
    vi.resetModules();
  });

  it("caches a verdict for five minutes and invalidateEntitlement busts it", async () => {
    const { redisModule, entitlementModule } = await freshModules();
    const redis = new redisModule.MemoryRedis();
    redisModule.__setRedisForTests(redis);

    // Five minutes, not more: the webhook busts this on every subscription
    // change, so the TTL only bounds out-of-band expiry. It must stay well
    // inside the 3-day past-due grace window.
    expect(entitlementModule.ENTITLEMENT_TTL_SECONDS).toBe(300);
    expect(entitlementModule.ENTITLEMENT_TTL_SECONDS).toBeLessThan(86_400);

    // The DB is unreachable here, so drive the cache directly — the point is
    // that the key is read, honoured, and can be cleared on demand.
    await redis.set("ent:user-1", JSON.stringify(true), entitlementModule.ENTITLEMENT_TTL_SECONDS);
    expect(await redis.get("ent:user-1")).toBe("true");

    await entitlementModule.invalidateEntitlement("user-1");
    expect(await redis.get("ent:user-1")).toBeNull();
  });

  it("expires the cached verdict after its TTL", async () => {
    const clock = { ms: Date.now() };
    const timed = new MemoryRedis(() => clock.ms);
    __setRedisForTests(timed);

    await timed.set("ent:user-2", JSON.stringify(true), 60);
    clock.ms += 59_000;
    expect(await timed.get("ent:user-2")).toBe("true");
    clock.ms += 2_000;
    expect(await timed.get("ent:user-2")).toBeNull();
  });

  it("short-circuits on the bypass before touching the cache", async () => {
    setEnv("NODE_ENV", "development");
    setEnv("DEV_BYPASS_ENTITLEMENT", "true");

    const { redisModule, entitlementModule } = await freshModules();
    const fresh = new redisModule.MemoryRedis();
    redisModule.__setRedisForTests(fresh);

    // No DB is configured. If the bypass did not short-circuit, this would
    // throw on getDb() rather than resolving true.
    await expect(entitlementModule.hasActiveSubscription("user-3")).resolves.toBe(true);
    expect(await fresh.get("ent:user-3")).toBeNull();
  });
});
