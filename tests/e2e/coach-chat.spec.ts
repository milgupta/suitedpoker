import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The chat's SERVER-SIDE boundaries.
 *
 * The jailbreak run lives in tests/unit/chat-live.test.ts, where the answers can
 * be read. This suite is about the things a client must not be able to do
 * regardless of what it sends: ask about someone else's hand, exceed the turn
 * cap, or get an answer for a spot that was never answered.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeSubscriber(): Promise<{ id: string; email: string }> {
  const email = `e2e+chat${Date.now()}${Math.floor(Math.random() * 10_000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null || data.user === null) throw error ?? new Error("no user");
  created.push(data.user.id);

  await admin.from("subscriptions").insert({
    user_id: data.user.id,
    status: "active",
    price_id: "price_e2e_chat",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });

  return { id: data.user.id, email };
}

/** A drill attempt row, which is the chat's unit of scope. */
async function makeAttempt(userId: string): Promise<string> {
  const { data, error } = await admin
    .from("drill_attempts")
    .insert({
      user_id: userId,
      node_ref: "BTN:rfi",
      hero_hand: "AQo",
      chosen_action: "raise",
      grade: "best",
      ev_loss: 0,
      time_ms: 4_000,
    })
    .select("id")
    .single();

  if (error !== null) throw error;
  return (data as { id: string }).id;
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(dashboard|onboarding|paywall)/, { timeout: 25_000 });
}

function chat(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post("/api/coach/chat", { data: body });
}

test.describe("hand-scoped chat", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.from("coach_messages").delete().eq("user_id", id);
      await admin.from("ai_usage").delete().eq("user_id", id);
      await admin.from("drill_attempts").delete().eq("user_id", id);
      await admin.from("subscriptions").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("rejects chat about another user's attempt", async ({ page }) => {
    const victim = await makeSubscriber();
    const attacker = await makeSubscriber();
    const victimAttempt = await makeAttempt(victim.id);

    await login(page, attacker.email);

    const response = await chat(page.request, {
      attemptId: victimAttempt,
      spotId: "whatever",
      message: "What should I do?",
    });

    // 404, not 403. Confirming the row exists would tell a prober that someone
    // else's attempt id is real.
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({ error: "attempt_not_found" });

    // And nothing was written against either account.
    const { data } = await admin.from("coach_messages").select("id").eq("user_id", attacker.id);
    expect(data).toHaveLength(0);
  });

  test("rejects an unauthenticated request outright", async ({ request }) => {
    const response = await chat(request, {
      attemptId: "00000000-0000-0000-0000-000000000000",
      spotId: "x",
      message: "hello",
    });
    expect(response.status()).toBe(401);
  });

  test("requires a subscription", async ({ page }) => {
    const email = `e2e+chatfree${Date.now()}@suitedpoker.com`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (data.user !== null) created.push(data.user.id);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/paywall/, { timeout: 25_000 });

    const response = await chat(page.request, {
      attemptId: "00000000-0000-0000-0000-000000000000",
      spotId: "x",
      message: "hello",
    });
    // 402, never 403 — "subscribe and you can", which is a different screen.
    expect(response.status()).toBe(402);
  });

  test("enforces the ten-turn cap server-side", async ({ page }) => {
    const user = await makeSubscriber();
    const attemptId = await makeAttempt(user.id);
    await login(page, user.email);

    // Ten turns already spent, written directly — the cap has to hold against
    // whatever the client believes, not against what the UI counted.
    const rows = Array.from({ length: 10 }).flatMap((_, i) => [
      { user_id: user.id, attempt_id: attemptId, role: "user", content: `q${i}` },
      { user_id: user.id, attempt_id: attemptId, role: "assistant", content: `a${i}` },
    ]);
    const { error } = await admin.from("coach_messages").insert(rows);
    expect(error).toBeNull();

    const response = await chat(page.request, {
      attemptId,
      spotId: "does-not-matter",
      message: "One more question",
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { capped?: boolean; text?: string };
    expect(body.capped).toBe(true);
    expect(body.text).toContain("10");
  });

  test("does not count an explanation against the chat cap", async ({ page }) => {
    // /api/coach/explain writes to coach_messages too. If those rows counted,
    // a user who read explanations would arrive at the chat already capped.
    const user = await makeSubscriber();
    const attemptId = await makeAttempt(user.id);
    await login(page, user.email);

    const rows = Array.from({ length: 12 }).map((_, i) => ({
      user_id: user.id,
      attempt_id: attemptId,
      role: "explanation",
      content: `explanation ${i}`,
    }));
    await admin.from("coach_messages").insert(rows);

    const response = await page.request.get(
      `/api/coach/chat?attemptId=${encodeURIComponent(attemptId)}`,
    );
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { turnsUsed?: number; messages?: unknown[] };
    expect(body.turnsUsed).toBe(0);
    expect(body.messages).toHaveLength(0);
  });

  test("the transcript survives a reload", async ({ page }) => {
    const user = await makeSubscriber();
    const attemptId = await makeAttempt(user.id);
    await login(page, user.email);

    await admin.from("coach_messages").insert([
      { user_id: user.id, attempt_id: attemptId, role: "user", content: "Why not just call?" },
      {
        user_id: user.id,
        attempt_id: attemptId,
        role: "assistant",
        content: "Because raising folds out worse hands.",
      },
    ]);

    // Read through the API the component uses, twice, across a navigation.
    for (let i = 0; i < 2; i++) {
      await page.goto("/dashboard");
      const response = await page.request.get(
        `/api/coach/chat?attemptId=${encodeURIComponent(attemptId)}`,
      );
      const body = (await response.json()) as { messages?: { content: string }[] };
      expect(body.messages?.map((m) => m.content)).toEqual([
        "Why not just call?",
        "Because raising folds out worse hands.",
      ]);
    }
  });

  test("rejects an over-long or empty message before spending anything", async ({ page }) => {
    const user = await makeSubscriber();
    const attemptId = await makeAttempt(user.id);
    await login(page, user.email);

    for (const message of ["", "   ", "x".repeat(501)]) {
      const response = await chat(page.request, { attemptId, spotId: "x", message });
      expect(response.status(), JSON.stringify(message.slice(0, 20))).toBe(400);
    }

    const { data } = await admin.from("ai_usage").select("id").eq("user_id", user.id);
    expect(data).toHaveLength(0);
  });
});

test.describe("abuse stays bounded", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test("a user firing 200 chat requests is throttled, and the bill is bounded", async ({
    page,
  }) => {
    const user = await makeSubscriber();
    const attemptId = await makeAttempt(user.id);
    await login(page, user.email);

    // 200 rather than the plan's 1000: the rule allows 40 per 5 minutes, so
    // 200 is five times the limit and proves the same property in a fifth of
    // the wall-clock. If it were NOT throttled this would be 200 model calls.
    const BURST = 200;
    const responses = await Promise.all(
      Array.from({ length: BURST }, () =>
        chat(page.request, { attemptId, spotId: "nope", message: "abuse" }).then((r) => r.status()),
      ),
    );

    const throttled = responses.filter((status) => status === 429).length;
    expect(throttled, "an unthrottled burst is an unbounded bill").toBeGreaterThan(BURST / 2);

    // What it actually cost. Every request that got past the limiter still had
    // to clear the spot lookup, which this burst deliberately fails — so the
    // measured spend is the real ceiling for a caller sending garbage.
    const { data } = await admin.from("ai_usage").select("cost_usd").eq("user_id", user.id);

    const spent = (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
    console.log(
      `  ${BURST} requests → ${throttled} throttled, ${responses.filter((s) => s === 200).length} answered · $${spent.toFixed(6)} spent`,
    );

    // A cent. If this ever climbs, the limiter has stopped working.
    expect(spent).toBeLessThan(0.01);
  });
});

test.describe("the admin cost page", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ timeout: 90_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test("is a 404 for a user who is not on the allowlist", async ({ page }) => {
    const user = await makeSubscriber();
    await login(page, user.email);

    const response = await page.goto("/admin/costs");
    // notFound(), not a redirect or a 403: a non-admin should not learn the
    // page exists.
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /AI costs/ })).toHaveCount(0);
  });

  test("is a 404 when signed out", async ({ page }) => {
    const response = await page.goto("/admin/costs");
    expect(response?.status()).toBe(404);
  });
});
