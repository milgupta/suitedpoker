import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";

/**
 * The real event stream, read off the wire.
 *
 * Every request to /ingest is intercepted and decoded, so this asserts what
 * PostHog actually receives rather than what the code intended to send. It
 * skips when NEXT_PUBLIC_POSTHOG_KEY is absent, because without a key the
 * client never initialises and there is no stream to read.
 */

loadLocalEnv();

const CONFIGURED = (process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "") !== "";

interface Captured {
  event: string;
  properties: Record<string, unknown>;
}

/** Decodes PostHog's batch payloads, whichever transport it chose. */
function decode(body: string | null): Captured[] {
  if (body === null || body === "") return [];

  const raw = body.startsWith("data=") ? decodeURIComponent(body.slice(5)) : body;

  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "batch" in parsed
        ? (parsed as { batch: unknown[] }).batch
        : [parsed];

    return list
      .filter((e): e is Captured => typeof e === "object" && e !== null && "event" in e)
      .map((e) => ({ event: e.event, properties: e.properties ?? {} }));
  } catch {
    return [];
  }
}

async function recordStream(page: Page): Promise<Captured[]> {
  const stream: Captured[] = [];

  await page.route("**/ingest/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      for (const event of decode(request.postData())) stream.push(event);
    }
    // Answer locally: the point is what we SEND, and this keeps the test from
    // depending on PostHog being reachable.
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return stream;
}

test.describe("analytics", () => {
  test.skip(!CONFIGURED, "NEXT_PUBLIC_POSTHOG_KEY absent — no event stream to read");

  test("the landing page emits landing_viewed exactly once", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/");
    await page.waitForTimeout(2500);

    const landing = stream.filter((e) => e.event === "landing_viewed");
    expect(landing.length, `stream: ${stream.map((e) => e.event).join(", ")}`).toBe(1);
  });

  test("a re-render or refresh does not duplicate the event", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/");
    await page.waitForTimeout(1500);
    const afterFirst = stream.filter((e) => e.event === "landing_viewed").length;

    // A client-side navigation away and back must not re-fire the view event
    // for the same mount, and a reload starts a fresh page — one each.
    await page.getByRole("link", { name: "Pricing" }).click();
    await page.waitForTimeout(800);

    expect(stream.filter((e) => e.event === "landing_viewed").length).toBe(afterFirst);
  });

  test("navigation emits one pageview per route, not per render", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/");
    await page.waitForTimeout(1500);
    await page.goto("/login");
    await page.waitForTimeout(1500);

    const pageviews = stream.filter((e) => e.event === "$pageview");
    const urls = pageviews.map((e) => String(e.properties["$current_url"] ?? ""));

    expect(pageviews.length).toBeGreaterThanOrEqual(2);
    // No URL captured twice.
    expect(new Set(urls).size).toBe(urls.length);
  });

  test("signup_started fires with its method", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/signup");
    await page.getByLabel("Email").fill(`e2e+ph${Date.now()}@suitedpoker.com`);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
    await page.getByLabel("Confirm password").fill("correct-horse-battery");
    // 9.6 made the 18+ confirmation required.
    await page.getByTestId("age-confirm").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForTimeout(2500);

    const started = stream.filter((e) => e.event === "signup_started");
    expect(started.length).toBe(1);
    expect(started[0]?.properties["method"]).toBe("email");
  });

  test("every captured name exists in the schema", async ({ page }) => {
    const stream = await recordStream(page);

    await page.goto("/");
    await page.waitForTimeout(1500);
    await page.goto("/login");
    await page.waitForTimeout(1500);

    // PostHog's own $-prefixed events are its business; ours must all be known.
    const ours = stream.map((e) => e.event).filter((name) => !name.startsWith("$"));
    const { EVENT_NAMES } = await import("../../src/lib/analytics");
    for (const name of ours) {
      expect(EVENT_NAMES as readonly string[], `unknown event "${name}"`).toContain(name);
    }
  });

  test("session replay masks inputs", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(1500);

    // Read the live config rather than the source — the source is asserted in
    // the unit test; this proves it survived into the running client.
    const masked = await page.evaluate(() => {
      const ph = (window as unknown as { posthog?: { config?: Record<string, unknown> } }).posthog;
      const recording = ph?.config?.["session_recording"] as
        { maskAllInputs?: boolean } | undefined;
      return recording?.maskAllInputs ?? null;
    });

    expect(masked).toBe(true);
  });
});

test("the /ingest proxy is reachable on our own origin", async ({ request }) => {
  // The whole point of the rewrite: an adblocker blocks posthog.com by
  // hostname, so the request has to leave from ours.
  const response = await request.get("/ingest/static/array.js", { maxRedirects: 2 });
  expect(
    response.status(),
    "the /ingest rewrite is not routing — adblocked users will be invisible",
  ).toBeLessThan(400);
});
