/**
 * DESIGN.md rule 1: no hardcoded values. Every colour in the app comes from a
 * token, and src/app/globals.css is the only file allowed to contain a literal.
 *
 * "Enforced by review" is how the rule is written, but review does not survive
 * forty substages. This makes it a build failure instead.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const TOKENS_FILE = join("src", "app", "globals.css");

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".css", ".js", ".jsx", ".mjs"];

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "hex colour", re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g },
  // Requires a numeric first argument, so building a colour string out of
  // variables — `rgb(${r} ${g} ${b})` — is not mistaken for a literal.
  { name: "colour function", re: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/g },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext)) ? [full] : [];
  });
}

describe("no hardcoded colours outside globals.css", () => {
  const files = walk(SRC)
    .map((f) => relative(process.cwd(), f))
    .filter((f) => f !== TOKENS_FILE.split("/").join(sep));

  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("%s contains no colour literal", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    const offences = PATTERNS.flatMap(({ name, re }) =>
      Array.from(source.matchAll(re)).map((m) => {
        const line = source.slice(0, m.index).split("\n").length;
        return `${file}:${line} — ${name} "${m[0]}"`;
      }),
    );

    expect(offences, offences.join("\n")).toEqual([]);
  });

  it("would catch a literal if one were introduced", () => {
    const sample = "const c = '#2BD97C';";
    const hit = PATTERNS.some(({ re }) => new RegExp(re.source, re.flags).test(sample));
    expect(hit).toBe(true);
  });
});
