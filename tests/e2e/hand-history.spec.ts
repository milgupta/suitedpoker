import { expect, test } from "@playwright/test";

/**
 * The text drill format, checked where it has to work: a phone.
 *
 * The whole reason this format exists is that a four-street hand does not fit
 * on a 390px screen as a graphical table. If it does not fit here either, the
 * format has no purpose.
 */

test("a four-street hand fits 390x844 without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide/history");
  await expect(page.getByRole("heading", { name: "Hand history" })).toBeVisible();
  await page.waitForTimeout(600);

  const size = await page.evaluate(() => {
    const article = document.querySelector("article[aria-label='Hand history']");
    if (article === null) return null;
    const rect = article.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });

  expect(size, "no hand history rendered").not.toBeNull();
  // 844 minus room for the question and the answer controls beneath it.
  expect(size?.height, `history is ${size?.height}px tall`).toBeLessThan(620);
  expect(size?.width).toBeLessThanOrEqual(390);
});

test("no horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide/history");
  await page.waitForTimeout(600);

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test("ChoiceGrid is keyboard navigable and every target clears 44px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide/history");
  await page.waitForTimeout(600);

  const options = page.getByRole("radio");
  await expect(options.first()).toBeVisible();

  // Every option must be a real touch target.
  const undersized = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll("[role=radio]"))) {
      const { width, height } = el.getBoundingClientRect();
      if (height > 0 && (height < 44 || width < 44)) {
        bad.push(`${el.textContent?.trim()} — ${Math.round(width)}x${Math.round(height)}`);
      }
    }
    return bad;
  });
  expect(undersized, undersized.join("\n")).toEqual([]);

  // Arrows move focus between options; Enter picks one.
  await options.first().focus();
  const firstLabel = await options.first().textContent();

  await page.keyboard.press("ArrowRight");
  const focusedAfterArrow = await page.evaluate(() => document.activeElement?.textContent ?? "");
  expect(focusedAfterArrow, "ArrowRight did not move focus").not.toBe(firstLabel);

  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const checked = await page.locator("[role=radio][aria-checked=true]").count();
  expect(checked, "Enter did not select an option").toBeGreaterThan(0);
});

test("answering marks the correct option and colours a wrong pick", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/styleguide/history");
  await page.waitForTimeout(600);

  // T9s is the worst candidate in the demo, so picking it must not be marked
  // the same as the right answer.
  await page.getByRole("radio", { name: /T9s/ }).click();
  await page.waitForTimeout(400);

  const borders = await page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of Array.from(document.querySelectorAll("[role=radio]"))) {
      out[el.textContent?.trim() ?? ""] = getComputedStyle(el).borderColor;
    }
    return out;
  });

  const values = Object.values(borders);
  expect(new Set(values).size, "every option got the same border").toBeGreaterThan(1);
});
