/**
 * Every asset the landing page references actually exists.
 *
 * The failure this prevents is silent and embarrassing: a screenshot renamed or
 * a capture that failed leaves a broken image on the page every paid click
 * lands on, and nothing in the build complains. Next does not check a string
 * `src`, and neither does TypeScript.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC = join(process.cwd(), "public");

/**
 * The whole public marketing surface, not just `page.tsx`.
 *
 * The landing page used to hold every image itself. It now renders live
 * product components instead, and its remaining assets arrive through shared
 * chrome — so scanning one file would have quietly stopped checking anything.
 */
const MARKETING_SOURCES = [
  "src/app/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/features/page.tsx",
  "src/components/Wordmark.tsx",
  "src/components/marketing/SiteHeader.tsx",
  "src/components/marketing/SiteFooter.tsx",
  "src/components/marketing/AppFrame.tsx",
];

const LANDING = MARKETING_SOURCES.map((file) =>
  readFileSync(join(process.cwd(), file), "utf8"),
).join("\n");

/** Every `/…` path the marketing surface points at, from src, srcSet and poster. */
function referencedAssets(): string[] {
  const found = new Set<string>();
  for (const match of LANDING.matchAll(/(?:src|srcSet|poster)=[{"]?[`"]([^`"]+)[`"]/g)) {
    const raw = match[1];
    if (raw === undefined) continue;
    if (!raw.startsWith("/")) continue;
    found.add(raw);
  }
  return [...found];
}

/** Template literals like `/screenshots/${shot}.avif`, expanded. */
function expandTemplates(paths: string[]): string[] {
  const shots = [...LANDING.matchAll(/^\s*"([a-z-]+)",\s*$/gm)]
    .map((m) => m[1]!)
    .filter((s) => existsSync(join(PUBLIC, "screenshots", `${s}.png`)));

  return paths.flatMap((path) => {
    if (!path.includes("${")) return [path];
    return shots.map((shot) => path.replace(/\$\{[^}]+\}/, shot));
  });
}

/**
 * The paywall shows a product screenshot too, and it is the worse place to
 * break one: a broken image on the landing page costs a click, a broken image
 * on the payment screen costs the sale that click already paid for.
 */
const PAYWALL = readFileSync(
  join(process.cwd(), "src/app/(app)/paywall/paywall-client.tsx"),
  "utf8",
);

function assetsIn(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/(?:src|srcSet|poster)=[{"]?[`"]([^`"]+)[`"]/g)) {
    const raw = match[1];
    if (raw === undefined) continue;
    if (!raw.startsWith("/")) continue;
    found.add(raw);
  }
  return [...found];
}

describe("landing page assets", () => {
  const referenced = [...expandTemplates(referencedAssets()), ...assetsIn(PAYWALL)];

  it("references some assets at all", () => {
    // The floor is 1, not 4. The landing page deliberately no longer embeds the
    // seven phone-shaped screenshots or the hero loop — it renders the real
    // components instead — so a count that assumed them would be asserting a
    // design decision rather than an invariant. What still matters, and is
    // checked below, is that every path named here exists on disk.
    expect(referenced.length, "the marketing surface points at no local assets").toBeGreaterThan(0);
  });

  it("checks the paywall's own screenshot", () => {
    expect(assetsIn(PAYWALL).length, "the paywall points at no local assets").toBeGreaterThan(0);
  });

  it.each(referenced)("%s exists on disk", (path) => {
    const file = join(PUBLIC, path.replace(/^\//, ""));
    expect(existsSync(file), `${path} is referenced but missing from public/`).toBe(true);
    expect(statSync(file).size, `${path} is empty`).toBeGreaterThan(500);
  });

  it("has every screenshot in all three formats", () => {
    // A <picture> whose AVIF source 404s falls back silently, so a missing
    // format costs bytes rather than breaking — which is exactly why nobody
    // notices it for months.
    const manifestPath = join(PUBLIC, "screenshots", "manifest.json");
    expect(existsSync(manifestPath), "no screenshot manifest — run npm run screenshots").toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      shots: { name: string }[];
    };
    expect(manifest.shots.length).toBe(7);

    const missing: string[] = [];
    for (const shot of manifest.shots) {
      for (const ext of ["png", "webp", "avif"]) {
        const file = join(PUBLIC, "screenshots", `${shot.name}.${ext}`);
        if (!existsSync(file)) missing.push(`${shot.name}.${ext}`);
      }
    }
    expect(missing, missing.join(", ")).toEqual([]);
  });

  it("keeps the hero loop under 2MB in both formats", () => {
    // Autoplaying video on a landing page every ad click pays for. Over 2MB it
    // stops being a hero and becomes the reason the page feels slow.
    for (const file of ["drill-loop.webm", "drill-loop.mp4"]) {
      const path = join(PUBLIC, "hero", file);
      expect(existsSync(path), `${file} is missing — run npm run hero:video`).toBe(true);
      expect(statSync(path).size, `${file} exceeds 2MB`).toBeLessThan(2 * 1024 * 1024);
    }

    // And a poster, so the slot is never blank on a slow connection.
    expect(existsSync(join(PUBLIC, "hero", "drill-loop.jpg"))).toBe(true);
  });

  it("prints the delivered sizes", () => {
    const sizesPath = join(PUBLIC, "screenshots", "sizes.json");
    if (!existsSync(sizesPath)) return;

    const { rows, total } = JSON.parse(readFileSync(sizesPath, "utf8")) as {
      rows: { name: string; png: number; webp: number; avif: number }[];
      total: { png: number; webp: number; avif: number };
    };

    const kb = (n: number) => `${Math.round(n / 1024)}KB`;
    const lines = rows.map(
      (r) =>
        `  ${r.name.padEnd(26)} ${kb(r.png).padStart(7)} → ${kb(r.avif).padStart(7)} avif  (${Math.round((1 - r.avif / r.png) * 100)}% smaller)`,
    );
    const hero = ["drill-loop.webm", "drill-loop.mp4", "drill-loop.jpg"].map(
      (f) => `  ${f.padEnd(26)} ${kb(statSync(join(PUBLIC, "hero", f)).size).padStart(7)}`,
    );

    console.log(
      `\n${"=".repeat(72)}\nDELIVERED ASSETS\n${"=".repeat(72)}\n${lines.join("\n")}\n` +
        `  ${"TOTAL".padEnd(26)} ${kb(total.png).padStart(7)} → ${kb(total.avif).padStart(7)} avif\n\n${hero.join("\n")}\n`,
    );
  });
});

const HUB_ART = [
  "hub-daily.png",
  "hub-arena.png",
  "hub-table.png",
  "hub-table-sim.png",
  "hub-learn.png",
  "hub-ranges.png",
  "hub-progress.png",
];

describe("hub card art", () => {
  it.each(HUB_ART)("%s exists on disk", (file) => {
    const path = join(PUBLIC, "brand", "hub", file);
    expect(existsSync(path), `${file} missing — run npx tsx scripts/generate-hub-art.ts`).toBe(
      true,
    );
    expect(statSync(path).size, `${file} is empty`).toBeGreaterThan(500);
  });
});
