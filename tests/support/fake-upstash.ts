/**
 * A stand-in for the @upstash/redis client.
 *
 * This exists so the shared behaviour suite runs through the real
 * `UpstashRedis` adapter as well as through `MemoryRedis`. Without it,
 * "the fallback passes the identical suite" would only prove the fallback
 * works, and the adapter — where the SDK's return-type quirks live — would be
 * exercised by nothing.
 *
 * It models the client as we construct it — `automaticDeserialization: false`,
 * so `get` hands back the raw stored string. That option is not optional: with
 * the SDK's default parsing, a stored string "123" and a stored number 123 come
 * back identical, and the cache round trip stops being lossless.
 */

import type { Redis } from "@upstash/redis";

interface Entry {
  value: string;
  expiresAt: number | null;
}

export class FakeUpstashClient {
  private readonly store = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  get<T>(key: string): Promise<T | null> {
    const raw = this.live(key)?.value;
    return Promise.resolve(raw === undefined ? null : (raw as unknown as T));
  }

  set(key: string, value: string, opts?: { ex?: number }): Promise<"OK"> {
    this.store.set(key, {
      value,
      expiresAt: opts?.ex === undefined ? null : this.now() + opts.ex * 1000,
    });
    return Promise.resolve("OK");
  }

  del(key: string): Promise<number> {
    return Promise.resolve(this.store.delete(key) ? 1 : 0);
  }

  mget<T>(...keys: string[]): Promise<(T | null)[]> {
    return Promise.resolve(
      keys.map((key) => {
        const raw = this.live(key)?.value;
        return raw === undefined ? null : (raw as unknown as T);
      }),
    );
  }

  incrby(key: string, amount: number): Promise<number> {
    const current = this.live(key);
    const next = Number(current?.value ?? "0") + amount;
    this.store.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
    return Promise.resolve(next);
  }

  expire(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.live(key);
    if (entry === undefined) return Promise.resolve(0);
    entry.expiresAt = this.now() + ttlSeconds * 1000;
    return Promise.resolve(1);
  }

  /**
   * The REST pipeline, modelled as the adapter uses it: queued commands, one
   * `exec`. Sequential application is faithful — Upstash pipelines are not
   * transactions.
   */
  pipeline(): FakePipeline {
    return new FakePipeline(this);
  }

  /** The adapter only touches these methods. */
  asRedis(): Redis {
    return this as unknown as Redis;
  }
}

class FakePipeline {
  private readonly queue: (() => Promise<unknown>)[] = [];

  constructor(private readonly client: FakeUpstashClient) {}

  incrby(key: string, amount: number): FakePipeline {
    this.queue.push(() => this.client.incrby(key, amount));
    return this;
  }

  expire(key: string, ttlSeconds: number): FakePipeline {
    this.queue.push(() => this.client.expire(key, ttlSeconds));
    return this;
  }

  async exec<T>(): Promise<T> {
    const results: unknown[] = [];
    for (const command of this.queue) {
      results.push(await command());
    }
    return results as T;
  }
}
