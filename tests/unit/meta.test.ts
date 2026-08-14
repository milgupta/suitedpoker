/**
 * Meta attribution: hashing, deduplication, and the retry queue.
 *
 * Every assertion here maps to a way an ad account gets quietly ruined. A wrong
 * hash reports good match quality and matches nobody. Two ids for one sale
 * halves the reported cost per acquisition. A dropped Purchase permanently
 * mis-trains the optimiser against the people who actually bought.
 */

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attributionFromQuery,
  ATTRIBUTION_MAX_AGE_DAYS,
  EMPTY_ATTRIBUTION,
  FBCLID_MAX_LENGTH,
  fbcFromClickId,
  formatSuppressedEvent,
  isValidEventTime,
  mergeAttribution,
  metaDelivery,
  normaliseForHash,
  purchaseEventId,
  withDerivedFbc,
  type Attribution,
} from "../../src/lib/meta";
import {
  nextAttributionCookie,
  parseAttributionCookie,
  serialiseAttributionCookie,
} from "../../src/lib/attribution";
import { MemoryRedis, __setRedisForTests } from "../../src/lib/redis";
import { PLANS } from "../../src/lib/stripe/plans";

const NOW = Date.UTC(2026, 7, 6, 12, 0, 0);

beforeEach(() => {
  __setRedisForTests(new MemoryRedis());
});

afterEach(() => {
  __setRedisForTests(null);
  vi.unstubAllEnvs();
});

/* ── hashing ─────────────────────────────────────────────────────────────── */

describe("PII hashing", () => {
  it("normalises exactly as Meta specifies: trim then lowercase", () => {
    expect(normaliseForHash("  Alice@Example.COM ")).toBe("alice@example.com");
  });

  it("produces the SHA-256 of the normalised value — verified by hand", async () => {
    const { hashPii } = await import("../../src/lib/meta-capi");

    // Computed independently here rather than by calling the same helper, so
    // this cannot agree with itself while both are wrong.
    const expected = createHash("sha256").update("alice@example.com").digest("hex");
    expect(hashPii("  Alice@Example.COM ")).toBe(expected);

    // And pinned to a literal computed OUTSIDE this codebase entirely
    // (`printf 'alice@example.com' | shasum -a 256`), so a change to the
    // normalisation shows up here rather than as poor match quality in Meta's
    // dashboard three days after launch.
    expect(hashPii("alice@example.com")).toBe(
      "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976",
    );
  });

  it("hashes the email and leaves fbp/fbc verbatim", async () => {
    const { buildUserData } = await import("../../src/lib/meta-capi");

    const data = buildUserData({
      email: "Bob@Example.com",
      attribution: { fbp: "fb.1.123.456", fbc: "fb.1.123.abc" },
    });

    expect(data.em?.[0]).toMatch(/^[a-f0-9]{64}$/);
    // NOT hashed. Meta matches these verbatim, and hashing them produces a
    // payload that is accepted and matches nothing.
    expect(data.fbp).toBe("fb.1.123.456");
    expect(data.fbc).toBe("fb.1.123.abc");
  });

  it("never puts a raw email in the payload", async () => {
    const { buildUserData } = await import("../../src/lib/meta-capi");
    const data = buildUserData({ email: "leak@example.com" });
    expect(JSON.stringify(data)).not.toContain("leak@example.com");
  });

  it("omits fields it does not have rather than sending empty strings", async () => {
    const { buildUserData } = await import("../../src/lib/meta-capi");
    const data = buildUserData({ email: null, attribution: null });
    expect(Object.keys(data)).toEqual([]);
  });
});

/* ── deduplication ───────────────────────────────────────────────────────── */

describe("deduplication", () => {
  it("derives a stable purchase id from the Stripe event id", () => {
    // A webhook retry must not mint a second id and report a second sale.
    expect(purchaseEventId("evt_123")).toBe(purchaseEventId("evt_123"));
    expect(purchaseEventId("evt_123")).not.toBe(purchaseEventId("evt_456"));
  });

  it("puts the same id on both halves of one conversion", async () => {
    const { buildEvent } = await import("../../src/lib/meta-capi");

    // The browser mints this at checkout; the webhook receives it through
    // Stripe metadata. Both events carry it, and Meta collapses them into one.
    const shared = "purchase_abc-123";
    const server = buildEvent({
      eventName: "Purchase",
      eventId: shared,
      userData: {},
      nowMs: NOW,
    });

    expect(server.event_id).toBe(shared);
  });
});

/* ── the event payload ───────────────────────────────────────────────────── */

describe("the event payload", () => {
  it("sends event_time in SECONDS, not milliseconds", async () => {
    const { buildEvent } = await import("../../src/lib/meta-capi");
    const event = buildEvent({
      eventName: "Lead",
      eventId: "lead_1",
      userData: {},
      nowMs: NOW,
    });

    // Meta silently rejects milliseconds, and the symptom is "no events
    // received" rather than "bad timestamp".
    expect(event.event_time).toBe(Math.floor(NOW / 1000));
    expect(String(event.event_time)).toHaveLength(10);
  });

  it("rejects a timestamp Meta would refuse", () => {
    const nowSeconds = Math.floor(NOW / 1000);
    expect(isValidEventTime(nowSeconds, NOW)).toBe(true);
    expect(isValidEventTime(nowSeconds - 6 * 86_400, NOW)).toBe(true);
    expect(isValidEventTime(nowSeconds - 8 * 86_400, NOW)).toBe(false);
    expect(isValidEventTime(nowSeconds + 3600, NOW)).toBe(false);
  });

  it("marks a webhook Purchase as system_generated, not website", async () => {
    const { buildEvent } = await import("../../src/lib/meta-capi");
    const event = buildEvent({
      eventName: "Purchase",
      eventId: "p1",
      userData: {},
      actionSource: "system_generated",
      nowMs: NOW,
    });
    // There is no browser in a webhook, and claiming otherwise is a payload
    // Meta will accept and quietly distrust.
    expect(event.action_source).toBe("system_generated");
  });

  it("carries the EXACT Stripe amount for both plans", async () => {
    const { buildEvent } = await import("../../src/lib/meta-capi");

    for (const plan of ["monthly", "annual"] as const) {
      const value = PLANS[plan].amountCents / 100;
      const event = buildEvent({
        eventName: "Purchase",
        eventId: `p_${plan}`,
        userData: {},
        customData: { value, currency: "USD" },
        nowMs: NOW,
      });

      expect(event.custom_data?.value).toBe(value);
      // Sanity against the real prices: a rounded value makes every ROAS
      // figure in Ads Manager wrong.
      expect(event.custom_data?.value).toBe(plan === "annual" ? 119.99 : 24.99);
    }
  });
});

/* ── attribution capture ─────────────────────────────────────────────────── */

describe("attribution capture", () => {
  it("reads fbclid and every UTM off the landing URL", () => {
    const url = new URL(
      "https://suitedpoker.com/?fbclid=IwAR123&utm_source=meta&utm_medium=paid&utm_campaign=cold_1&utm_content=video_a&utm_term=gto",
    );
    const found = attributionFromQuery(url.searchParams, NOW);

    expect(found.fbclid).toBe("IwAR123");
    expect(found.utmSource).toBe("meta");
    expect(found.utmMedium).toBe("paid");
    expect(found.utmCampaign).toBe("cold_1");
    expect(found.utmContent).toBe("video_a");
    expect(found.utmTerm).toBe("gto");
  });

  it("reconstructs fbc from a click id in Meta's exact format", () => {
    // The pixel writes this cookie; an adblocker stops it while the ?fbclid=
    // still arrives. Reconstructing it keeps match quality up for exactly the
    // users the pixel already failed to see.
    expect(fbcFromClickId("IwAR123", NOW)).toBe(`fb.1.${NOW}.IwAR123`);
    expect(attributionFromQuery(new URL("https://x.test/?fbclid=abc").searchParams, NOW).fbc).toBe(
      `fb.1.${NOW}.abc`,
    );
  });

  it("caps an absurd UTM rather than writing it", () => {
    const url = new URL(`https://x.test/?utm_source=${"a".repeat(5000)}`);
    expect(attributionFromQuery(url.searchParams, NOW).utmSource).toHaveLength(200);
  });

  it("keeps the FIRST touch when a second one arrives", () => {
    // The ad that acquired someone does not change because they later arrived
    // from a Google search. Overwriting credits the channel that closed rather
    // than the one that paid.
    const first = mergeAttribution(EMPTY_ATTRIBUTION, { utmSource: "meta", fbclid: "abc" });
    const second = mergeAttribution(first, { utmSource: "google", utmMedium: "organic" });

    expect(second.utmSource).toBe("meta");
    expect(second.fbclid).toBe("abc");
    // A field that was empty is still fillable.
    expect(second.utmMedium).toBe("organic");
  });

  it("survives a round trip through the cookie", () => {
    const attribution = mergeAttribution(EMPTY_ATTRIBUTION, {
      fbclid: "abc",
      utmSource: "meta",
      utmCampaign: "cold 1 / variant b",
    });

    const restored = parseAttributionCookie(serialiseAttributionCookie(attribution));
    expect(restored.fbclid).toBe("abc");
    expect(restored.utmCampaign).toBe("cold 1 / variant b");
  });

  it("treats a corrupt cookie as no attribution rather than an error", () => {
    // A broken cookie must never stop someone signing up.
    expect(parseAttributionCookie("not json")).toEqual(EMPTY_ATTRIBUTION);
    expect(parseAttributionCookie("%%%")).toEqual(EMPTY_ATTRIBUTION);
  });

  it("writes nothing when there is nothing to write", () => {
    // Skipping Set-Cookie on the overwhelming majority of requests.
    expect(
      nextAttributionCookie(undefined, new URL("https://x.test/dashboard"), {}, NOW),
    ).toBeNull();
  });

  it("writes on the landing hit and then stops", () => {
    const landing = new URL("https://x.test/?utm_source=meta&fbclid=abc");
    const cookie = nextAttributionCookie(undefined, landing, {}, NOW);
    expect(cookie).not.toBeNull();

    // Same parameters again: first touch already recorded, nothing changes.
    expect(nextAttributionCookie(cookie!, landing, {}, NOW)).toBeNull();
  });

  it("picks up Meta's own _fbp cookie when the pixel did run", () => {
    const cookie = nextAttributionCookie(
      undefined,
      new URL("https://x.test/"),
      { fbp: "fb.1.999.111" },
      NOW,
    );
    expect(parseAttributionCookie(cookie!).fbp).toBe("fb.1.999.111");
  });

  it("persists for 30 days", () => {
    expect(ATTRIBUTION_MAX_AGE_DAYS).toBe(30);
  });
});

/* ── retries ─────────────────────────────────────────────────────────────── */

describe("failures are queued, never dropped", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function configure() {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1234567890");
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "test-token");
    // The retry machinery only runs when the event is actually being sent.
    // Without this every assertion below would pass vacuously against a gate
    // that suppressed the request before it was ever attempted.
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("META_TEST_EVENT_CODE", undefined);
  }

  it("backs off between attempts", async () => {
    const { backoffMs } = await import("../../src/lib/meta-capi");
    expect(backoffMs(1)).toBe(1_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(3)).toBe(16_000);
  });

  it("retries a 500 and then queues it", async () => {
    configure();
    vi.resetModules();
    const { sendEvent, queuedEvents } = await import("../../src/lib/meta-capi");

    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      return Promise.resolve(new Response("upstream down", { status: 503 }));
    }) as typeof fetch;

    const result = await sendEvent({
      eventName: "Purchase",
      eventId: "p_retry",
      userData: {},
      nowMs: Date.now(),
      // Injected so the test does not actually wait 21 seconds.
      sleep: () => Promise.resolve(),
    });

    expect(calls).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.queued, "a dropped Purchase mis-optimises the ad account").toBe(true);

    const queue = await queuedEvents();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.event.event_id).toBe("p_retry");
  });

  it("does NOT retry a 400 — a malformed payload stays malformed", async () => {
    configure();
    vi.resetModules();
    const { sendEvent, queuedEvents } = await import("../../src/lib/meta-capi");

    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      return Promise.resolve(new Response("bad field", { status: 400 }));
    }) as typeof fetch;

    const result = await sendEvent({
      eventName: "Lead",
      eventId: "l_bad",
      userData: {},
      nowMs: Date.now(),
      sleep: () => Promise.resolve(),
    });

    expect(calls).toBe(1);
    expect(result.queued).toBe(false);
    expect(await queuedEvents()).toHaveLength(0);
  });

  it("drains the queue once Meta answers again", async () => {
    configure();
    vi.resetModules();
    const { sendEvent, drainQueue, queuedEvents } = await import("../../src/lib/meta-capi");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("down", { status: 503 }))) as typeof fetch;
    await sendEvent({
      eventName: "Purchase",
      eventId: "p_drain",
      userData: {},
      nowMs: Date.now(),
      sleep: () => Promise.resolve(),
    });
    expect(await queuedEvents()).toHaveLength(1);

    globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 200 }))) as typeof fetch;
    const drained = await drainQueue();

    expect(drained.sent).toBe(1);
    expect(drained.kept).toBe(0);
    expect(await queuedEvents()).toHaveLength(0);
  });

  it("gives up rather than retrying an event Meta will no longer accept", async () => {
    configure();
    vi.resetModules();
    const { sendEvent, drainQueue, MAX_ATTEMPTS } = await import("../../src/lib/meta-capi");

    globalThis.fetch = (() =>
      Promise.resolve(new Response("down", { status: 503 }))) as typeof fetch;

    await sendEvent({
      eventName: "Purchase",
      eventId: "p_giveup",
      userData: {},
      nowMs: Date.now(),
      sleep: () => Promise.resolve(),
    });

    // Each drain increments the attempt count; past the cap it stops, so a
    // permanently failing event cannot starve the live ones behind it.
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await drainQueue();
    const { queuedEvents: after } = await import("../../src/lib/meta-capi");
    expect(await after()).toHaveLength(0);
  });

  it("does nothing at all when the pixel is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "");
    vi.resetModules();
    const { sendEvent } = await import("../../src/lib/meta-capi");

    let called = false;
    globalThis.fetch = (() => {
      called = true;
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    const result = await sendEvent({
      eventName: "Lead",
      eventId: "l1",
      userData: {},
      nowMs: Date.now(),
    });

    expect(called).toBe(false);
    expect(result.reason).toBe("not_configured");
  });
});

/* ── the environment gate ────────────────────────────────────────────────── */

/**
 * There is ONE Meta dataset and it cannot be cleaned.
 *
 * 1.5K events reached it from localhost before this gate existed. Every one is
 * a conversion the optimiser now believes in, attributed to a person who never
 * paid — and the only remedy is to dilute it with real data. These assertions
 * are the reason that cannot happen again.
 */
describe("only production may reach the live dataset", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function configured() {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1234567890");
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "test-token");
    // Explicitly absent unless a test sets it — otherwise a developer's own
    // META_TEST_EVENT_CODE would flip these from "log" to "test" and the
    // suppression assertions would pass for the wrong reason.
    vi.stubEnv("META_TEST_EVENT_CODE", undefined);
  }

  it("sends on a production deploy and nowhere else", () => {
    expect(metaDelivery("production")).toBe("send");
    expect(metaDelivery("preview")).toBe("log");
    expect(metaDelivery("development")).toBe("log");
    // A laptop, CI, any non-Vercel host. FAILS CLOSED — the cost of being wrong
    // this way is a missing log line; the other way is permanent.
    expect(metaDelivery(undefined)).toBe("log");
    expect(metaDelivery("")).toBe("log");
    expect(metaDelivery(null)).toBe("log");
  });

  it("routes to Test Events when a code is set, OUTSIDE production only", () => {
    // The deliberate opt-out of the console: watch events land in Events
    // Manager instead of reading them in a terminal. Meta excludes test-coded
    // events from reporting and optimisation, so nothing is diluted.
    expect(metaDelivery(undefined, "TEST12345")).toBe("test");
    expect(metaDelivery("preview", "TEST12345")).toBe("test");

    // PRODUCTION IGNORES IT. A test-coded Purchase is a Purchase Meta never
    // counts — the build already refuses this env, and this is the runtime
    // backstop under that refusal.
    expect(metaDelivery("production", "TEST12345")).toBe("send");

    // An empty or whitespace value is not a code.
    expect(metaDelivery(undefined, "")).toBe("log");
    expect(metaDelivery(undefined, "   ")).toBe("log");
    expect(metaDelivery(undefined, null)).toBe("log");
  });

  it("attaches the test code, and only when the code put it in test mode", async () => {
    configured();
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("META_TEST_EVENT_CODE", "TEST12345");
    vi.resetModules();
    const { sendEvent } = await import("../../src/lib/meta-capi");

    let body: { test_event_code?: string } = {};
    globalThis.fetch = ((_url: string, init: { body: string }) => {
      body = JSON.parse(init.body) as { test_event_code?: string };
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;

    const result = await sendEvent({
      eventName: "Lead",
      eventId: "l_test_events",
      userData: {},
      nowMs: Date.now(),
    });

    expect(body.test_event_code).toBe("TEST12345");
    // Reached Meta, but NOT reporting. Calling this "sent" would make a test
    // run read as a conversion in every log and every downstream assertion.
    expect(result.delivery).toBe("test");
  });

  it("never attaches a test code to a real production conversion", async () => {
    // env-required.ts refuses this build; this is the runtime backstop for the
    // env var landing in the wrong Vercel scope.
    configured();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("META_TEST_EVENT_CODE", "TEST12345");
    vi.resetModules();
    const { sendEvent } = await import("../../src/lib/meta-capi");

    let body: { test_event_code?: string } = {};
    globalThis.fetch = ((_url: string, init: { body: string }) => {
      body = JSON.parse(init.body) as { test_event_code?: string };
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;

    const result = await sendEvent({
      eventName: "Purchase",
      eventId: "p_prod",
      userData: {},
      nowMs: Date.now(),
    });

    expect(body.test_event_code).toBeUndefined();
    expect(result.delivery).toBe("sent");
  });

  it("never opens a socket to Meta from a laptop", async () => {
    configured();
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    vi.resetModules();
    const { sendEvent } = await import("../../src/lib/meta-capi");

    let called = false;
    globalThis.fetch = (() => {
      called = true;
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    const result = await sendEvent({
      eventName: "Purchase",
      eventId: "p_local",
      userData: { fbc: `fb.1.${NOW}.abc` },
      nowMs: Date.now(),
    });

    expect(called).toBe(false);
    // Not a failure — nothing to retry, nothing to queue.
    expect(result.delivery).toBe("logged");
    expect(result.queued).toBe(false);
    expect(await (await import("../../src/lib/meta-capi")).queuedEvents()).toHaveLength(0);
  });

  it("suppresses a PREVIEW deploy too — NODE_ENV cannot tell the two apart", async () => {
    configured();
    // Exactly the case a NODE_ENV check would wave through: a preview build is
    // also NODE_ENV=production.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.resetModules();
    const { sendEvent } = await import("../../src/lib/meta-capi");

    let called = false;
    globalThis.fetch = (() => {
      called = true;
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    const result = await sendEvent({
      eventName: "Lead",
      eventId: "l_preview",
      userData: {},
      nowMs: Date.now(),
    });

    expect(called).toBe(false);
    expect(result.delivery).toBe("logged");
  });

  it("posts for real when VERCEL_ENV is production", async () => {
    configured();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();
    const { sendEvent } = await import("../../src/lib/meta-capi");

    let url = "";
    globalThis.fetch = ((input: string) => {
      url = String(input);
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;

    const result = await sendEvent({
      eventName: "Lead",
      eventId: "l_prod",
      userData: {},
      nowMs: Date.now(),
    });

    expect(result.delivery).toBe("sent");
    expect(url).toContain("graph.facebook.com");
  });

  it("will not let a queue written elsewhere drain from a laptop", async () => {
    // The second, independent force-off. A queue can outlive the process that
    // wrote it, and `drainQueue` runs from a cron that does not build an event.
    configured();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.resetModules();

    const failing = await import("../../src/lib/meta-capi");
    globalThis.fetch = (() =>
      Promise.resolve(new Response("boom", { status: 500 }))) as typeof fetch;
    await failing.sendEvent({
      eventName: "Purchase",
      eventId: "p_queued",
      userData: {},
      nowMs: Date.now(),
      sleep: () => Promise.resolve(),
    });
    expect(await failing.queuedEvents()).toHaveLength(1);

    // Same Redis, now on a laptop.
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.resetModules();
    const local = await import("../../src/lib/meta-capi");

    let called = false;
    globalThis.fetch = (() => {
      called = true;
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    await local.drainQueue();
    expect(called).toBe(false);
  });

  it("prints the match-quality fields, and never a raw email", () => {
    const line = formatSuppressedEvent(
      {
        event_name: "Purchase",
        event_time: Math.floor(NOW / 1000),
        event_id: "p_1",
        action_source: "system_generated",
        user_data: {
          em: [createHash("sha256").update("alice@example.com").digest("hex")],
          fbc: `fb.1.${NOW}.abc`,
          fbp: "fb.1.999.111",
        },
        custom_data: { value: 39.99, currency: "USD" },
      },
      undefined,
    );

    // "did it fire, and did it carry an fbc" is the whole question.
    expect(line).toContain("SUPPRESSED");
    expect(line).toContain("Purchase");
    expect(line).toContain(`fbc=fb.1.${NOW}.abc`);
    expect(line).toContain("fbp=fb.1.999.111");
    expect(line).toContain("no VERCEL_ENV");
    expect(line).not.toContain("alice@example.com");
  });
});

/* ── fbc coverage ────────────────────────────────────────────────────────── */

/**
 * Meta scores Event Match Quality largely on fbc. A click id captured and then
 * dropped before the event goes out is a click the ad account paid for and
 * cannot claim.
 */
describe("fbc coverage", () => {
  it("caps an absurd fbclid rather than writing it, and still derives fbc", () => {
    // Same reasoning as the UTM cap: this lands in a cookie and then in a
    // database column.
    const found = attributionFromQuery(
      new URL(`https://x.test/?fbclid=${"a".repeat(5000)}`).searchParams,
      NOW,
    );
    expect(found.fbclid).toHaveLength(FBCLID_MAX_LENGTH);
    expect(found.fbc).toBe(`fb.1.${NOW}.${"a".repeat(FBCLID_MAX_LENGTH)}`);
  });

  it("derives fbc from a stored fbclid that has none", () => {
    const derived = withDerivedFbc({ fbclid: "abc", fbc: null }, NOW);
    expect(derived.fbc).toBe(`fb.1.${NOW}.abc`);
  });

  it("never overwrites an fbc it already has", () => {
    // The stored one carries the REAL click time; re-deriving would stamp now
    // on a click that happened days ago.
    const kept = withDerivedFbc({ fbclid: "abc", fbc: "fb.1.111.abc" }, NOW);
    expect(kept.fbc).toBe("fb.1.111.abc");
  });

  it("invents nothing when there is no click id", () => {
    expect(withDerivedFbc({ fbclid: null, fbc: null }, NOW).fbc).toBeNull();
    expect(withDerivedFbc({} as Partial<Attribution>, NOW).fbc).toBeUndefined();
  });

  it("puts the derived fbc on the outgoing event", async () => {
    const { buildUserData } = await import("../../src/lib/meta-capi");
    const data = buildUserData({
      attribution: { fbclid: "abc", fbc: null },
      clickTimeMs: NOW,
    });
    expect(data.fbc).toBe(`fb.1.${NOW}.abc`);
  });

  it("fills an fbc the profile is missing from the request cookie", () => {
    // The (app) layout's capture can lose the race with a Lead fired during
    // onboarding, and its whole body is inside a catch. The cookie still has it.
    const profile = { ...EMPTY_ATTRIBUTION, utmSource: "meta" };
    const cookie = { ...EMPTY_ATTRIBUTION, fbc: `fb.1.${NOW}.abc`, fbclid: "abc" };

    const merged = mergeAttribution(profile, cookie);
    expect(merged.fbc).toBe(`fb.1.${NOW}.abc`);
    // First touch still wins: the cookie can only ever ADD.
    expect(merged.utmSource).toBe("meta");
  });
});
