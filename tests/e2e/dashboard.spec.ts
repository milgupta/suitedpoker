import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";

/**
 * The dashboard in four data states.
 *
 * The one that matters most is the FIRST: a brand-new paying user meeting a
 * wall of zeros is a refund, so the empty state gets its own assertions. The
 * rest checks that the numbers on screen match what was seeded, that the CTAs
 * go where they claim, and that above the fold at 390x844 is exactly the three
 * things it is supposed to be.
 */

loadLocalEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CONFIGURED = SUPABASE_URL !== "" && SERVICE_KEY !== "";

const PASSWORD = "correct-horse-battery";

let admin: SupabaseClient;
const created: string[] = [];

async function makeUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e+dash${tag}${Date.now()}${Math.floor(Math.random() * 1000)}@suitedpoker.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error !== null) throw error;
  const id = data.user?.id;
  if (id === undefined) throw new Error("no user id");
  created.push(id);

  await admin.from("subscriptions").insert({
    user_id: id,
    status: "active",
    price_id: "price_e2e",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });

  return { id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Seeds attempts whose correct dashboard figures are known by construction. */
async function seedAttempts(
  userId: string,
  spec: { grade: string; evLoss: number; board: string | null; action: string; daysAgo: number }[],
): Promise<void> {
  const rows = spec.map((s) => ({
    user_id: userId,
    node_ref: "BTN:rfi",
    hero_hand: "AKs",
    board: s.board,
    chosen_action: s.action,
    grade: s.grade,
    ev_loss: s.evLoss.toFixed(3),
    time_ms: 6_000,
    source: "arena",
    created_at: new Date(Date.now() - s.daysAgo * 86_400_000).toISOString(),
  }));
  const { error } = await admin.from("drill_attempts").insert(rows);
  if (error !== null) throw error;
}

test.describe("dashboard", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");

  test.beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  test("STATE 1 — a brand-new user gets a path, never a wall of zeros", async ({ page }) => {
    const { email } = await makeUser("new");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);

    // The path is there…
    await expect(page.locator("[data-section='start-here']")).toBeVisible();
    await expect(page.getByText("Here’s how to start")).toBeVisible();

    // …and the discouraging zeros are NOT.
    await expect(page.locator("[data-section='numbers']")).toHaveCount(0);
    await expect(page.locator("[data-section='streets']")).toHaveCount(0);
    await expect(page.locator("[data-section='week']")).toHaveCount(0);

    const text = await page.locator("[data-dashboard]").innerText();
    expect(text, "a brand-new dashboard shows a 0%").not.toMatch(/\b0%/);
  });

  test("above the fold at 390x844 is greeting, daily, and continue — nothing else", async ({
    page,
  }) => {
    // Tested on a user WITH data: that is the long page the rule is about. A
    // brand-new dashboard is shorter than the fold, so everything fits and the
    // assertion would prove nothing.
    const { id, email } = await makeUser("fold");
    await seedAttempts(
      id,
      Array.from({ length: 12 }, (_, i) => ({
        grade: i % 2 === 0 ? "best" : "mistake",
        evLoss: i % 2 === 0 ? 0 : 1.5,
        board: null,
        action: "raise",
        daysAgo: 0,
      })),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, email);
    await expect(page.locator("[data-fold]")).toBeVisible();

    const below = await page.evaluate(() => {
      const out: { section: string; top: number }[] = [];
      for (const el of Array.from(document.querySelectorAll("[data-section]"))) {
        out.push({
          section: el.getAttribute("data-section") ?? "",
          top: Math.round(el.getBoundingClientRect().top),
        });
      }
      return out;
    });

    const aboveFold = below.filter((s) => s.top < 844).map((s) => s.section);
    console.log(`ABOVE THE FOLD: ${aboveFold.join(", ")}`);

    expect(aboveFold).toContain("greeting");
    expect(aboveFold).toContain("daily");
    expect(aboveFold).toContain("continue");
    // Nothing statistical is allowed up here — the fold answers "what now?",
    // and a number is not an answer to that question.
    for (const section of ["numbers", "streets", "week", "leaks", "rating"]) {
      expect(aboveFold, `${section} is above the fold`).not.toContain(section);
    }

    // Measured after the entry animations settle: a ring or a counter mid-
    // transition is not a layout bug, and every other overflow test in this
    // suite waits the same way.
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the dashboard scrolls sideways at 390px").toBeLessThanOrEqual(0);

    // And nothing is genuinely wider than the screen.
    const wide = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*"))
        .filter((el) => el.getBoundingClientRect().right > 391)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`)
        .slice(0, 5),
    );
    expect(wide, `elements wider than the screen: ${wide.join(", ")}`).toEqual([]);
  });

  test("STATE 2 — one day of data shows real numbers that match the seed", async ({ page }) => {
    const { id, email } = await makeUser("oneday");

    // Ten attempts, counted by hand:
    //   correct  — 3 best + 1 sharp + 1 solid = 5 of 10 → accuracy 50%
    //   ev lost  — 0.2+0.8+0.9+1.5+1.6+4.0 = 9.0 over 10 → 90 bb/100
    //   streets  — 6 preflop, 2 flop (3-card boards), 1 turn, 1 river
    //   preflop  — raise, call, fold, call, fold, fold → VPIP 50%, PFR 16.67%
    await seedAttempts(id, [
      { grade: "best", evLoss: 0, board: null, action: "raise", daysAgo: 0 },
      { grade: "best", evLoss: 0, board: null, action: "call", daysAgo: 0 },
      { grade: "best", evLoss: 0, board: null, action: "fold", daysAgo: 0 },
      { grade: "sharp", evLoss: 0, board: "Ah Kd 2c", action: "raise", daysAgo: 0 },
      { grade: "solid", evLoss: 0.2, board: null, action: "call", daysAgo: 0 },
      { grade: "inaccuracy", evLoss: 0.8, board: null, action: "fold", daysAgo: 0 },
      { grade: "inaccuracy", evLoss: 0.9, board: "Ah Kd 2c", action: "call", daysAgo: 0 },
      { grade: "mistake", evLoss: 1.5, board: null, action: "fold", daysAgo: 0 },
      { grade: "mistake", evLoss: 1.6, board: "Ah Kd 2c 5s", action: "call", daysAgo: 0 },
      { grade: "blunder", evLoss: 4.0, board: "Ah Kd 2c 5s 9h", action: "fold", daysAgo: 0 },
    ]);

    await login(page, email);

    // The stats replaced the path.
    await expect(page.locator("[data-section='numbers']")).toBeVisible();
    await expect(page.locator("[data-section='start-here']")).toHaveCount(0);

    const numbers = await page.locator("[data-section='numbers']").innerText();
    console.log(`SEEDED DASHBOARD NUMBERS:\n${numbers}`);

    // Verified by hand above, and asserted here against the rendered page.
    expect(numbers).toContain("50");
    expect(numbers).toContain("90.0");

    // Street rings: 6 preflop, 3 flop, 1 turn, 1 river.
    const attemptsByStreet = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (const el of Array.from(document.querySelectorAll("[data-street]"))) {
        out[el.getAttribute("data-street") ?? ""] = el.getAttribute("data-attempts") ?? "";
      }
      return out;
    });
    console.log(`STREET BUCKETS: ${JSON.stringify(attemptsByStreet)}`);
    expect(attemptsByStreet.preflop).toBe("6");
    expect(attemptsByStreet.flop).toBe("2");
    expect(attemptsByStreet.turn).toBe("1");
    expect(attemptsByStreet.river).toBe("1");
  });

  test("STATE 3 — 30 days of data renders a sparkline and a week comparison", async ({ page }) => {
    const { id, email } = await makeUser("thirty");

    const spread = Array.from({ length: 60 }, (_, i) => ({
      grade: i % 3 === 0 ? "best" : i % 3 === 1 ? "inaccuracy" : "mistake",
      evLoss: i % 3 === 0 ? 0 : 1,
      board: i % 2 === 0 ? null : "Ah Kd 2c",
      action: i % 2 === 0 ? "raise" : "call",
      daysAgo: i % 12,
    }));
    await seedAttempts(id, spread);

    await login(page, email);

    await expect(page.locator("[data-sparkline]")).toBeVisible();
    await expect(page.locator("[data-section='week']")).toBeVisible();

    // 60 attempts clears the leak threshold, so that section says something.
    const leaks = await page.locator("[data-section='leaks']").innerText();
    console.log(`LEAKS SECTION:\n${leaks}`);
    expect(leaks).not.toContain("Play 50 hands");
  });

  test("STATE 4 — a broken streak still reads as an invitation", async ({ page }) => {
    const { id, email } = await makeUser("broken");
    await admin
      .from("profiles")
      .update({ streak_count: 0, last_daily_at: "2026-01-01" })
      .eq("id", id);

    await login(page, email);

    // No scolding about the lost streak — just today's five.
    const daily = await page.locator("[data-section='daily']").innerText();
    console.log(`BROKEN-STREAK DAILY CARD:\n${daily}`);
    expect(daily.toLowerCase()).not.toMatch(/\b(lost|broken|failed|missed)\b/);
    await expect(page.locator("[data-cta='daily']")).toBeVisible();
  });

  test("every CTA goes where it says", async ({ page }) => {
    const { email } = await makeUser("cta");
    await login(page, email);

    await expect(page.locator("[data-cta='daily']")).toHaveAttribute("href", "/daily");
    await expect(page.locator("[data-cta='lesson']")).toHaveAttribute(
      "href",
      "/learn/before-the-flop/position-is-everything",
    );
    await expect(page.locator("[data-quick='Arena']")).toHaveAttribute("href", "/arena");
    await expect(page.locator("[data-quick='Table sim']")).toHaveAttribute("href", "/table");
    await expect(page.locator("[data-quick='Ranges']")).toHaveAttribute("href", "/ranges");

    await page.locator("[data-quick='Ranges']").click();
    await expect(page).toHaveURL(/\/ranges/);
  });

  test("every stat tile opens a populated definition", async ({ page }) => {
    const { id, email } = await makeUser("stats");
    await seedAttempts(id, [
      { grade: "best", evLoss: 0, board: null, action: "raise", daysAgo: 0 },
    ]);
    await login(page, email);

    const tiles = page.locator("[data-section='numbers'] button");
    const count = await tiles.count();
    expect(count, "no stat tiles carry an (i)").toBeGreaterThanOrEqual(4);

    // Each one opens a sheet with a definition AND a target.
    for (let i = 0; i < 4; i++) {
      await tiles.nth(i).click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      const text = await sheet.innerText();
      expect(text.length, `stat ${i} opened an empty sheet`).toBeGreaterThan(80);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }
  });

  test("renders inside the LCP budget", async ({ page }) => {
    const { email } = await makeUser("lcp");
    await login(page, email);

    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let latest = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) latest = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          setTimeout(() => resolve(latest), 2_500);
        }),
    );

    console.log(`DASHBOARD LCP: ${Math.round(lcp)}ms`);
    // A dev-server figure, so the bar is generous — this catches a regression
    // into "seconds", not a production budget.
    expect(lcp, `LCP was ${Math.round(lcp)}ms`).toBeLessThan(4_000);
  });
});
