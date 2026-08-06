import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";

/**
 * The explanation endpoint over real HTTP.
 *
 * Three things can only be checked here: that the response actually streams
 * rather than arriving as one buffered lump, that the first text lands fast
 * enough to feel alive, and that an unanswered or someone else's spot is
 * refused before a single token is spent.
 */

loadLocalEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CONFIGURED = SUPABASE_URL !== "" && SERVICE_KEY !== "";

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+explain${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  created.push(id);

  const { error: subError } = await admin.from("subscriptions").insert({
    user_id: id,
    status: "active",
    price_id: "price_e2e",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  if (subError !== null) throw subError;

  return { id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  // Generous on purpose. Under a loaded dev server with parallel workers this
  // redirect chain — middleware, entitlement check, render — regularly takes
  // ten seconds, and a 5s default turns that into a fake product failure.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Plays one spot to completion and returns its id and the action taken. */
async function playOne(request: APIRequestContext): Promise<{ spotId: string; action: string }> {
  const response = await request.post("/api/drills/next", {
    data: { config: { type: "preflop" } },
  });
  const body = (await response.json()) as { spotId: string; spot: { legalActions: string[] } };
  const action = body.spot.legalActions[0] ?? "fold";

  await request.post("/api/drills/answer", {
    data: { spotId: body.spotId, action, timeMs: 1400 },
  });

  return { spotId: body.spotId, action };
}

interface Streamed {
  status: number;
  contentType: string;
  events: { type: string; text?: string; source?: string }[];
  text: string;
  firstTextMs: number;
  totalMs: number;
}

async function explain(
  request: APIRequestContext,
  spotId: string,
  action: string,
): Promise<Streamed> {
  const startedAt = Date.now();
  const response = await request.post("/api/coach/explain", { data: { spotId, action } });
  const raw = await response.text();
  const totalMs = Date.now() - startedAt;

  const events = raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as { type: string; text?: string; source?: string });

  let text = "";
  for (const event of events) {
    if (event.type === "text") text += event.text ?? "";
    if (event.type === "reset") text = "";
  }

  return {
    status: response.status(),
    contentType: response.headers()["content-type"] ?? "",
    events,
    text: text.trim(),
    // Playwright buffers the body, so this is the whole-response time. The
    // per-sentence timing is measured in tests/unit/explain-stream.test.ts,
    // where the model can be paced deterministically.
    firstTextMs: totalMs,
    totalMs,
  };
}

test.describe("post-hand explanation", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(async ({ browser }) => {
    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    if (!CONFIGURED) return;

    // Warm the routes once. The first hit on /api/coach/explain pays for
    // Turbopack compiling it — around 9s of dev server, none of it product —
    // and under parallel workers that compile blows past the request timeout in
    // whichever test happens to arrive first.
    const context = await browser.newContext();
    const page = await context.newPage();
    const { email } = await makeEntitledUser("warm");
    await login(page, email);
    const { spotId, action } = await playOne(page.request);
    await explain(page.request, spotId, action);
    await context.close();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("streams NDJSON and ends with a done event", async ({ page }) => {
    const { email } = await makeEntitledUser("stream");
    await login(page, email);
    const { spotId, action } = await playOne(page.request);

    const result = await explain(page.request, spotId, action);

    expect(result.status).toBe(200);
    expect(result.contentType).toContain("application/x-ndjson");

    const last = result.events.at(-1);
    expect(last?.type, "the stream ended without a done event").toBe("done");
    expect(result.text.length).toBeGreaterThan(20);

    console.log(
      `EXPLANATION (${last?.source}, ${result.totalMs}ms):\n  ${result.text}\n` +
        `  events: ${result.events.map((e) => e.type).join(" -> ")}`,
    );
  });

  test("the first sentence reaches the browser in under 1.5s", async ({ page }) => {
    // THE PLAN'S BUDGET IS FIRST-TOKEN LATENCY, and this measures exactly that:
    // a real fetch inside the page, reading the stream, stopping the clock on
    // the first `text` event. Playwright's APIRequestContext buffers the whole
    // body, so an earlier version of this test timed the ENTIRE generation and
    // called it first-token — which passed only while the model happened to be
    // fast, and started failing at ~2.0s when gemini-flash-lite got slower
    // WITHOUT the user-visible latency changing at all. The number it was
    // asserting was never the number that matters.
    //
    // Total generation time is asserted separately below, against a budget that
    // reflects what a full explanation actually costs.
    const { email } = await makeEntitledUser("fast");
    await login(page, email);

    const { spotId, action } = await playOne(page.request);

    const timings = await page.evaluate(
      async ({ spotId, action }) => {
        const startedAt = performance.now();
        const response = await fetch("/api/coach/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ spotId, action }),
        });

        const reader = response.body?.getReader();
        if (reader === undefined) return { firstTextMs: -1, totalMs: -1 };

        const decoder = new TextDecoder();
        let buffer = "";
        let firstTextMs = -1;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          if (firstTextMs < 0) {
            for (const line of buffer.split("\n")) {
              if (line.trim() === "") continue;
              try {
                if ((JSON.parse(line) as { type: string }).type === "text") {
                  firstTextMs = performance.now() - startedAt;
                  break;
                }
              } catch {
                // A partial line. Wait for the rest of it.
              }
            }
          }
        }

        return { firstTextMs, totalMs: performance.now() - startedAt };
      },
      { spotId, action },
    );

    console.log(
      `FIRST SENTENCE: ${Math.round(timings.firstTextMs)}ms · WHOLE EXPLANATION: ${Math.round(timings.totalMs)}ms`,
    );

    expect(timings.firstTextMs, "no text event ever arrived").toBeGreaterThan(0);
    expect(
      timings.firstTextMs,
      `first sentence took ${Math.round(timings.firstTextMs)}ms`,
    ).toBeLessThan(1500);

    // The whole thing, against an honest budget. Generous because it is a live
    // model call over the network, and tight enough to catch a real regression
    // such as the retry stack that once turned one call into nine.
    expect(
      timings.totalMs,
      `the whole explanation took ${Math.round(timings.totalMs)}ms`,
    ).toBeLessThan(6000);
  });

  test("a repeat of the same spot is served from cache", async ({ page }) => {
    const { email } = await makeEntitledUser("cache");
    await login(page, email);
    const { spotId, action } = await playOne(page.request);

    const first = await explain(page.request, spotId, action);
    const second = await explain(page.request, spotId, action);

    const firstSource = first.events.at(-1)?.source;
    const secondSource = second.events.at(-1)?.source;

    console.log(
      `FIRST: ${firstSource} in ${first.totalMs}ms · REPEAT: ${secondSource} in ${second.totalMs}ms`,
    );

    // With no Gemini key both come from the template, which is not cached —
    // caching a fallback would serve it for thirty days. The invariant that
    // holds either way is that the same spot yields the same text.
    expect(second.text).toBe(first.text);
    if (firstSource === "model") expect(secondSource).toBe("cache");
  });

  test("SECURITY — an unanswered spot cannot be explained", async ({ page }) => {
    const { email } = await makeEntitledUser("unanswered");
    await login(page, email);

    const response = await page.request.post("/api/drills/next", {
      data: { config: { type: "preflop" } },
    });
    const body = (await response.json()) as { spotId: string; spot: { legalActions: string[] } };

    const explained = await page.request.post("/api/coach/explain", {
      data: { spotId: body.spotId, action: body.spot.legalActions[0] ?? "fold" },
    });

    expect(explained.status()).toBe(409);
    expect((await explained.json()).error).toBe("not_answered_yet");
  });

  test("SECURITY — another user's spot cannot be explained", async ({ page, browser }) => {
    const owner = await makeEntitledUser("owner");
    await login(page, owner.email);
    const { spotId, action } = await playOne(page.request);

    const attackerContext = await browser.newContext();
    const attackerPage = await attackerContext.newPage();
    const attacker = await makeEntitledUser("attacker");
    await login(attackerPage, attacker.email);

    const stolen = await attackerPage.request.post("/api/coach/explain", {
      data: { spotId, action },
    });
    expect(stolen.status()).toBe(404);

    await attackerContext.close();
  });

  test("SECURITY — the stream carries no strategy the client did not earn", async ({ page }) => {
    // The user has already answered, so the mix is legitimately theirs. What
    // must never appear is the machinery: the node reference or the seed.
    const { email } = await makeEntitledUser("leak");
    await login(page, email);
    const { spotId, action } = await playOne(page.request);

    const response = await page.request.post("/api/coach/explain", { data: { spotId, action } });
    const raw = await response.text();

    for (const forbidden of ["nodeRef", "seed", "handKey"]) {
      expect(raw, `${forbidden} appears in the stream`).not.toContain(`"${forbidden}"`);
    }
  });
});
