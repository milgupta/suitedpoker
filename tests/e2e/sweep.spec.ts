import AxeBuilder from "@axe-core/playwright";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { loadLocalEnv } from "../support/load-local-env";
import { adminClient, isConfigured } from "../support/e2e-supabase";

/**
 * THE SWEEP: every route, every device size, measured rather than eyeballed.
 *
 * Three properties that are individually cheap to check and individually
 * catastrophic to miss on a product where 85% of traffic is a phone arriving
 * from a paid ad:
 *
 *   1. Nothing overflows horizontally. A page that scrolls sideways at 360px
 *      reads as broken before a word of it is read.
 *   2. Cumulative Layout Shift under 0.1. A button that moves under a thumb
 *      mid-tap is the single most infuriating mobile bug.
 *   3. Zero serious or critical accessibility violations.
 *
 * Run as one suite because they share the expensive part — a logged-in,
 * entitled session on a seeded account.
 */

loadLocalEnv();

const CONFIGURED = isConfigured();

const PASSWORD = "correct-horse-battery";

/** The four the plan names, plus the desktop breakpoint. */
const DEVICES = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "Pro Max", width: 428, height: 926 },
  { name: "Android", width: 360, height: 800 },
] as const;

/** Public routes, and the paid ones that need a session. */
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/methodology",
  "/legal/terms",
  "/legal/privacy",
  "/login",
  "/signup",
];
const APP_ROUTES = ["/dashboard", "/arena", "/ranges", "/learn", "/daily", "/account", "/table"];

let admin: SupabaseClient;
const created: string[] = [];

async function makeSubscriber(): Promise<{ id: string; email: string }> {
  const email = `e2e+sweep${Date.now()}${Math.floor(Math.random() * 10_000)}@suitedpoker.com`;
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
    price_id: "price_sweep",
    current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  await admin
    .from("profiles")
    .update({ rating: 1100, streak_count: 4, onboarding: { goal: "move_up", complete: true } })
    .eq("id", data.user.id);

  return { id: data.user.id, email };
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(dashboard|onboarding|paywall)/, { timeout: 30_000 });
}

/** Anything wider than the viewport, named. */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const bad: string[] = [];

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // 1px of tolerance for sub-pixel rounding.
      if (rect.right > limit + 1 || rect.left < -1) {
        const style = getComputedStyle(el);
        // An element inside a horizontal scroller or a clipping parent is doing
        // what it was told. `hidden` belongs here as much as `auto` — the first
        // version of this check missed it and flagged the shimmer sweep, which
        // is a gradient deliberately animating past the edge of a box that
        // clips it and cannot move the page an inch.
        let contained = false;
        for (let p = el.parentElement; p !== null; p = p.parentElement) {
          const overflow = getComputedStyle(p).overflowX;
          if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") {
            contained = true;
            break;
          }
        }
        if (contained) continue;
        if (style.position === "fixed") continue;

        bad.push(
          `<${el.tagName.toLowerCase()} class="${el.className.toString().slice(0, 60)}"> right=${Math.round(rect.right)} limit=${limit}`,
        );
      }
    }
    return [...new Set(bad)].slice(0, 5);
  });
}

async function measureCls(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as unknown as { value: number; hadRecentInput: boolean };
            // Shifts caused by a user's own interaction are not layout bugs.
            if (!shift.hadRecentInput) total += shift.value;
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(total);
        }, 2_500);
      }),
  );
}

test.describe("the sweep", () => {
  test.skip(!CONFIGURED, "Supabase credentials absent");
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(() => {
    admin = adminClient();
  });

  test.afterAll(async () => {
    for (const id of created) {
      await admin.from("subscriptions").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  for (const device of DEVICES) {
    test(`no horizontal overflow at ${device.name} (${device.width}x${device.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: device.width, height: device.height });
      const user = await makeSubscriber();
      await login(page, user.email);

      const failures: string[] = [];

      for (const route of [...PUBLIC_ROUTES, ...APP_ROUTES]) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(900);

        // The document itself must not scroll sideways.
        const scrolls = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        const wide = await overflowingElements(page);

        if (scrolls || wide.length > 0) {
          failures.push(`${route}: ${scrolls ? "PAGE SCROLLS SIDEWAYS. " : ""}${wide.join(" | ")}`);
        }
      }

      expect(failures, `${device.name}:\n${failures.join("\n")}`).toEqual([]);
    });
  }

  test("CLS is under 0.1 on every route", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const user = await makeSubscriber();
    await login(page, user.email);

    const rows: { route: string; cls: number }[] = [];

    for (const route of [...PUBLIC_ROUTES, ...APP_ROUTES]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      rows.push({ route, cls: await measureCls(page) });
    }

    console.log(
      `\n${"=".repeat(52)}\nCUMULATIVE LAYOUT SHIFT (390x844)\n${"=".repeat(52)}\n` +
        rows
          .map(
            (r) => `  ${r.route.padEnd(22)} ${r.cls.toFixed(4)} ${r.cls < 0.1 ? "" : "  ← OVER"}`,
          )
          .join("\n") +
        "\n",
    );

    const over = rows.filter((r) => r.cls >= 0.1);
    expect(
      over.map((r) => `${r.route} = ${r.cls.toFixed(3)}`),
      "routes over 0.1 CLS",
    ).toEqual([]);
  });

  test("no serious or critical accessibility violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const user = await makeSubscriber();
    await login(page, user.email);

    const found: string[] = [];

    for (const route of [...PUBLIC_ROUTES, ...APP_ROUTES]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      for (const violation of results.violations) {
        // Moderate and minor are worth fixing but are not launch blockers;
        // serious and critical make a screen unusable for someone.
        if (violation.impact !== "serious" && violation.impact !== "critical") continue;
        found.push(
          `${route}: [${violation.impact}] ${violation.id} — ${violation.nodes.length} node(s): ${violation.nodes[0]?.html?.slice(0, 90) ?? ""}`,
        );
      }
    }

    console.log(
      found.length === 0
        ? `\n  axe: no serious or critical violations across ${PUBLIC_ROUTES.length + APP_ROUTES.length} routes\n`
        : `\n  axe violations:\n${found.join("\n")}\n`,
    );

    expect(found, found.join("\n")).toEqual([]);
  });

  test("respects prefers-reduced-motion", async ({ browser }) => {
    // The 0.2 guarantee: with reduced motion on, the variants carry NO
    // transform key at all rather than a shortened one.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const user = await makeSubscriber();
    await login(page, user.email);

    for (const route of ["/dashboard", "/arena", "/ranges"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_200);

      // Nothing should be mid-transform once the page has settled.
      const moving = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
          const t = getComputedStyle(el).transform;
          if (t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)") {
            // A static scale or rotate set in CSS is fine; a translate that has
            // not resolved to 0 means an entrance animation is stuck.
            const parts = /matrix\(([^)]+)\)/.exec(t)?.[1]?.split(",").map(Number);
            if (
              parts !== undefined &&
              (Math.abs(parts[4] ?? 0) > 1 || Math.abs(parts[5] ?? 0) > 1)
            ) {
              bad.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)} ${t}`);
            }
          }
        }
        return [...new Set(bad)].slice(0, 4);
      });

      expect(moving, `${route} has un-resolved transforms under reduced motion`).toEqual([]);
    }

    await context.close();
  });

  test("every interactive control clears 44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const user = await makeSubscriber();
    await login(page, user.email);

    const small: string[] = [];

    for (const route of ["/dashboard", "/arena", "/account", "/ranges"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(900);

      const found = await page.evaluate(() => {
        const bad: string[] = [];
        const controls = document.body.querySelectorAll<HTMLElement>(
          "button, a[href], input, select, [role='button']",
        );

        for (const el of Array.from(controls)) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // .tap-target carries its hit area on a ::before pseudo-element, so
          // the element box is deliberately smaller than the target.
          if (el.classList.contains("tap-target")) continue;
          /*
           * The 13x13 range grid is exempt, and honestly so: 169 cells across
           * 375px is 26px each by arithmetic, and there is no layout in which
           * they are 44px and still a grid. It is a data visualisation you read
           * — tapping a cell opens a detail panel, and that panel's controls
           * are full-size. Pretending otherwise would mean either a grid that
           * scrolls in two directions or a 44px rule nobody believes.
           */
          if (el.hasAttribute("data-cell")) continue;
          // Inline links inside prose are text, not controls.
          if (el.tagName === "A" && el.closest("p, li, dd") !== null) continue;

          if (rect.height < 44) {
            bad.push(
              `<${el.tagName.toLowerCase()}> ${Math.round(rect.width)}x${Math.round(rect.height)} "${(el.textContent ?? "").trim().slice(0, 30)}"`,
            );
          }
        }
        return [...new Set(bad)].slice(0, 6);
      });

      if (found.length > 0) small.push(`${route}: ${found.join(" | ")}`);
    }

    expect(small, small.join("\n")).toEqual([]);
  });
});
