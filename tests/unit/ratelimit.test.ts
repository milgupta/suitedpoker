import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRedis, __setRedisForTests, type RedisPort } from "../../src/lib/redis";
import { RULES, limit, type Rule } from "../../src/lib/ratelimit";
import { localDay } from "../../src/lib/local-day";

class Clock {
  constructor(private ms = Date.UTC(2026, 7, 5, 9, 30, 0)) {}
  now = (): number => this.ms;
  advance(seconds: number): void {
    this.ms += seconds * 1000;
  }
  set(ms: number): void {
    this.ms = ms;
  }
}

const BURST: Rule = {
  key: "test_burst",
  limit: 5,
  kind: "sliding",
  windowSeconds: 60,
  failMode: "open",
};

describe("sliding window", () => {
  let clock: Clock;

  beforeEach(() => {
    clock = new Clock();
    __setRedisForTests(new MemoryRedis(clock.now));
  });

  afterEach(() => __setRedisForTests(null));

  it("allows exactly `limit` requests and denies the next", async () => {
    for (let i = 1; i <= BURST.limit; i++) {
      const result = await limit("user-1", BURST, { now: clock.now });
      expect(result.allowed, `request ${i} should be allowed`).toBe(true);
      expect(result.remaining).toBe(BURST.limit - i);
    }

    const denied = await limit("user-1", BURST, { now: clock.now });
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.degraded).toBe(false);
  });

  it("reports a resetAt at the end of the current window", async () => {
    const result = await limit("user-1", BURST, { now: clock.now });
    const windowMs = 60_000;
    const expected = (Math.floor(clock.now() / windowMs) + 1) * windowMs;
    expect(result.resetAt).toBe(expected);
    expect(result.resetAt).toBeGreaterThan(clock.now());
  });

  it("keeps identifiers separate", async () => {
    for (let i = 0; i < BURST.limit; i++) {
      await limit("user-1", BURST, { now: clock.now });
    }
    expect((await limit("user-1", BURST, { now: clock.now })).allowed).toBe(false);
    expect((await limit("user-2", BURST, { now: clock.now })).allowed).toBe(true);
  });

  it("keeps rules separate", async () => {
    const other: Rule = { ...BURST, key: "test_other" };
    for (let i = 0; i < BURST.limit; i++) {
      await limit("user-1", BURST, { now: clock.now });
    }
    expect((await limit("user-1", BURST, { now: clock.now })).allowed).toBe(false);
    expect((await limit("user-1", other, { now: clock.now })).allowed).toBe(true);
  });

  it("actually slides — allowance returns gradually, not on a boundary", async () => {
    // Fill the window.
    for (let i = 0; i < BURST.limit; i++) {
      await limit("slider", BURST, { now: clock.now });
    }
    expect((await limit("slider", BURST, { now: clock.now })).allowed).toBe(false);

    // Immediately after the boundary the previous window still counts in full.
    // A fixed window would have reset here; a sliding one has not.
    clock.advance(61);
    expect((await limit("slider", BURST, { now: clock.now })).allowed).toBe(false);

    // Half a window later, half the old count has decayed and part of the
    // allowance is back.
    clock.advance(30);
    expect((await limit("slider", BURST, { now: clock.now })).allowed).toBe(true);
  });

  it("fully recovers once the old window has rolled off", async () => {
    for (let i = 0; i < BURST.limit; i++) {
      await limit("recover", BURST, { now: clock.now });
    }

    clock.advance(121);
    const result = await limit("recover", BURST, { now: clock.now });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(BURST.limit - 1);
  });

  it("charges `cost` against the allowance", async () => {
    const first = await limit("costly", BURST, { now: clock.now, cost: 4 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = await limit("costly", BURST, { now: clock.now, cost: 2 });
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(1);
  });

  it("does not consume allowance when it denies", async () => {
    await limit("nc", BURST, { now: clock.now, cost: 5 });
    // A denied request must not push the counter further, or a client that
    // retries would extend its own lockout indefinitely.
    await limit("nc", BURST, { now: clock.now, cost: 5 });
    await limit("nc", BURST, { now: clock.now, cost: 5 });

    clock.advance(121);
    expect((await limit("nc", BURST, { now: clock.now })).allowed).toBe(true);
  });
});

describe("calendar-day window", () => {
  let clock: Clock;

  beforeEach(() => {
    clock = new Clock();
    __setRedisForTests(new MemoryRedis(clock.now));
  });

  afterEach(() => __setRedisForTests(null));

  const BUDGET: Rule = {
    key: "test_budget",
    limit: 1000,
    kind: "calendarDay",
    failMode: "closed",
    timeZone: "UTC",
  };

  it("charges a variable cost and resets at midnight, not 24h later", async () => {
    const first = await limit("u", BUDGET, { now: clock.now, cost: 600 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(400);

    // 09:30 UTC + 14h30m == the next UTC midnight.
    const expectedReset = Date.UTC(2026, 7, 6, 0, 0, 0);
    expect(first.resetAt).toBe(expectedReset);

    const second = await limit("u", BUDGET, { now: clock.now, cost: 500 });
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(400);
  });

  it("resets when the calendar day turns over", async () => {
    await limit("u", BUDGET, { now: clock.now, cost: 1000 });
    expect((await limit("u", BUDGET, { now: clock.now, cost: 1 })).allowed).toBe(false);

    // Just past midnight UTC.
    clock.set(Date.UTC(2026, 7, 6, 0, 0, 1));
    const fresh = await limit("u", BUDGET, { now: clock.now, cost: 1 });
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(999);
  });

  it("measures the day boundary in the rule's timezone", async () => {
    const tokyo: Rule = { ...BUDGET, key: "test_budget_tokyo", timeZone: "Asia/Tokyo" };

    // 2026-08-05 09:30 UTC is 18:30 on the 5th in Tokyo, so its midnight is
    // 15:00 UTC — nine hours earlier than the UTC one.
    const result = await limit("u", tokyo, { now: clock.now, cost: 1 });
    expect(result.resetAt).toBe(Date.UTC(2026, 7, 5, 15, 0, 0));
  });
});

describe("localDay", () => {
  it("derives the day key in the target zone", () => {
    // 23:30 UTC on the 5th is already the 6th in Tokyo.
    const at = Date.UTC(2026, 7, 5, 23, 30, 0);
    expect(localDay(at, "UTC").key).toBe("2026-08-05");
    expect(localDay(at, "Asia/Tokyo").key).toBe("2026-08-06");
  });

  it("puts the next midnight ahead of now and within 24h", () => {
    const at = Date.UTC(2026, 7, 5, 23, 59, 0);
    const { nextMidnight } = localDay(at, "UTC");
    expect(nextMidnight).toBeGreaterThan(at);
    expect(nextMidnight - at).toBeLessThanOrEqual(86_400_000);
  });
});

describe("degradation", () => {
  const broken: RedisPort = {
    get: () => Promise.reject(new Error("redis down")),
    set: () => Promise.reject(new Error("redis down")),
    del: () => Promise.reject(new Error("redis down")),
    incrBy: () => Promise.reject(new Error("redis down")),
    expire: () => Promise.reject(new Error("redis down")),
    mget: () => Promise.reject(new Error("redis down")),
    incrByWithExpire: () => Promise.reject(new Error("redis down")),
  };

  beforeEach(() => __setRedisForTests(broken));
  afterEach(() => __setRedisForTests(null));

  it("fails OPEN for a rule that costs us nothing but latency", async () => {
    const result = await limit("u", RULES.API_GENERIC);
    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.remaining).toBe(RULES.API_GENERIC.limit);
  });

  it("fails CLOSED for a cost-bearing AI rule", async () => {
    // An outage is exactly when an unmetered AI endpoint drains the budget.
    const result = await limit("u", RULES.COACH_CHAT);
    expect(result.allowed).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("fails CLOSED for the daily token budget, with a real resetAt", async () => {
    const result = await limit("u", RULES.AI_TOKENS_DAILY, { cost: 5000 });
    expect(result.allowed).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it("fails CLOSED for auth attempts even though they cost nothing", async () => {
    // This one guards credentials, not spend.
    expect((await limit("u", RULES.AUTH_ATTEMPT)).allowed).toBe(false);
  });

  it("never throws", async () => {
    for (const rule of Object.values(RULES)) {
      await expect(limit("u", rule)).resolves.toBeDefined();
    }
  });
});

describe("named rules", () => {
  it("gives every rule a distinct key", () => {
    const keys = Object.values(RULES).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("makes every AI rule fail closed", () => {
    for (const [name, rule] of Object.entries(RULES)) {
      if (name.startsWith("COACH_") || name.startsWith("AI_")) {
        expect(rule.failMode, `${name} spends money and must fail closed`).toBe("closed");
      }
    }
  });

  it("gives every sliding rule a window", () => {
    for (const [name, rule] of Object.entries(RULES)) {
      if (rule.kind === "sliding") {
        expect(rule.windowSeconds, `${name} needs a window`).toBeGreaterThan(0);
      }
    }
  });
});
