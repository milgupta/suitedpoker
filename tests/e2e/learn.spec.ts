import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * The curriculum, live.
 *
 * The one that matters is the server-side lock: a hidden link is not a lock,
 * and a locked lesson must be unreachable by typing its URL. The rest is the
 * loop — read, practise, complete — and the resume behaviour that makes a
 * half-read lesson worth coming back to.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

/** Module 1, in order. Mirrors src/content/curriculum/before-the-flop. */
const FIRST = "position-is-everything";
const SECOND = "starting-hands";
const MODULE_2_FIRST = "board-texture";

let admin: SupabaseClient;
const created: string[] = [];

async function makeEntitledUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+learn${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
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
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Marks lessons complete through the real API, as a practice pass would. */
async function completeLessons(page: Page, slugs: string[]): Promise<void> {
  for (const slug of slugs) {
    const response = await page.request.post("/api/learn/progress", {
      data: { slug, accuracy: 0.9 },
    });
    expect(response.status(), `${slug}: ${await response.text()}`).toBe(200);
  }
}

test.describe("curriculum", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("SECURITY — a locked lesson is unreachable by URL, not just hidden", async ({ page }) => {
    const { email } = await makeEntitledUser("locked");
    await login(page, email);

    // The link is not on the page…
    await page.goto("/learn");
    await expect(page.locator(`[data-lesson='${SECOND}'][data-locked='true']`)).toBeVisible();

    // …and typing its URL does not open it either.
    await page.goto(`/learn/before-the-flop/${SECOND}`);
    await expect(page, "a locked lesson rendered from a typed URL").toHaveURL(/\/learn$/);

    // Nor can it be completed through the API.
    const forced = await page.request.post("/api/learn/progress", {
      data: { slug: SECOND, accuracy: 1 },
    });
    expect(forced.status()).toBe(403);
    expect(((await forced.json()) as { error: string }).error).toBe("lesson_locked");
  });

  test("SECURITY — completion cannot simply be asserted by the client", async ({ page }) => {
    const { email } = await makeEntitledUser("assert");
    await login(page, email);

    const response = await page.request.post("/api/learn/progress", {
      data: { slug: FIRST, status: "completed" },
    });
    expect(response.status()).toBe(403);
    expect(((await response.json()) as { error: string }).error).toBe(
      "completion_requires_practice",
    );
  });

  test("moves through all four states and unlocks the next lesson", async ({ page }) => {
    const { id, email } = await makeEntitledUser("states");
    await login(page, email);

    await page.goto(`/learn/before-the-flop/${FIRST}`);
    await expect(page.getByRole("heading", { name: "Position is everything" })).toBeVisible();

    // Opening it starts it. The write is fire-and-forget from an effect, so
    // poll rather than sleeping on a guess.
    await expect
      .poll(
        async () => {
          const rows = await admin.from("lesson_progress").select("status").eq("user_id", id);
          return rows.data?.[0]?.status ?? null;
        },
        { timeout: 15_000, message: "opening a lesson never recorded 'reading'" },
      )
      .toBe("reading");

    // A passing practice set completes it.
    const result = await page.request.post("/api/learn/progress", {
      data: { slug: FIRST, accuracy: 0.8 },
    });
    const body = (await result.json()) as { verdict: { passed: boolean; message: string } };
    console.log(`PRACTICE VERDICT: ${JSON.stringify(body.verdict)}`);
    expect(body.verdict.passed).toBe(true);

    const done = await admin
      .from("lesson_progress")
      .select("status, attempts, best_accuracy")
      .eq("user_id", id)
      .single();
    expect(done.data?.status).toBe("completed");
    expect(done.data?.attempts).toBe(1);

    // And the next lesson is now reachable.
    await page.goto(`/learn/before-the-flop/${SECOND}`);
    await expect(page.getByRole("heading", { name: "Which hands to open" })).toBeVisible();
  });

  test("the 60% gate, the retry, and the override after three attempts", async ({ page }) => {
    const { email } = await makeEntitledUser("gate");
    await login(page, email);

    // Two failures: retry offered, override withheld.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await page.request.post("/api/learn/progress", {
        data: { slug: FIRST, accuracy: 0.4 },
      });
      const body = (await response.json()) as {
        verdict: { passed: boolean; canOverride: boolean; message: string };
      };
      expect(body.verdict.passed).toBe(false);
      expect(body.verdict.canOverride, `override offered on attempt ${attempt}`).toBe(false);
      expect(body.verdict.message).toContain("10 more");
    }

    // Third failure: now it is offered.
    const third = await page.request.post("/api/learn/progress", {
      data: { slug: FIRST, accuracy: 0.4 },
    });
    const body = (await third.json()) as { verdict: { canOverride: boolean } };
    expect(body.verdict.canOverride).toBe(true);

    // And it works.
    const override = await page.request.post("/api/learn/progress", {
      data: { slug: FIRST, override: true },
    });
    expect(override.status()).toBe(200);
    expect(((await override.json()) as { progress: { status: string } }).progress.status).toBe(
      "completed",
    );
  });

  test("the override is refused before the attempts are spent", async ({ page }) => {
    const { email } = await makeEntitledUser("noshortcut");
    await login(page, email);

    const response = await page.request.post("/api/learn/progress", {
      data: { slug: FIRST, override: true },
    });
    expect(response.status()).toBe(403);
  });

  test("module 2 opens at exactly 80% of module 1", async ({ page }) => {
    const { email } = await makeEntitledUser("unlock");
    await login(page, email);

    // 3 of 5 = 60%: still shut.
    await completeLessons(page, [FIRST, SECOND, "facing-a-raise"]);
    let blocked = await page.request.post("/api/learn/progress", {
      data: { slug: MODULE_2_FIRST, accuracy: 0.9 },
    });
    expect(blocked.status(), "module 2 opened at 60%").toBe(403);

    // 4 of 5 = 80%: open.
    await completeLessons(page, ["defending-your-big-blind"]);
    blocked = await page.request.post("/api/learn/progress", {
      data: { slug: MODULE_2_FIRST, accuracy: 0.9 },
    });
    expect(blocked.status(), "module 2 stayed shut at 80%").toBe(200);
  });

  test("Continue always points at the next incomplete lesson", async ({ page }) => {
    const { email } = await makeEntitledUser("continue");
    await login(page, email);

    await page.goto("/learn");
    await expect(page.locator("[data-continue]")).toContainText("Position is everything");

    await completeLessons(page, [FIRST]);
    await page.goto("/learn");
    await expect(page.locator("[data-continue]")).toContainText("Which hands to open");
  });

  test("restores the scroll position on return", async ({ page }) => {
    const { email } = await makeEntitledUser("scroll");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);

    await page.goto(`/learn/before-the-flop/${FIRST}`);
    await expect(page.locator("[data-lesson-body]")).toBeVisible();

    // Scroll to a point the page can actually reach.
    const target = await page.evaluate(() => {
      const reachable = Math.min(900, document.body.scrollHeight - window.innerHeight - 10);
      window.scrollTo({ top: reachable, behavior: "auto" });
      return reachable;
    });
    expect(target, "the lesson is too short to test scrolling").toBeGreaterThan(300);

    // The save is debounced at 800ms; wait for it to have landed.
    await page.waitForTimeout(2000);

    await page.goto(`/learn/before-the-flop/${FIRST}`);
    await expect(page.locator("[data-lesson-body]")).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 10_000 })
      .toBeGreaterThan(target * 0.5);

    console.log(
      `SCROLL RESTORED TO ${await page.evaluate(() => window.scrollY)} (saved ${target})`,
    );
  });

  test("renders the lesson and its components at 390px without sideways scroll", async ({
    page,
  }) => {
    const { email } = await makeEntitledUser("render");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);

    await page.goto(`/learn/before-the-flop/${FIRST}`);
    await expect(page.locator("[data-lesson-body]")).toBeVisible();

    // The custom components rendered, not raw MDX text.
    await expect(page.locator("[data-hand-example]").first()).toBeVisible();
    await expect(page.locator("[data-key-idea]")).toBeVisible();
    await expect(page.locator("[data-checkpoint]")).toBeVisible();
    await expect(page.locator("[data-table-example]")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the lesson scrolls sideways at 390px").toBeLessThanOrEqual(0);
  });

  test("a checkpoint answers and explains itself", async ({ page }) => {
    const { email } = await makeEntitledUser("checkpoint");
    await login(page, email);

    await page.goto(`/learn/before-the-flop/${FIRST}`);
    const checkpoint = page.locator("[data-checkpoint]").first();
    await checkpoint.scrollIntoViewIfNeeded();
    await checkpoint.getByRole("radio").first().click();
    await expect(page.locator("[data-checkpoint-explain]")).toBeVisible();
  });
});
