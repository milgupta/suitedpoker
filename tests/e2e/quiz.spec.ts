import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The poker-maths quiz against the real stack.
 *
 * The checks that can only be made over HTTP: the raw /next body carries no
 * answer, a question cannot be answered twice, the grade comes from the server
 * rather than the body, and the whole loop renders.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();
const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(): Promise<{ id: string; email: string }> {
  const email = `e2e+quiz${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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
  await expect(page).toHaveURL(/\/practice/, { timeout: 30_000 });
}

async function nextQuestion(request: APIRequestContext): Promise<{
  status: number;
  body: Record<string, unknown>;
  raw: string;
}> {
  const response = await request.post("/api/quiz/next", { data: {} });
  const raw = await response.text();
  return {
    status: response.status(),
    body: raw === "" ? {} : (JSON.parse(raw) as Record<string, unknown>),
    raw,
  };
}

test.describe("poker-maths quiz", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("SECURITY — the raw /next body carries no answer", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    const { status, body, raw } = await nextQuestion(page.request);
    expect(status).toBe(200);

    // Scanned as a STRING, so an answer buried in a nested field is caught too.
    for (const forbidden of ["correctIndex", "exactPercent", "explanation", "seed"]) {
      expect(raw, `${forbidden} reached the client`).not.toContain(forbidden);
    }

    const question = body.question as Record<string, unknown>;
    expect(Array.isArray(question.options)).toBe(true);
    expect((question.options as number[]).length).toBe(3);
  });

  test("grades on the server and refuses a second answer", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    const { body } = await nextQuestion(page.request);
    const questionId = body.questionId as string;

    const first = await page.request.post("/api/quiz/answer", {
      data: { questionId, chosenIndex: 0, timeMs: 1200 },
    });
    expect(first.status()).toBe(200);
    const verdict = (await first.json()) as Record<string, unknown>;

    // The verdict — and only now — carries the truth.
    expect(typeof verdict.correct).toBe("boolean");
    expect(typeof verdict.explanation).toBe("string");
    expect(typeof verdict.exactPercent).toBe("number");

    // A spot is answered once. The session is burned before the row is written,
    // so a resubmit loses rather than double-counting.
    const replay = await page.request.post("/api/quiz/answer", {
      data: { questionId, chosenIndex: 1, timeMs: 900 },
    });
    expect(replay.status()).toBe(409);
  });

  test("will not grade somebody else's question", async ({ page, browser }) => {
    const mine = await makeEntitledUser();
    await login(page, mine.email);
    const { body } = await nextQuestion(page.request);
    const questionId = body.questionId as string;

    const theirs = await makeEntitledUser();
    const context = await browser.newContext();
    const otherPage = await context.newPage();
    await login(otherPage, theirs.email);

    const stolen = await otherPage.request.post("/api/quiz/answer", {
      data: { questionId, chosenIndex: 0 },
    });
    // Indistinguishable from "expired" on purpose — confirming a question
    // exists but is not yours is a disclosure.
    expect(stolen.status()).toBe(404);
    await context.close();
  });

  test("plays a question end to end in the browser", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    await page.goto("/quiz");
    await page.waitForSelector("[data-quiz-option]", { timeout: 30_000 });

    const options = page.locator("[data-quiz-option]");
    await expect(options).toHaveCount(3);

    // Every option is a whole percentage, never an identifier.
    for (const text of await options.allInnerTexts()) {
      expect(text.trim()).toMatch(/^\d+%$/);
    }

    await options.first().click();

    // The feedback names the exact figure — the one claim in the product that
    // is arithmetic rather than an authored approximation.
    const feedback = page.locator("[data-quiz-feedback]");
    await expect(feedback).toBeVisible({ timeout: 15_000 });
    await expect(feedback).toContainText(/counted, not estimated/);

    await expect(page.locator("[data-quiz-next]")).toBeVisible();
  });

  test("persists the attempt, and the row says what was asked", async ({ page }) => {
    /*
     * This test could not exist until migration 0004 was applied — the insert
     * is best-effort and LOGS rather than throwing, so before the table existed
     * the whole loop went green while nothing was written. That is the right
     * failure mode for a user (they still get their answer) and exactly the
     * wrong one for a test suite, which is why this asserts on the ROW.
     */
    const { id, email } = await makeEntitledUser();
    await login(page, email);

    const { body } = await nextQuestion(page.request);
    const questionId = body.questionId as string;
    const asked = (body.question as Record<string, unknown>).family as string;

    const graded = await page.request.post("/api/quiz/answer", {
      data: { questionId, chosenIndex: 0, timeMs: 4321 },
    });
    expect(graded.status()).toBe(200);
    const verdict = (await graded.json()) as { correct: boolean };

    const { data, error } = await admin
      .from("quiz_attempts")
      .select("family, chosen_index, correct, time_ms, question_payload")
      .eq("user_id", id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const row = data![0] as Record<string, unknown>;
    expect(row.family).toBe(asked);
    expect(row.chosen_index).toBe(0);
    expect(row.time_ms).toBe(4321);
    // The stored verdict must equal the one the user was shown. If these can
    // disagree, the breakdown on /progress is fiction.
    expect(row.correct).toBe(verdict.correct);
    // The payload keeps the question as asked, so a review shows the same
    // three options rather than regenerating different ones.
    expect(row.question_payload).toMatchObject({ correctIndex: expect.any(Number) });
  });

  test("the breakdown reaches /progress", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    // Enough to put a family on the board, well under the weakest threshold.
    for (let i = 0; i < 3; i++) {
      const { body } = await nextQuestion(page.request);
      await page.request.post("/api/quiz/answer", {
        data: { questionId: body.questionId as string, chosenIndex: 0 },
      });
    }

    await page.goto("/progress");
    const section = page.locator('[data-section="quiz"]');
    await expect(section).toBeVisible({ timeout: 30_000 });
    // "N of 3 right" — the count is real, not the empty state.
    await expect(section).toContainText(/of 3 right/);
    await expect(section.locator("[data-quiz-family]").first()).toBeVisible();
  });

  test("the practice hub offers the mode", async ({ page }) => {
    const { email } = await makeEntitledUser();
    await login(page, email);

    await page.goto("/practice");
    const card = page.locator('[data-hub="Poker maths"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("link", { name: "Start a set" }).click();
    await expect(page).toHaveURL(/\/quiz/);
  });
});
