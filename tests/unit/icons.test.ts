/**
 * The icons on disk still match the brand, and the manifest still points at
 * files that exist at the sizes it claims.
 *
 * This is the same failure `tests/unit/assets.test.ts` was written for, one
 * layer further out: nothing in a Next build checks a manifest icon path, so a
 * renamed file leaves the install prompt silently unavailable and the tab
 * showing a generic page glyph. `src/app/favicon.ico` was the stock
 * create-next-app file for forty substages for exactly this reason — it is a
 * binary nobody looks at.
 *
 * Regenerate with `npm run icons` after touching a brand SVG.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../src/app/manifest";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");

/** Width and height straight out of the PNG's IHDR — no decoder needed. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  const signature = buf.subarray(0, 8).toString("hex");
  expect(signature, `${file} is not a PNG`).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The sizes an .ico's directory advertises. A stored 0 means 256. */
function icoSizes(file: string): number[] {
  const buf = readFileSync(file);
  expect(buf.readUInt16LE(2), `${file} is not an icon file`).toBe(1);

  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const width = buf.readUInt8(6 + i * 16);
    return width === 0 ? 256 : width;
  });
}

describe("the brand icons", () => {
  it("serves the tab favicon as the brand SVG itself, byte for byte", () => {
    // A re-render would be a second copy free to drift. This one cannot: if
    // spade-tile.svg changes and `npm run icons` is not re-run, this fails.
    const source = readFileSync(join(PUBLIC, "brand", "spade-tile.svg"));
    const served = readFileSync(join(ROOT, "src", "app", "icon.svg"));
    expect(served.equals(source), "src/app/icon.svg is stale — run `npm run icons`").toBe(true);
  });

  it("ships a favicon.ico carrying a 48px entry", () => {
    // Google's favicon guidance asks for a square that is a multiple of 48.
    // The classic 16 and 32 are for the browser tab.
    const sizes = icoSizes(join(ROOT, "src", "app", "favicon.ico"));
    expect(sizes).toContain(48);
    expect(sizes).toContain(32);
    expect(sizes).toContain(16);
  });

  it("ships a 180px apple-touch-icon as a PNG", () => {
    // Safari ignores an SVG here, so this one cannot be the vector.
    expect(pngSize(join(ROOT, "src", "app", "apple-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });

  it("has no leftover generated icon routes", () => {
    // icon.tsx and icon.svg both satisfy the same Next file convention, and
    // shipping both emits two competing <link rel="icon"> tags.
    for (const stale of ["icon.tsx", "apple-icon.tsx"]) {
      expect(existsSync(join(ROOT, "src", "app", stale)), `${stale} conflicts`).toBe(false);
    }
  });
});

describe("the PWA manifest icons", () => {
  const icons = manifest().icons ?? [];

  it("declares the two sizes Chrome requires before it offers to install", () => {
    const sizes = icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("declares a maskable icon", () => {
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it.each(icons.map((icon) => [icon.src, icon.sizes] as const))("%s exists at %s", (src, sizes) => {
    const file = join(PUBLIC, src.replace(/^\//, ""));
    expect(existsSync(file), `${src} is in the manifest but missing from public/`).toBe(true);

    const [declared] = (sizes ?? "").split("x").map(Number);
    expect(pngSize(file)).toEqual({ width: declared, height: declared });
  });
});
