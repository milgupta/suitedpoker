import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRedis, __setRedisForTests, type RedisPort } from "../../src/lib/redis";
import { deleteSession, getSession, putSession } from "../../src/lib/sessionstore";

class Clock {
  constructor(private ms = 1_700_000_000_000) {}
  now = (): number => this.ms;
  advance(seconds: number): void {
    this.ms += seconds * 1000;
  }
}

interface DrillState {
  nodeRef: string;
  correctAction: string;
  evTable: Record<string, number>;
}

const STATE: DrillState = {
  nodeRef: "btn-vs-bb-3bet-A7s",
  correctAction: "fold",
  evTable: { fold: 0, call: -1.8, raise: -3.2 },
};

describe("session ownership — SECURITY", () => {
  let clock: Clock;

  beforeEach(() => {
    clock = new Clock();
    __setRedisForTests(new MemoryRedis(clock.now));
  });

  afterEach(() => __setRedisForTests(null));

  it("returns null when a different user asks for the session", async () => {
    // THE check. A session id travels in URLs and request bodies and is far
    // easier to come by than a user id, so without this one comparison any
    // user could read another's in-flight solution — the correct action and
    // the whole EV table — before acting on it themselves.
    await putSession("drill", "session-abc", "user-A", STATE, 300);

    expect(await getSession<DrillState>("drill", "session-abc", "user-A")).toEqual(STATE);
    expect(await getSession<DrillState>("drill", "session-abc", "user-B")).toBeNull();
  });

  it("does not distinguish a wrong owner from a missing session", async () => {
    await putSession("drill", "exists", "user-A", STATE, 300);

    // Both null. Telling an attacker that a session exists but is not theirs
    // is itself a disclosure.
    const wrongOwner = await getSession("drill", "exists", "user-B");
    const missing = await getSession("drill", "never-existed", "user-B");
    expect(wrongOwner).toBe(missing);
  });

  it("is not fooled by a user id that differs only in case or whitespace", async () => {
    await putSession("drill", "s1", "user-A", STATE, 300);

    expect(await getSession("drill", "s1", "USER-A")).toBeNull();
    expect(await getSession("drill", "s1", " user-A")).toBeNull();
    expect(await getSession("drill", "s1", "user-A ")).toBeNull();
  });

  it("scopes sessions by kind as well as id", async () => {
    await putSession("drill", "same-id", "user-A", STATE, 300);
    expect(await getSession("table", "same-id", "user-A")).toBeNull();
  });
});

describe("session lifecycle", () => {
  let clock: Clock;

  beforeEach(() => {
    clock = new Clock();
    __setRedisForTests(new MemoryRedis(clock.now));
  });

  afterEach(() => __setRedisForTests(null));

  it("round-trips the payload untouched", async () => {
    await putSession("table", "t1", "user-A", STATE, 300);
    expect(await getSession<DrillState>("table", "t1", "user-A")).toEqual(STATE);
  });

  it("expires with its TTL", async () => {
    await putSession("drill", "ttl", "user-A", STATE, 300);

    clock.advance(299);
    expect(await getSession("drill", "ttl", "user-A")).toEqual(STATE);

    clock.advance(2);
    expect(await getSession("drill", "ttl", "user-A")).toBeNull();
  });

  it("deletes a session", async () => {
    await putSession("drill", "d1", "user-A", STATE, 300);
    expect(await deleteSession("drill", "d1")).toBe(true);
    expect(await getSession("drill", "d1", "user-A")).toBeNull();
  });

  it("handles payloads that are not objects", async () => {
    await putSession("diagnosis", "n1", "user-A", 42, 300);
    expect(await getSession<number>("diagnosis", "n1", "user-A")).toBe(42);
  });
});

describe("session degradation", () => {
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

  it("reports a failed write rather than throwing", async () => {
    // The caller must be able to tell, because a lost write is a session that
    // vanishes mid-hand.
    await expect(putSession("drill", "x", "user-A", STATE, 300)).resolves.toBe(false);
  });

  it("reads as a miss rather than throwing", async () => {
    await expect(getSession("drill", "x", "user-A")).resolves.toBeNull();
  });

  it("never fails open on a read", async () => {
    // A Redis error must never be mistaken for a valid session.
    expect(await getSession("drill", "x", "anyone")).toBeNull();
  });

  it("survives malformed stored data", async () => {
    const port = new MemoryRedis();
    await port.set("sess:drill:corrupt", "{not json");
    __setRedisForTests(port);

    await expect(getSession("drill", "corrupt", "user-A")).resolves.toBeNull();
  });
});
