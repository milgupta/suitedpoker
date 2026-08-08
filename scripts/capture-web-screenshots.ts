/**
 * DESKTOP CAPTURES, for the features page.
 *
 * `npm run screenshots` shoots the product at 390x844 because that is the
 * device it is designed for and the one every ad click arrives on. Those images
 * are correct and they are the wrong shape for a features page: a 13x13 range
 * grid or a six-handed table inside a phone frame is a texture, not a feature.
 * So this is a second, wider pass — same seeded account, same waits-for-the-
 * real-thing discipline, different viewport.
 *
 * It does NOT reseed. `npm run screenshots` owns the fixture account; running
 * two seeders against one row is how a fixture ends up half-written. If the
 * login fails, this script says to run that one first rather than guessing.
 *
 * Output: public/screenshots/web/<name>.{png,webp,avif}. The page references
 * AVIF first — these are flat UI on a dark ground, which is AVIF's best case.
 */

import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "public/screenshots/web");

/** The same fixture `npm run screenshots` seeds. Never reseeded here. */
const SEED_EMAIL = "screenshots@suitedpoker.internal";
const SEED_PASSWORD = "screenshot-fixture-9f2b";

/**
 * A laptop, not a 4K monitor. 1280 is where the product's `--container-app`
 * (1100px) sits comfortably with its gutters, so the shot shows the layout a
 * real user gets rather than one stretched to fill a capture.
 */
const VIEWPORT = { width: 1280, height: 1180 };
const SCALE = 2;

interface Shot {
  readonly name: string;
  readonly path: string;
  /** Waits for the thing that makes the shot worth taking. */
  readonly ready: (page: Page) => Promise<void>;
  /** Crop to the viewport instead of the whole scroll height. */
  readonly clipToViewport?: boolean;
  /**
   * Overrides the height for screens that do not fit 800px.
   *
   * The table scales to its container, so at 1280 wide the ring alone is most
   * of a laptop screen and an 800px crop cuts off the hole cards and the whole
   * action bar — the two things a drill screenshot exists to show. Taller
   * shots are not a problem for a features page; a cropped decision is.
   */
  readonly height?: number;
}

/**
 * ORDER MATTERS, for the same reason it does in the phone pass: the drill and
 * sim shots play real hands and write attempt rows, which move the dashboard's
 * counts. Read-only screens first.
 */
const SHOTS: Shot[] = [
  {
    name: "dashboard",
    path: "/practice",
    ready: async (page) => {
      await page.waitForSelector("[data-practice]", { timeout: 30_000 });
      await page.waitForTimeout(600);
    },
    clipToViewport: true,
  },
  {
    name: "ranges",
    path: "/ranges",
    ready: async (page) => {
      await page.waitForSelector("[data-cell]", { timeout: 30_000 });
      // The 169-cell reveal is capped at 300ms.
      await page.waitForTimeout(900);
    },
    clipToViewport: true,
  },
  {
    name: "lesson",
    path: "/learn",
    ready: async (page) => {
      await page.waitForSelector("a[href^='/learn/']", { timeout: 30_000 });
      await page.locator("a[href^='/learn/']").first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(800);
    },
    clipToViewport: true,
  },
  {
    name: "drill",
    path: "/arena",
    ready: async (page) => {
      // The hand itself, not the shell. 7.1 shipped with the arena crashing on
      // every load and the security test passing throughout, because a crashed
      // page leaks nothing — so wait for the SUCCESS state.
      await page.waitForSelector("[data-action]", { timeout: 30_000 });
      await page.waitForTimeout(700);
    },
    clipToViewport: true,
  },
  {
    name: "feedback",
    path: "/arena",
    ready: async (page) => {
      await page.waitForSelector("[data-action]", { timeout: 30_000 });
      // Answer, so the frequency bar and the grade are on screen. THE shot.
      await page.locator("[data-action]").first().click();
      await page.getByRole("button", { name: "Next hand" }).waitFor({ timeout: 25_000 });
      // The explanation streams in after the grade. Shimmer carries aria-busy,
      // which is the stable hook — a class name is not, and this script exists
      // to survive UI churn.
      await page
        .locator('[aria-busy="true"]')
        .first()
        .waitFor({ state: "detached", timeout: 20_000 })
        .catch(() => undefined);
      await page.waitForTimeout(1_400);
      await page
        .getByRole("button", { name: "Next hand" })
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
      await page.waitForTimeout(500);
    },
    clipToViewport: true,
  },
  {
    name: "table",
    path: "/table",
    ready: async (page) => {
      // /table opens on a setup screen; the hand is one click past it.
      await page.getByTestId("start-session").click();
      // The sim deals a real hand server-side and runs the bots before the
      // hero can act; 40s was not enough on a cold route.
      await page.waitForSelector("[data-seat]", { timeout: 90_000 });
      await page.waitForTimeout(2_000);
    },
    clipToViewport: true,
  },
];

async function login(page: Page): Promise<void> {
  /*
   * `networkidle`, NOT `domcontentloaded`.
   *
   * Clicking before React hydrates submits the form NATIVELY, as a GET — so the
   * page reloads with `?email=…&password=…` in the query string, no session is
   * created, and the failure looks exactly like a missing fixture. It also puts
   * the password in a URL, which is not something a script should ever do even
   * with a local fixture credential.
   */
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  try {
    await page.waitForURL(/\/(dashboard|onboarding|paywall|welcome)/, { timeout: 30_000 });
  } catch {
    // Say WHAT went wrong, not just that something did. Supabase rate-limits
    // sign-ins, and a run straight after `npm run screenshots` hits it — which
    // is indistinguishable from "the fixture does not exist" unless the form's
    // own error is read back.
    const shown = await page
      .locator("[role='alert'], [data-error], .text-danger-bright")
      .first()
      .innerText()
      .catch(() => "");

    throw new Error(
      `Could not log in as ${SEED_EMAIL}.\n` +
        `  still at: ${page.url()}\n` +
        (shown === "" ? "" : `  form said: ${shown}\n`) +
        `  If the fixture is missing, run \`npm run screenshots\` first — it owns that account.\n` +
        `  If it says too many attempts, Supabase is rate-limiting; wait a minute and re-run.`,
    );
  }
}

/**
 * The box the screen's CONTENT actually occupies, not the whole viewport.
 *
 * The product is mobile-first: at 1280 wide the dashboard is a ~600px column
 * centred in a field of black, and a full-viewport crop of it is four fifths
 * empty. Shown at a third of the page width in a features row, the UI inside
 * became too small to read — which defeats the point of shooting wide in the
 * first place.
 *
 * So measure what is on screen and crop to it. Union of `main`'s element boxes
 * rather than `main` itself, because `main` is usually full-bleed while its
 * children are the centred column.
 */
async function contentBox(
  page: Page,
  height: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.evaluate((viewportHeight: number) => {
    const root = document.querySelector("main") ?? document.body;
    let left = Infinity;
    let right = -Infinity;

    /*
     * MEASURE WHAT IS PAINTED, not what is laid out.
     *
     * Two earlier versions unioned element boxes and both came back at 1148px:
     * `--container-app` is 1100px and sits inside the 92% wrapper threshold, so
     * the filter let it through and the dashboard's 540px column was still
     * floating in the middle of a mostly-black image.
     *
     * Text ranges and elements that actually draw something — a background, a
     * border — are the content. A transparent 1100px div is not.
     */
    /*
     * Collected into one flat list and folded at the end — deliberately no
     * helper function in here. tsx compiles this file with esbuild's
     * keep-names transform, which wraps every named function expression in a
     * `__name()` call; that helper does not exist inside the page, so a tidy
     * `const consider = …` fails at runtime with "__name is not defined".
     */
    const rects: DOMRect[] = [];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? "").trim() === "") continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...Array.from(range.getClientRects()));
    }

    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;

      const paints =
        (style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent") ||
        style.backgroundImage !== "none" ||
        Number.parseFloat(style.borderTopWidth) > 0 ||
        el.tagName === "IMG" ||
        el.tagName === "svg";

      if (paints) rects.push(el.getBoundingClientRect());
    }

    for (const r of rects) {
      if (r.width < 4 || r.height < 4) continue;
      if (r.bottom < 0 || r.top > viewportHeight) continue;
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }

    return Number.isFinite(left) && right > left ? { left, right } : null;
  }, height);

  if (box === null) return { x: 0, y: 0, width: VIEWPORT.width, height };

  // A little air, and never wider than the viewport.
  const PAD = 24;
  const x = Math.max(0, Math.floor(box.left - PAD));
  const width = Math.min(VIEWPORT.width - x, Math.ceil(box.right - box.left + PAD * 2));

  return { x, y: 0, width, height };
}

/** PNG in, three formats out. Delivered at 1x; captured at 2x so it stays crisp. */
async function encode(name: string, png: Buffer): Promise<Record<string, number>> {
  // Half the captured pixels: shot at 2x, delivered at 1x.
  const meta = await sharp(png).metadata();
  const base = sharp(png).resize({
    width: Math.round((meta.width ?? VIEWPORT.width * SCALE) / SCALE),
  });
  const sizes: Record<string, number> = {};

  for (const [ext, buffer] of [
    ["png", await base.clone().png({ compressionLevel: 9 }).toBuffer()],
    ["webp", await base.clone().webp({ quality: 82 }).toBuffer()],
    ["avif", await base.clone().avif({ quality: 55 }).toBuffer()],
  ] as const) {
    writeFileSync(join(OUT, `${name}.${ext}`), buffer);
    sizes[ext] = buffer.length;
  }

  return sizes;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  const page = await context.newPage();

  await login(page);

  const rows: { name: string; png: number; avif: number }[] = [];

  for (const shot of SHOTS) {
    const height = shot.height ?? VIEWPORT.height;
    await page.setViewportSize({ width: VIEWPORT.width, height });
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "domcontentloaded" });

    /*
     * The Next dev overlay is a real asset bug, not a nuisance.
     *
     * The phone pass shipped a red "1 Issue" pill baked into the corner of the
     * live landing page and paywall images before anyone noticed. Hiding it
     * here beats relying on whoever runs this remembering to point it at a
     * production build.
     */
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});

    try {
      await shot.ready(page);
    } catch (error) {
      // Loudly, and keep going — one unreachable screen must not cost the
      // other five. A silent skip is how a features page ships with a gap.
      console.error(
        `  ${shot.name.padEnd(12)} FAILED — ${(error as Error).message.split("\n")[0]}`,
      );
      continue;
    }

    const png = await page.screenshot({
      clip: shot.clipToViewport ? await contentBox(page, height) : undefined,
      fullPage: !shot.clipToViewport,
    });

    const sizes = await encode(shot.name, png);
    rows.push({ name: shot.name, png: sizes.png ?? 0, avif: sizes.avif ?? 0 });
  }

  writeFileSync(
    join(OUT, "manifest.json"),
    `${JSON.stringify(
      {
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        shots: rows.map((r) => ({ name: r.name, file: `/screenshots/web/${r.name}.png` })),
      },
      null,
      2,
    )}\n`,
  );

  await browser.close();

  const kb = (n: number) => `${Math.round(n / 1024)}KB`;
  console.log(
    `\n${"=".repeat(60)}\nWEB SCREENSHOTS (${VIEWPORT.width}x${VIEWPORT.height} @${SCALE}x)\n${"=".repeat(60)}`,
  );
  for (const r of rows) {
    console.log(
      `  ${r.name.padEnd(12)} ${kb(r.png).padStart(8)} png → ${kb(r.avif).padStart(8)} avif`,
    );
  }
  console.log(`  ${rows.length}/${SHOTS.length} captured\n`);

  if (rows.length < SHOTS.length) process.exitCode = 1;
}

// `void main()`, not top-level await — tsx transforms these scripts to CJS.
void main();
