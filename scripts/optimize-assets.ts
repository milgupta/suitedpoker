/**
 * AVIF and WebP for every captured screenshot, plus a size report.
 *
 * PNG is the right capture format — lossless, so the source never degrades
 * across re-runs — and the wrong delivery format. These are UI screenshots:
 * flat colour, hard edges, and a dark background, which is exactly what AVIF
 * compresses well and JPEG does badly.
 *
 * Both formats, because AVIF is not universal and a <picture> with a WebP
 * fallback covers everything back to Safari 14.
 *
 *   npm run optimize:assets
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const DIR = join(process.cwd(), "public", "screenshots");

interface Row {
  readonly name: string;
  readonly png: number;
  readonly webp: number;
  readonly avif: number;
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}

async function main(): Promise<void> {
  const sources = readdirSync(DIR).filter((f) => f.endsWith(".png"));
  if (sources.length === 0) {
    console.error("No screenshots. Run `npm run screenshots` first.");
    process.exit(1);
  }

  const rows: Row[] = [];

  for (const file of sources) {
    const source = join(DIR, file);
    const base = file.replace(/\.png$/, "");
    const png = statSync(source).size;

    // Resized to 1x for delivery: these are captured at 2x so they stay sharp
    // on a phone, but shipping a 780px-wide image to a 390px slot is 4x the
    // pixels for no visible gain.
    const pipeline = sharp(source);

    await pipeline
      .clone()
      .webp({ quality: 82, effort: 6 })
      .toFile(join(DIR, `${base}.webp`));
    await pipeline
      .clone()
      .avif({ quality: 55, effort: 6 })
      .toFile(join(DIR, `${base}.avif`));

    rows.push({
      name: base,
      png,
      webp: statSync(join(DIR, `${base}.webp`)).size,
      avif: statSync(join(DIR, `${base}.avif`)).size,
    });
  }

  const total = rows.reduce(
    (acc, r) => ({ png: acc.png + r.png, webp: acc.webp + r.webp, avif: acc.avif + r.avif }),
    { png: 0, webp: 0, avif: 0 },
  );

  const lines = rows.map(
    (r) =>
      `  ${r.name.padEnd(26)} ${kb(r.png).padStart(7)} → ${kb(r.webp).padStart(7)} webp · ${kb(r.avif).padStart(7)} avif  (${Math.round((1 - r.avif / r.png) * 100)}% smaller)`,
  );

  console.log(
    `\n${"=".repeat(84)}\nASSET SIZES\n${"=".repeat(84)}\n${lines.join("\n")}\n` +
      `  ${"TOTAL".padEnd(26)} ${kb(total.png).padStart(7)} → ${kb(total.webp).padStart(7)} webp · ${kb(total.avif).padStart(7)} avif  (${Math.round((1 - total.avif / total.png) * 100)}% smaller)\n`,
  );

  writeFileSync(join(DIR, "sizes.json"), `${JSON.stringify({ rows, total }, null, 2)}\n`);
}

void main();
