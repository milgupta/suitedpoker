/**
 * The cache layer, run against BOTH implementations.
 *
 * The suite is parameterised over the in-memory store and the real Upstash
 * adapter driven by a fake client, so the plan's "the in-memory fallback passes
 * the identical suite" is a claim about two implementations rather than one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRedis,
  UpstashRedis,
  __setRedisForTests,
  cacheDel,
  cacheGet,
  cacheSet,
  withCache,
  type RedisPort,
} from "../../src/lib/redis";
import { FakeUpstashClient } from "../support/fake-upstash";

/** A clock the tests move by hand, so TTL behaviour is deterministic. */
class Clock {
  constructor(private ms = 1_700_000_000_000) {}
  now = (): number => this.ms;
  advance(seconds: number): void {
    this.ms += seconds * 1000;
  }
}

const IMPLEMENTATIONS: { name: string; make: (clock: Clock) => RedisPort }[] = [
  { name: "MemoryRedis", make: (c) => new MemoryRedis(c.now) },
  {
    name: "UpstashRedis (fake client)",
    make: (c) => new UpstashRedis(new FakeUpstashClient(c.now).asRedis()),
  },
];

describe.each(IMPLEMENTATIONS)("cache helpers on $name", ({ make }) => {
  let clock: Clock;

  beforeEach(() => {
    clock = new Clock();
    __setRedisForTests(make(clock));
  });

  afterEach(() => {
    __setRedisForTests(null);
  });

  it("round-trips an object", async () => {
    const value = { hand: "AKs", position: "BTN", ev: -1.25 };
    expect(await cacheSet("spot:1", value)).toBe(true);
    expect(await cacheGet<typeof value>("spot:1")).toEqual(value);
  });

  it("round-trips values that JSON handles specially", async () => {
    await cacheSet("n", 0);
    expect(await cacheGet<number>("n")).toBe(0);

    await cacheSet("f", false);
    expect(await cacheGet<boolean>("f")).toBe(false);

    await cacheSet("s", "123");
    // A stored numeric string must come back a string, not a number — this is
    // exactly where the SDK's eager JSON parsing bites.
    expect(await cacheGet<string>("s")).toBe("123");

    await cacheSet("arr", [1, 2, 3]);
    expect(await cacheGet<number[]>("arr")).toEqual([1, 2, 3]);
  });

  it("returns null for a key that was never set", async () => {
    expect(await cacheGet("absent")).toBeNull();
  });

  it("expires a key once its TTL passes", async () => {
    await cacheSet("short", { a: 1 }, 60);
    expect(await cacheGet("short")).toEqual({ a: 1 });

    clock.advance(59);
    expect(await cacheGet("short")).toEqual({ a: 1 });

    clock.advance(2);
    expect(await cacheGet("short")).toBeNull();
  });

  it("deletes a key", async () => {
    await cacheSet("gone", { a: 1 });
    expect(await cacheDel("gone")).toBe(true);
    expect(await cacheGet("gone")).toBeNull();
  });

  it("reads through on a miss and serves from cache after", async () => {
    const fn = vi.fn(async () => ({ solved: true }));

    expect(await withCache("rt", 60, fn)).toEqual({ solved: true });
    expect(await withCache("rt", 60, fn)).toEqual({ solved: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-runs the loader once the cached value expires", async () => {
    let n = 0;
    const fn = async () => ({ n: ++n });

    expect(await withCache("rt2", 30, fn)).toEqual({ n: 1 });
    clock.advance(31);
    expect(await withCache("rt2", 30, fn)).toEqual({ n: 2 });
  });
});

describe("cache TTL against the wall clock", () => {
  afterEach(() => {
    __setRedisForTests(null);
  });

  // The rest of the suite drives an injected clock. This one uses real time, so
  // a TTL bug that only shows up with Date.now() cannot hide.
  it("expires a 1s TTL for real", { timeout: 10_000 }, async () => {
    __setRedisForTests(new MemoryRedis());

    await cacheSet("realtime", { a: 1 }, 1);
    expect(await cacheGet("realtime")).toEqual({ a: 1 });

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await cacheGet("realtime")).toBeNull();
  });
});

describe("degradation", () => {
  afterEach(() => {
    __setRedisForTests(null);
  });

  const broken: RedisPort = {
    get: () => Promise.reject(new Error("redis down")),
    set: () => Promise.reject(new Error("redis down")),
    del: () => Promise.reject(new Error("redis down")),
    incrBy: () => Promise.reject(new Error("redis down")),
    expire: () => Promise.reject(new Error("redis down")),
  };

  it("never throws out of the cache helpers when Redis is down", async () => {
    __setRedisForTests(broken);

    await expect(cacheGet("k")).resolves.toBeNull();
    await expect(cacheSet("k", 1)).resolves.toBe(false);
    await expect(cacheDel("k")).resolves.toBe(false);
  });

  it("returns malformed cached JSON as a miss rather than throwing", async () => {
    const port = new MemoryRedis();
    await port.set("bad", "{not json");
    __setRedisForTests(port);

    await expect(cacheGet("bad")).resolves.toBeNull();
  });

  it("still calls the loader when the cache is unreachable", async () => {
    __setRedisForTests(broken);
    const fn = vi.fn(async () => "computed");

    await expect(withCache("k", 60, fn)).resolves.toBe("computed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("lets an error from the loader propagate", async () => {
    __setRedisForTests(new MemoryRedis());

    // The cache is forgiving; the caller's own failure is not swallowed, or a
    // broken query would render as a silently empty page.
    await expect(
      withCache("k", 60, () => Promise.reject(new Error("query failed"))),
    ).rejects.toThrow("query failed");
  });
});
