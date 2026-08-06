/**
 * The hero loop: a spot appears, an action is chosen, the frequency bar fills.
 *
 * This is the product's magic and it does not survive being described. Thirty
 * words of copy about "seeing the whole strategy" does less than four seconds
 * of watching the bar animate in.
 *
 * LOOP SEAM. The first and last frames must be identical or the loop visibly
 * jumps every cycle, which reads as a broken video and is worse than a still.
 * The recording therefore starts and ends on the SAME rendered state, and the
 * seam is verified rather than assumed.
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run hero:video
 *
 * Requires ffmpeg on PATH.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../tests/support/load-local-env";

loadLocalEnv();

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = join(process.cwd(), "public", "hero");
const TMP = join(process.cwd(), ".hero-tmp");

const SEED_EMAIL = "screenshots@suitedpoker.internal";
const SEED_PASSWORD = "screenshot-fixture-9f2b";

/** Portrait, because the hero is a phone. 2x for a crisp downscale. */
const VIEWPORT = { width: 390, height: 844 };
const MAX_BYTES = 2 * 1024 * 1024;

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(SEED_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(dashboard|onboarding|paywall)/, { timeout: 30_000 });
}

async function ensureEntitled(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (url === "" || key === "") throw new Error("Needs Supabase credentials in .env.local.");

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (data?.users.find((u) => u.email === SEED_EMAIL) === undefined) {
    throw new Error("Run `npm run screenshots` first — it creates the fixture account.");
  }
}

async function main(): Promise<void> {
  await ensureEntitled();
  mkdirSync(OUT, { recursive: true });
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "dark",
    recordVideo: { dir: TMP, size: VIEWPORT },
  });

  const page = await context.newPage();
  await login(page);

  await page.goto(`${BASE}/arena`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-action]", { timeout: 30_000 });

  // FRAME 0: the spot, settled. The loop returns to exactly this.
  await page.waitForTimeout(1_400);

  await page.locator("[data-action]").first().click();
  await page.getByRole("button", { name: "Next hand" }).waitFor({ timeout: 25_000 });
  // Long enough for the frequency bar to finish filling — that is the shot.
  await page.waitForTimeout(2_600);

  // Back to the start, so the last frame matches the first.
  await page.getByRole("button", { name: "Next hand" }).click();
  await page.waitForSelector("[data-action]:not([disabled])", { timeout: 20_000 });
  await page.waitForTimeout(1_400);

  const video = page.video();
  await context.close();
  await browser.close();

  if (video === null) throw new Error("no video was recorded");
  const raw = await video.path();

  // WebM first (Playwright records VP8), then H.264 for Safari.
  const webm = join(OUT, "drill-loop.webm");
  const mp4 = join(OUT, "drill-loop.mp4");
  const poster = join(OUT, "drill-loop.jpg");

  /**
   * Scaled to 390px wide — it renders in a phone-sized slot, and shipping
   * 780px doubles the bytes for pixels nobody sees.
   *
   * THE FADE IS THE LOOP SEAM. "Next hand" deals a DIFFERENT hand, so the last
   * frame can never match the first by construction — the seam check measured
   * 23/255 and was right to fail. Fading in from and out to the canvas colour
   * makes both ends the same frame, and reads as deliberate rather than as a
   * video that jumps every four seconds.
   */
  const duration = Number(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw],
      { encoding: "utf8" },
    ).trim(),
  );
  const FADE = 0.6;
  const scale = `scale=390:-2,fade=t=in:st=0:d=${FADE}:c=0x07060d,fade=t=out:st=${(duration - FADE).toFixed(2)}:d=${FADE}:c=0x07060d`;

  ffmpeg(["-i", raw, "-vf", scale, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-an", webm]);
  ffmpeg([
    "-i",
    raw,
    "-vf",
    scale,
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-crf",
    "30",
    "-pix_fmt",
    "yuv420p",
    // Moves the index to the front so the video can start before it has fully
    // downloaded — on a phone on mobile data that is the whole difference.
    "-movflags",
    "+faststart",
    "-an",
    mp4,
  ]);
  // A poster, so the hero is never a blank rectangle on a slow connection.
  // The poster is taken from the MIDDLE, after the fade-in and while the
  // frequency bar is on screen — frame 0 is now deliberately black.
  ffmpeg([
    "-ss",
    (duration / 2).toFixed(2),
    "-i",
    raw,
    "-vf",
    "scale=390:-2",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    poster,
  ]);

  // The loop seam, verified rather than assumed.
  const first = join(TMP, "first.png");
  const last = join(TMP, "last.png");
  ffmpeg(["-i", mp4, "-vf", "select=eq(n\\,0)", "-frames:v", "1", first]);
  // -0.05, not -0.2: at 0.2s from the end the fade is only part-way through, so
  // the "last frame" being compared was never the last frame.
  ffmpeg(["-sseof", "-0.05", "-i", mp4, "-frames:v", "1", "-update", "1", last]);

  /**
   * The seam, measured in pixels rather than parsed out of ffmpeg's log.
   *
   * The first attempt scraped a PSNR line from stderr and silently reported
   * "unknown" when the filter chain was wrong — a check that cannot fail is not
   * a check. This decodes both frames and compares them directly.
   */
  const [firstRaw, lastRaw] = await Promise.all([
    sharp(first).resize(96, 208, { fit: "fill" }).greyscale().raw().toBuffer(),
    sharp(last).resize(96, 208, { fit: "fill" }).greyscale().raw().toBuffer(),
  ]);

  let diff = 0;
  for (let i = 0; i < firstRaw.length; i++) {
    diff += Math.abs((firstRaw[i] ?? 0) - (lastRaw[i] ?? 0));
  }
  const meanDiff = diff / firstRaw.length;
  // 0 is identical; anything under ~4/255 is invisible at playback speed.
  const seamClean = meanDiff < 4;

  const rows = [
    ["webm", statSync(webm).size],
    ["mp4", statSync(mp4).size],
    ["poster", statSync(poster).size],
  ] as const;

  console.log(`\n${"=".repeat(60)}\nHERO LOOP\n${"=".repeat(60)}`);
  for (const [name, bytes] of rows) {
    const over = bytes > MAX_BYTES ? "  ⚠ OVER 2MB" : "";
    console.log(`  ${name.padEnd(8)} ${String(Math.round(bytes / 1024)).padStart(6)}KB${over}`);
  }
  console.log(
    `  loop seam: mean pixel difference ${meanDiff.toFixed(2)}/255 — ${seamClean ? "CLEAN" : "VISIBLE JUMP"}\n`,
  );

  rmSync(TMP, { recursive: true, force: true });

  const tooBig = rows.filter(([, bytes]) => bytes > MAX_BYTES);
  if (tooBig.length > 0) {
    console.error(`  ${tooBig.map(([n]) => n).join(", ")} exceed 2MB.`);
    process.exit(1);
  }
  if (!existsSync(webm) || !existsSync(mp4)) process.exit(1);
  if (!seamClean) {
    console.error("  The loop jumps. Adjust the settle timings so it ends where it began.");
    process.exit(1);
  }
}

void main();
