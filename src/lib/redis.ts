import "server-only";

import { Redis } from "@upstash/redis";
import { serverEnv } from "@/lib/env.server";

/**
 * The shared Redis layer.
 *
 * Two rules run through everything here:
 *
 * 1. NOTHING THROWS. A Redis outage must degrade the app, not break it — a
 *    cache miss is a slow page, an unreachable limiter is a decision about
 *    fail-open vs fail-closed (see ratelimit.ts), never a 500.
 *
 * 2. There is always an implementation. With no Upstash credentials the
 *    in-memory store takes over, so local development and CI run the identical
 *    code path and the identical test suite without a Redis instance.
 */

/**
 * The narrow set of operations this app actually needs.
 *
 * Deliberately not "all of Redis": a small port is what makes the in-memory
 * implementation trustworthy enough to test against.
 */
export interface RedisPort {
  get(key: string): Promise<string | null>;
  /** Reads several keys in ONE round trip. Order matches the input. */
  mget(keys: readonly string[]): Promise<(string | null)[]>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Returns the value after incrementing. Creates the key at 0 first. */
  incrBy(key: string, amount: number): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  /**
   * incrBy + expire in ONE round trip. The rate limiter runs on every drill
   * request, and two sequential Upstash calls per request is pure wire time.
   */
  incrByWithExpire(key: string, amount: number, ttlSeconds: number): Promise<number>;
}

/* ── In-memory implementation ────────────────────────────────────────────── */

interface MemoryEntry {
  value: string;
  /** Epoch ms, or null for no expiry. */
  expiresAt: number | null;
}

/**
 * A Map with TTLs. Expiry is checked lazily on read rather than with timers,
 * which keeps it deterministic under an injected clock in tests.
 */
export class MemoryRedis implements RedisPort {
  private readonly store = new Map<string, MemoryEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string): MemoryEntry | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds === undefined ? null : this.now() + ttlSeconds * 1000,
    });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  mget(keys: readonly string[]): Promise<(string | null)[]> {
    return Promise.resolve(keys.map((key) => this.live(key)?.value ?? null));
  }

  incrBy(key: string, amount: number): Promise<number> {
    const current = this.live(key);
    const next = Number(current?.value ?? "0") + amount;
    this.store.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
    return Promise.resolve(next);
  }

  expire(key: string, ttlSeconds: number): Promise<void> {
    const entry = this.live(key);
    if (entry !== undefined) {
      entry.expiresAt = this.now() + ttlSeconds * 1000;
    }
    return Promise.resolve();
  }

  async incrByWithExpire(key: string, amount: number, ttlSeconds: number): Promise<number> {
    const next = await this.incrBy(key, amount);
    await this.expire(key, ttlSeconds);
    return next;
  }

  /** Test helper. Not part of the port. */
  clear(): void {
    this.store.clear();
  }
}

/* ── Upstash implementation ──────────────────────────────────────────────── */

/**
 * Exported so the test suite can run the same behaviour checks through this
 * adapter against a fake client. Otherwise "the in-memory fallback passes the
 * identical suite" would only ever prove the in-memory store works.
 */
export class UpstashRedis implements RedisPort {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    const value = await this.client.get<unknown>(key);
    if (value === null || value === undefined) return null;
    // The client is constructed with automaticDeserialization disabled, so this
    // is already a string. The fallback covers the case where that option is
    // ever changed — but note the round trip is genuinely lossy in that mode: a
    // stored string "123" comes back as the number 123 and cannot be told apart
    // from a stored number. Do not turn auto-deserialization back on.
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) {
      await this.client.set(key, value);
    } else {
      await this.client.set(key, value, { ex: ttlSeconds });
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async mget(keys: readonly string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const values = await this.client.mget<unknown[]>(...keys);
    return values.map((value) => {
      if (value === null || value === undefined) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    });
  }

  incrBy(key: string, amount: number): Promise<number> {
    return this.client.incrby(key, amount);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async incrByWithExpire(key: string, amount: number, ttlSeconds: number): Promise<number> {
    // One HTTP request to Upstash, not two — the REST pipeline batches both
    // commands into a single round trip.
    const [incremented] = await this.client
      .pipeline()
      .incrby(key, amount)
      .expire(key, ttlSeconds)
      .exec<[number, number]>();
    return incremented;
  }
}

/* ── Selection ───────────────────────────────────────────────────────────── */

let cached: RedisPort | null = null;
let warned = false;

export function isRedisConfigured(): boolean {
  const env = serverEnv();
  return (
    typeof env.UPSTASH_REDIS_REST_URL === "string" &&
    env.UPSTASH_REDIS_REST_URL !== "" &&
    typeof env.UPSTASH_REDIS_REST_TOKEN === "string" &&
    env.UPSTASH_REDIS_REST_TOKEN !== ""
  );
}

export function getRedis(): RedisPort {
  if (cached !== null) return cached;

  if (!isRedisConfigured()) {
    if (!warned) {
      warned = true;
      // Once at boot, not per call — a warning on every cache read is noise
      // that trains people to ignore warnings.
      console.warn(
        "[redis] UPSTASH_REDIS_REST_URL/TOKEN not set — using the in-memory store. " +
          "State will not survive a restart and is not shared between instances.",
      );
    }
    cached = new MemoryRedis();
    return cached;
  }

  const env = serverEnv();
  cached = new UpstashRedis(
    new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
      // We serialise ourselves. Letting the SDK parse would make a stored
      // string "123" indistinguishable from a stored number 123 on the way
      // back out.
      automaticDeserialization: false,
    }),
  );
  return cached;
}

/** Test-only. Swaps the client and resets the boot warning. */
export function __setRedisForTests(port: RedisPort | null): void {
  cached = port;
  warned = false;
}

/* ── Cache helpers ───────────────────────────────────────────────────────── */

/**
 * Reads and JSON-parses a key. Returns null on a miss, on malformed JSON, and
 * on any Redis error — the caller cannot tell the difference, and should not
 * need to.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Returns whether the write landed, so a caller can log a persistent failure. */
export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  try {
    await getRedis().set(key, JSON.stringify(value), ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

export async function cacheDel(key: string): Promise<boolean> {
  try {
    await getRedis().del(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read-through cache. On a miss it runs `fn`, stores the result and returns it.
 *
 * A failure inside `fn` propagates — that is the caller's error and swallowing
 * it would turn a broken query into a silent empty page. Only the cache layer
 * is forgiving.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  const value = await fn();
  await cacheSet(key, value, ttlSeconds);
  return value;
}
