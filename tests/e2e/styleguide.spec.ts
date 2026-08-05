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

test("every interactive element meets the 44px touch target at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/styleguide");

  const undersized = await page.evaluate(() => {
    const MIN = 44;
    const bad: string[] = [];

    // A control may carry its hit area on a ::before rather than its own box —
    // that is what `.tap-target` does for the 20px checkbox, which is the right
    // visual weight and an unusable target. Measure the larger of the two.
    const effective = (el: Element): { w: number; h: number } => {
      const rect = el.getBoundingClientRect();
      const before = getComputedStyle(el, "::before");
      const bw = parseFloat(before.width);
      const bh = parseFloat(before.height);
      const hasBefore = before.content !== "none" && !Number.isNaN(bw) && !Number.isNaN(bh);
      return {
        w: Math.max(rect.width, hasBefore ? bw : 0),
        h: Math.max(rect.height, hasBefore ? bh : 0),
      };
    };

    const selector =
      "button, input:not([type=hidden]), select, textarea, [role='checkbox'], [role='radio'], [role='switch'], [role='tab'], a[href]";
    // Radix renders a visually-hidden native control beside each custom one so
    // forms still work. Those are not targets the user can hit, and measuring
    // them is measuring the wrong element.
    const isProxy = (el: Element): boolean => {
      if (el.closest("[aria-hidden='true']") !== null) return true;
      const s = getComputedStyle(el);
      return s.opacity === "0" || s.visibility === "hidden" || s.pointerEvents === "none";
    };

    for (const el of Array.from(document.querySelectorAll(selector))) {
      const rect = el.getBoundingClientRect();
      // Skip anything not currently laid out (inside a closed dialog).
      if (rect.width === 0 && rect.height === 0) continue;
      if (isProxy(el)) continue;

      const { w, h } = effective(el);
      if (h > 0 && (h < MIN || w < MIN)) {
        const label = (el.textContent ?? el.getAttribute("aria-label") ?? el.tagName).trim();
        bad.push(`${el.tagName} "${label.slice(0, 40)}" — ${Math.round(w)}x${Math.round(h)}`);
      }
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

test("every interactive element is keyboard reachable with a visible focus ring", async ({
  page,
  isMobile,
}) => {
  // iOS Safari does not move focus with Tab at all, so this asserts nothing
  // there. Keyboard navigation is a desktop concern; the touch-target test is
  // the mobile half of the same requirement.
  test.skip(isMobile === true, "Tab navigation is not available on iOS Safari");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/styleguide");

  // Tab through the page and record what actually receives focus.
  const seen = new Set<string>();
  let missingRing: string | null = null;

  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");

    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return null;

      const styles = getComputedStyle(el);
      // A ring is either an outline or a box-shadow ring — shadcn uses the
      // latter, our base layer uses the former.
      const hasOutline = styles.outlineStyle !== "none" && parseFloat(styles.outlineWidth) > 0;
      const hasShadowRing = styles.boxShadow !== "none" && styles.boxShadow !== "";

      return {
        // Identity by document position — several controls share a class and
        // have no id, and a colliding key ends the walk after one step.
        key: String(Array.prototype.indexOf.call(document.querySelectorAll("*"), el)),
        label: (el.textContent ?? el.getAttribute("aria-label") ?? el.tagName).trim().slice(0, 40),
        focusable: hasOutline || hasShadowRing,
      };
    });

    if (info === null) continue;
    if (seen.has(info.key)) break; // wrapped around
    seen.add(info.key);
    if (!info.focusable && missingRing === null) missingRing = `${info.key} — "${info.label}"`;
  }

  expect(seen.size, "tabbing reached almost nothing").toBeGreaterThan(15);
  expect(missingRing, `focused element with no visible ring: ${missingRing}`).toBeNull();
});
