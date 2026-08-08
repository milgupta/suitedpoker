/**
 * Every icon the browser, Google, iOS and Android see, rendered from the two
 * brand SVGs so none of them can drift from the mark on the page.
 *
 * There is one source of truth per corner treatment and no third copy:
 *
 *   public/brand/spade-tile.svg    rounded — the tab, the favicon, the wordmark
 *   public/brand/spade-square.svg  full-bleed — iOS and Android round it themselves
 *
 * `src/app/icon.svg` is a byte copy of the tile rather than a re-render,
 * because a vector favicon is the one Google will scale to whatever size it
 * wants and an SVG has no size to get wrong. The PNGs exist for the surfaces
 * that refuse SVG: apple-touch-icon and the PWA manifest.
 *
 * The .ico is hand-assembled. Every tool that writes one either wants a native
 * binary or pulls a dependency in to emit forty lines of header, and the format
 * is forty lines of header — a directory of PNGs with a 22-byte preamble.
 *
 *   npm run icons
 *
 * Re-run it whenever a brand SVG changes. `tests/unit/icons.test.ts` fails the
 * build if the copy in src/app stops matching the source.
 */

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const BRAND = join(ROOT, "public", "brand");
const APP = join(ROOT, "src", "app");

const TILE = join(BRAND, "spade-tile.svg");
const SQUARE = join(BRAND, "spade-square.svg");

/**
 * Google's favicon guidance asks for a square that is a multiple of 48px, so
 * 48 leads and the two classic sizes follow it. An .ico is a directory: the
 * browser picks the entry it wants.
 */
const FAVICON_SIZES = [48, 32, 16] as const;

/**
 * librsvg renders an SVG at its intrinsic size and only then would we resize,
 * which throws away exactly the crispness a vector source exists to provide.
 * Giving the root element the target size makes it rasterise at that size.
 */
async function render(svgPath: string, size: number): Promise<Buffer> {
  const source = readFileSync(svgPath, "utf8");
  const sized = source.replace("<svg ", `<svg width="${size}" height="${size}" `);
  if (sized === source) throw new Error(`${svgPath}: no <svg> element to size`);

  return sharp(Buffer.from(sized)).png({ compressionLevel: 9 }).toBuffer();
}

/** ICONDIR + one ICONDIRENTRY per image + the PNG payloads, in that order. */
function buildIco(images: readonly { size: number; png: Buffer }[]): Buffer {
  const HEADER = 6;
  const ENTRY = 16;

  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon, 2 = cursor
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER + ENTRY * images.length;
  const entries: Buffer[] = [];

  for (const { size, png } of images) {
    const entry = Buffer.alloc(ENTRY);
    // 256 is stored as 0 — the field is one byte and the format is from 1985.
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette size, 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main(): Promise<void> {
  const written: { file: string; bytes: number }[] = [];

  const emit = (file: string, data: Buffer): void => {
    writeFileSync(file, data);
    written.push({ file: file.replace(`${ROOT}/`, ""), bytes: data.length });
  };

  // The vector favicon — what a modern browser and Google both prefer.
  const iconSvg = join(APP, "icon.svg");
  copyFileSync(TILE, iconSvg);
  written.push({ file: iconSvg.replace(`${ROOT}/`, ""), bytes: readFileSync(iconSvg).length });

  // The legacy fallback, for anything that will not take an SVG.
  const faviconPngs = await Promise.all(
    FAVICON_SIZES.map(async (size) => ({ size, png: await render(TILE, size) })),
  );
  emit(join(APP, "favicon.ico"), buildIco(faviconPngs));

  // iOS adds no padding and masks the corners itself, so it gets the full-bleed
  // variant. PNG only — Safari ignores an SVG apple-touch-icon.
  emit(join(APP, "apple-icon.png"), await render(SQUARE, 180));

  // The manifest. 192 and 512 are what Chrome requires before it will offer to
  // install; the maskable one is full-bleed so Android crops rather than
  // framing the mark in a white circle.
  emit(join(BRAND, "icon-192.png"), await render(TILE, 192));
  emit(join(BRAND, "icon-512.png"), await render(TILE, 512));
  emit(join(BRAND, "icon-maskable-512.png"), await render(SQUARE, 512));

  // The email lockup's mark, at exactly 2x the 40px it is displayed at.
  // Reusing icon-192 would mean Outlook's Word rendering engine downscaling
  // 192px into a 40px slot, which it does badly enough to look like a
  // compression artefact — on the one asset whose entire job is looking real.
  emit(join(BRAND, "icon-email-80.png"), await render(TILE, 80));

  for (const { file, bytes } of written) {
    console.log(`${file.padEnd(38)} ${String(Math.round(bytes / 100) / 10).padStart(6)}KB`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
