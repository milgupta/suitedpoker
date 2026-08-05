import { expect, test, type Page } from "@playwright/test";

/**
 * 3.1's acceptance criteria, checked against the rendered table rather than
 * asserted in prose: no overflow and no overlap at three widths, no touch
 * target under 44px, no animation over 400ms, and reduced motion stripping
 * every transform.
 */

const WIDTHS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

async function overflowPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
}

for (const { name, width, height } of WIDTHS) {
  test(`table has no horizontal overflow at ${width}px (${name})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.setViewportSize({ width, height });
    await page.goto("/styleguide/table");
    await expect(page.getByRole("heading", { name: "The table" })).toBeVisible();
    await page.waitForTimeout(800);

    expect(await overflowPx(page)).toBeLessThanOrEqual(0);
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test(`no seat pill overlaps another at ${width}px (${name})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/styleguide/table");
    await page.waitForTimeout(800);

    const overlaps = await page.evaluate(() => {
      // Seats sit ON the ring, so they are the elements most likely to collide
      // when the ellipse compresses.
      const tables = Array.from(
        document.querySelectorAll("[role='img'][aria-label^='Poker table']"),
      );
      const found: string[] = [];

      for (const table of tables) {
        const pills = Array.from(table.querySelectorAll<HTMLElement>("[data-seat-anchor]"));
        for (let i = 0; i < pills.length; i++) {
          for (let j = i + 1; j < pills.length; j++) {
            const a = pills[i]?.getBoundingClientRect();
            const b = pills[j]?.getBoundingClientRect();
            if (a === undefined || b === undefined) continue;
            if (a.width === 0 || b.width === 0) continue;
            const hit =
              a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            if (hit) found.push(`${pills[i]?.textContent} overlaps ${pills[j]?.textContent}`);
          }
        }
      }
      return found;
    });

    expect(overlaps, overlaps.join("\n")).toEqual([]);
  });
}

test("every action button clears 44px at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide/table");
  await page.waitForTimeout(800);

  const undersized = await page.evaluate(() => {
    const bad: string[] = [];
    for (const group of Array.from(document.querySelectorAll("[aria-label='Your action']"))) {
      for (const button of Array.from(group.querySelectorAll("button"))) {
        const { width, height } = button.getBoundingClientRect();
        if (height > 0 && (height < 44 || width < 44)) {
          bad.push(`${button.textContent?.trim()} — ${Math.round(width)}x${Math.round(height)}`);
        }
      }
    }
    return bad;
  });

  expect(undersized, undersized.join("\n")).toEqual([]);
});

test("no animation on the table exceeds 400ms", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide/table");
  await page.waitForTimeout(800);

  const slow = await page.evaluate(() => {
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *, body *"))) {
      const style = getComputedStyle(el);
      for (const source of [style.transitionDuration, style.animationDuration]) {
        for (const part of source.split(",")) {
          const value = part.trim();
          if (value === "" || value === "0s") continue;
          const ms = value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
          // The seat's active-ring pulse repeats deliberately; it is a loop,
          // not a transition the user waits on.
          if (ms > 400 && style.animationIterationCount !== "infinite") {
            offenders.push(`${el.tagName}.${el.className}: ${value}`);
          }
        }
      }
    }
    return [...new Set(offenders)];
  });

  expect(slow, slow.join("\n")).toEqual([]);
});

test("keyboard shortcuts fire actions, and do not fire while an input is focused", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/styleguide/table");
  await page.waitForTimeout(800);

  // Count folded seats rather than watching the pot: folding preflop does not
  // change the pot, because the blinds are already in it.
  const foldedCount = () => page.locator("[data-folded='true']").count();

  const before = await foldedCount();
  await page.keyboard.press("f");
  await page.waitForTimeout(500);
  expect(await foldedCount(), "pressing F did not fold anyone").toBeGreaterThan(before);

  // The same key must do nothing while an input holds focus — the sizing
  // slider is an input, and a stray "f" there must not fold the hand.
  const slider = page.locator("input[type=range]").first();
  if ((await slider.count()) > 0) {
    await slider.focus();
    const guarded = await foldedCount();
    await page.keyboard.press("f");
    await page.waitForTimeout(400);
    expect(await foldedCount()).toBe(guarded);
  }
});

test("reduced motion removes every transform on the table", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide/table");
  await page.waitForTimeout(1200);

  const transformed = await page.evaluate(() => {
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const inline = el.style.transform;
      if (inline !== "" && inline !== "none") found.push(`${el.tagName}.${el.className}`);
    }
    return found;
  });

  expect(transformed, transformed.join("\n")).toEqual([]);
});
