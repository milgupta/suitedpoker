import { expect, test, type Page } from "@playwright/test";
import { annualisedCents, formatUsd, PLANS } from "@/lib/stripe/plans";

/**
 * THE LANDING PAGE, AND THE SCAN THAT PROTECTS THE AD ACCOUNT.
 *
 * Meta's ad review reads this page. In this category, an earnings claim or the
 * word "gambling" outside a clear denial is the single fastest way to lose an
 * ad account — and losing it is not a warning, it is the end of paid
 * acquisition for the domain.
 *
 * So the forbidden-term scan runs over the RENDERED text, not the source: copy
 * arrives from three modules and a string that is fine in isolation can read as
 * a winnings claim once assembled.
 */

/** Terms that must never appear, with why each one is fatal. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bcasino\b/i, why: "reads as a gambling product to ad review" },
  { pattern: /\bbet real money\b/i, why: "real-money wagering claim" },
  { pattern: /\bwinnings\b/i, why: "frames poker as income" },
  { pattern: /\bmade \$\d/i, why: "earnings claim" },
  { pattern: /\bearn(?:ing)?s? \$\d/i, why: "earnings claim" },
  { pattern: /\bprofit(?:s|ed)?\b/i, why: "frames poker as income" },
  { pattern: /\bguaranteed?\b/i, why: "a results guarantee" },
  { pattern: /\bdeposit\b/i, why: "implies a real-money account" },
  { pattern: /\bwithdraw\b/i, why: "implies a real-money account" },
  { pattern: /\breal money (?:poker|play|game)/i, why: "real-money play" },
  // A dollar figure framed as a RESULT. Prices are fine — those are prices.
  {
    pattern: /\$[\d,]+(?:\.\d+)? (?:a|per) (?:month|year|week) (?:in|of) (?:profit|winnings)/i,
    why: "dollar-denominated result",
  },
  { pattern: /\bwin rate (?:up|increase)/i, why: "percentage framed as a win-rate gain" },
  { pattern: /\bup to \d+% more\b/i, why: "percentage framed as a results claim" },
];

/** "Gambling" is allowed ONLY inside the FAQ answer that denies it. */
const GAMBLING = /\bgambl(?:e|ing|er)\b/gi;

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

test.describe("the landing page", () => {
  test("renders and puts the hero CTA above the fold at 390x844", async ({ page }) => {
    // The phone every Meta click arrives on. A CTA that needs a scroll on that
    // viewport is a conversion rate cut in half.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const cta = page.locator("[data-cta='hero']");
    await expect(cta).toBeVisible();

    const box = await cta.boundingBox();
    expect(box, "the hero CTA has no box").not.toBeNull();
    expect(box!.y + box!.height, `hero CTA bottom is at ${box!.y + box!.height}px`).toBeLessThan(
      844,
    );

    // And it is a real touch target.
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("the hero CTA goes to signup", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-cta='hero']").click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("FORBIDDEN-TERM SCAN — the rendered page is clean", async ({ page }) => {
    await page.goto("/");
    const text = await bodyText(page);

    const found: string[] = [];
    for (const { pattern, why } of FORBIDDEN) {
      const match = pattern.exec(text);
      if (match !== null) {
        const at = Math.max(0, match.index - 60);
        found.push(`"${match[0]}" (${why}) … ${text.slice(at, match.index + 80)}`);
      }
    }

    expect(found, `forbidden terms on the landing page:\n${found.join("\n")}`).toEqual([]);
  });

  test("the word 'gambling' appears ONLY where it is being denied", async ({ page }) => {
    await page.goto("/");
    const text = await bodyText(page);

    const occurrences = [...text.matchAll(GAMBLING)];
    expect(occurrences.length, "gambling is never mentioned at all").toBeGreaterThan(0);

    for (const match of occurrences) {
      // Every occurrence must sit inside a sentence that denies it.
      const window = text.slice(Math.max(0, match.index - 200), match.index + 200);
      const denies =
        /\bno\b|\bnot\b|\bnever\b|educational|play money|no real money|nothing to win/i.test(
          window,
        );
      expect(denies, `"gambling" used without a denial near: …${window}…`).toBe(true);
    }

    console.log(`  "gambling" appears ${occurrences.length}× — each inside a denial`);
  });

  test("scans the methodology and legal pages too", async ({ page }) => {
    /**
     * The legal pages are held to a different standard, and correctly so: they
     * exist to DISCLAIM the things the landing page must never claim. "No
     * guarantee of results" is the sentence that protects us, and a scan that
     * flags it would push the copy toward saying less about results, not more.
     *
     * So a term is only fatal here when it is NOT negated in the sentence
     * around it — the same shape as the gambling check above.
     */
    const negated = (text: string, index: number): boolean => {
      const window = text.slice(Math.max(0, index - 120), index + 120);
      return /\bno\b|\bnot\b|\bnever\b|\bdoes not\b|\bwithout\b|\bcannot\b|\bprohibited\b|\bdisclaim/i.test(
        window,
      );
    };

    for (const path of ["/methodology", "/legal/terms", "/legal/privacy"]) {
      await page.goto(path);
      const text = await bodyText(page);

      const fatal: string[] = [];
      for (const { pattern, why } of FORBIDDEN) {
        const match = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`).exec(text);
        if (match === null) continue;
        if (negated(text, match.index)) continue;
        fatal.push(`${path}: "${match[0]}" (${why}) — not negated`);
      }

      expect(fatal, fatal.join("\n")).toEqual([]);
    }
  });

  test("every internal link resolves", async ({ page }) => {
    await page.goto("/");

    const hrefs = await page
      .locator("a[href^='/']")
      .evaluateAll((links) => [
        ...new Set(links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)),
      ]);
    expect(hrefs.length).toBeGreaterThan(3);

    const broken: string[] = [];
    for (const href of hrefs) {
      const response = await page.request.get(href, { maxRedirects: 5 });
      // /signup redirects a signed-in user, which is a 200 after following.
      if (response.status() >= 400) broken.push(`${href} → ${response.status()}`);
    }

    expect(broken, broken.join("\n")).toEqual([]);
  });

  test("the methodology page states the REAL provenance", async ({ page }) => {
    // The whole value of this page is being checkable. If it ever claims
    // solver-verified while the data says otherwise, it is worse than absent.
    await page.goto("/methodology");
    const text = await bodyText(page);

    expect(text).toContain("authored-approximation");
    expect(text.toLowerCase()).toContain("not the output of a solver run we did ourselves");
  });

  test("the OG image renders at 1200x630", async ({ page }) => {
    const response = await page.request.get("/opengraph-image");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");

    const body = await response.body();
    expect(body.length).toBeGreaterThan(5_000);

    // PNG dimensions live at bytes 16–24 of the IHDR chunk.
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
    console.log(
      `  OG image: ${body.readUInt32BE(16)}x${body.readUInt32BE(20)}, ${Math.round(body.length / 1024)}KB`,
    );
  });

  test("serves a sitemap and robots.txt", async ({ page }) => {
    const sitemap = await page.request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain("/methodology");
    expect(xml, "/pricing is a page people search for by name").toContain("/pricing");

    const robots = await page.request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const txt = await robots.text();
    expect(txt).toContain("Sitemap:");
    // The paid product is not for crawlers.
    expect(txt).toContain("/arena");
  });

  test("carries the JSON-LD an ad reviewer and a crawler both read", async ({ page }) => {
    await page.goto("/");

    const blocks = await page
      .locator("script[type='application/ld+json']")
      .evaluateAll((nodes) =>
        nodes.map((n) => JSON.parse(n.textContent ?? "{}") as Record<string, unknown>),
      );

    const app = blocks.find((b) => b["@type"] === "SoftwareApplication");
    expect(app, "no SoftwareApplication schema").toBeDefined();
    // The category is the same claim the copy makes, in the format a machine
    // reads. Getting it wrong is an ad-review problem, not an SEO one.
    expect(app!.applicationCategory).toBe("EducationalApplication");

    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    expect(faq, "no FAQPage schema").toBeDefined();
    expect((faq!.mainEntity as unknown[]).length).toBe(8);
  });

  test("NO price appears on the landing page", async ({ page }) => {
    // Pricing moved to its own page. A stray figure creeping back in is not a
    // cosmetic regression: the whole point of the split is that nobody meets a
    // number before there is anything to weigh it against.
    await page.goto("/");
    const text = await bodyText(page);

    const money = [...text.matchAll(/\$\s?\d[\d,]*(?:\.\d{2})?/g)].map((m) => m[0]);
    expect(money, `dollar figures on the landing page: ${money.join(", ")}`).toEqual([]);
  });

  test("the landing page links to /pricing", async ({ page }) => {
    await page.goto("/");
    // Header, footer and the final CTA all point at it. `:visible` matters —
    // the header nav collapses below `md`, so `.first()` alone passes on
    // desktop and fails on the phone every ad click arrives on.
    await expect(page.locator("a[href='/pricing']:visible").first()).toBeVisible();
  });

  test("the range showcase renders real strategy, not a picture of it", async ({ page }) => {
    await page.goto("/");

    // 169 cells means the actual RangeGrid mounted with real data. A crashed
    // client component renders nothing, and nothing contains no wrong numbers —
    // which is exactly how the arena stayed broken for two substages.
    const cells = page.locator("[role='gridcell']");
    await expect(cells).toHaveCount(169);
  });
});

test.describe("the pricing page", () => {
  test("prices match the real Stripe plans", async ({ page }) => {
    await page.goto("/pricing");
    const text = await bodyText(page);
    // Hardcoded prices outlive the price change that made them wrong, and the
    // first person to notice is a customer at checkout.
    //
    // Derived, not typed — the first version of this test hardcoded the three
    // figures and went red the day the annual price moved, which made a real
    // price change look like a product regression.
    expect(text).toContain(formatUsd(PLANS.annual.amountCents));
    expect(text).toContain(formatUsd(PLANS.monthly.amountCents));
    expect(text).toContain(formatUsd(annualisedCents("monthly")));
    expect(text).toContain(formatUsd(Math.round(PLANS.annual.amountCents / 12)));
  });

  test("FORBIDDEN-TERM SCAN — the pricing page is clean too", async ({ page }) => {
    // This is the page a payment-risk reviewer reads most closely, so it is
    // held to the same standard as the landing page.
    await page.goto("/pricing");
    const text = await bodyText(page);

    const found: string[] = [];
    for (const { pattern, why } of FORBIDDEN) {
      const match = pattern.exec(text);
      if (match !== null) {
        const at = Math.max(0, match.index - 60);
        found.push(`"${match[0]}" (${why}) … ${text.slice(at, match.index + 80)}`);
      }
    }

    expect(found, `forbidden terms on /pricing:\n${found.join("\n")}`).toEqual([]);
  });

  test("states renewal and cancellation without a click", async ({ page }) => {
    await page.goto("/pricing");
    const text = (await bodyText(page)).toLowerCase();

    expect(text, "no renewal terms").toContain("renew");
    expect(text, "no cancellation path").toContain("cancel");
  });

  test("the CTA is a real touch target and goes to signup", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pricing");

    const cta = page.locator("[data-cta='plan-annual']");
    await expect(cta).toBeVisible();
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await cta.click();
    await expect(page).toHaveURL(/\/signup/);
  });
});
