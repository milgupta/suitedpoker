/**
 * Every `text-*` class in the app resolves to a real token.
 *
 * Tailwind silently ignores a utility it cannot resolve, so `text-display-sm`
 * — a size that never existed — rendered four headings at body size across
 * three substages without anything failing. A colour literal is caught by
 * tests/unit/no-hardcoded-color.test.ts; this is its counterpart for type.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");
const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** The type steps declared in @theme, e.g. `--text-display-lg: 2.5rem`. */
function declaredSizes(): Set<string> {
  const sizes = new Set<string>();
  for (const match of CSS.matchAll(/--text-([a-z0-9-]+):\s*[^;]+;/g)) {
    const name = match[1]!;
    // Skip the modifier declarations (`--text-x--line-height`).
    if (name.includes("--")) continue;
    sizes.add(name);
  }
  return sizes;
}

/**
 * Tailwind's own scale, which stays available alongside ours. 0.2 notes that
 * these are off the named system, but they resolve, so they are not bugs.
 */
const TAILWIND_SIZES = new Set([
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
]);

/** `text-*` values that are colours or alignment, not sizes. */
function isNotASize(value: string): boolean {
  return (
    value.startsWith("text-") ||
    value.startsWith("accent") ||
    value.startsWith("danger") ||
    value.startsWith("surface") ||
    value.startsWith("grade-") ||
    value.startsWith("suit-") ||
    value.startsWith("on-") ||
    value.startsWith("canvas") ||
    value.startsWith("star") ||
    value.startsWith("card-") ||
    value.startsWith("border") ||
    value.startsWith("[") ||
    [
      "left",
      "right",
      "center",
      "justify",
      "start",
      "end",
      "balance",
      "pretty",
      "wrap",
      "nowrap",
      "clip",
      "ellipsis",
      "transparent",
      "current",
      "inherit",
    ].includes(value)
  );
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.tsx?$/.test(path)) files.push(path);
  }
  return files;
}

describe("the type scale", () => {
  const sizes = declaredSizes();

  it("declares the named steps 0.2 specified", () => {
    for (const step of ["display-xl", "display-lg", "display-md", "heading-lg", "heading-md"]) {
      expect(sizes.has(step), `--text-${step} is missing`).toBe(true);
    }
  });

  it("resolves every text-* size class used anywhere in src/", () => {
    const unknown: string[] = [];

    for (const file of walk(SRC)) {
      // Only real class lists. Comments and prose copy legitimately contain
      // phrases like "text-sized", and a guard that flags English gets turned
      // off — so this reads className/class attributes and nothing else.
      const raw = readFileSync(file, "utf8");
      const source = [...raw.matchAll(/class(?:Name)?=(?:"([^"]*)"|\{`([^`]*)`\}|'([^']*)')/g)]
        .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
        .concat([...raw.matchAll(/cn\(([\s\S]*?)\)/g)].map((m) => m[1] ?? ""))
        .join(" ");
      // The lookbehind matters: without it `text-text-primary` matches at its
      // inner `text-primary` and reports a colour token as a missing size.
      for (const match of source.matchAll(/(?<![-\w])text-([a-z0-9][a-z0-9-]*)\b/g)) {
        const value = match[1]!;
        if (isNotASize(value)) continue;
        if (sizes.has(value) || TAILWIND_SIZES.has(value)) continue;
        unknown.push(`${file.replace(`${process.cwd()}/`, "")}: text-${value}`);
      }
    }

    expect(
      [...new Set(unknown)],
      `these resolve to nothing and render at the default size:\n${[...new Set(unknown)].join("\n")}`,
    ).toEqual([]);
  });
});
