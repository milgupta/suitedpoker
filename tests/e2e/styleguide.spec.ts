import { expect, test } from "@playwright/test";

/**
 * The styleguide is the visual regression check for the rest of the build, so
 * it has to survive the two widths that matter: a 390px phone (where most of
 * this product's traffic arrives) and a 1440px desktop.
 */

const WIDTHS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const { name, width, height } of WIDTHS) {
  test(`styleguide has no horizontal overflow at ${width}px (${name})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.setViewportSize({ width, height });
    await page.goto("/styleguide");
    await expect(page.getByRole("heading", { name: "Design system" })).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow, `page scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(0);

    // Nothing may push past the viewport either. Elements inside a scrolling or
    // clipping ancestor are excluded — a wide table inside `overflow-x: auto`
    // and the ambient blob inside its clipped host are both correct, and only
    // the document-level check above can tell that from real overflow.
    const escaping = await page.evaluate(() => {
      const isContained = (el: Element): boolean => {
        let node = el.parentElement;
        while (node !== null && node !== document.documentElement) {
          const { overflowX } = getComputedStyle(node);
          if (overflowX !== "visible") return true;
          node = node.parentElement;
        }
        return false;
      };

      const offenders: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        const over = Math.ceil(el.getBoundingClientRect().right - window.innerWidth);
        if (over > 1 && !isContained(el)) {
          offenders.push(`${el.tagName}.${el.className} extends ${over}px past the viewport`);
        }
      }
      return offenders;
    });
    expect(escaping, escaping.join("\n")).toEqual([]);

    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
  });
}

test("every button on the styleguide meets the 44px touch target at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide");

  const undersized = await page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll("button, input, a[href^='#']"))) {
      const { height } = el.getBoundingClientRect();
      if (height > 0 && height < 44)
        bad.push(`${el.tagName}: ${el.textContent?.trim()} @ ${height}`);
    }
    return bad;
  });

  expect(undersized, undersized.join("\n")).toEqual([]);
});

/**
 * Framer Motion writes transforms to `element.style`, so an inline transform
 * inside the motion section is the ground truth for whether a primitive
 * respected the preference.
 *
 * The preference is set with `page.emulateMedia()` rather than the
 * `reducedMotion` context option: the context option did not reach the page in
 * this Chromium build, and a silently-unapplied preference would make this test
 * pass for the wrong reason.
 */
async function inlineTransforms(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("#motion *"))) {
      const inline = el.style.transform;
      if (inline !== "" && inline !== "none") {
        found.push(`${el.tagName}.${el.className}: ${inline}`);
      }
    }
    return found;
  });
}

test("every motion primitive degrades to opacity-only under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide");

  // Proves the preference actually reached the page.
  await expect(page.getByText("REDUCE — every primitive below is opacity-only")).toBeVisible();

  // Let anything that was going to animate, animate.
  await page.waitForTimeout(1000);

  const transformed = await inlineTransforms(page);
  expect(transformed, transformed.join("\n")).toEqual([]);
});

test("motion primitives do transform when the preference is off", async ({ page }) => {
  // The control case. Without it, a bug that disabled motion everywhere would
  // make the test above pass vacuously.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide");

  await expect(page.getByText("prefers-reduced-motion is currently no-preference")).toBeVisible();

  const transformed = await inlineTransforms(page);
  expect(transformed.length, "no primitive transformed at all").toBeGreaterThan(0);
});
