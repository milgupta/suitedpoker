import { test, expect } from "@playwright/test";

test("home page renders without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  expect(errors, `console errors on /: ${errors.join(" | ")}`).toEqual([]);
});
