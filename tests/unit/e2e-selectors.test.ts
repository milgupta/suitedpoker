/**
 * Every role+name an e2e spec asserts still exists in the source.
 *
 * Two stale assertions cost a full suite run each today. `entitlement.spec.ts`
 * waited for a heading named "Dashboard" that 5.3 replaced with the greeting,
 * and `auth.spec.ts` had the same one in three places — a red test that had
 * been hiding a real gap (there was no sign-out control for a subscribed user
 * at all, and the failing assertion was the only thing pointing at it).
 *
 * The e2e suite finds these eventually. It takes about forty minutes and a
 * running server. This takes a second, and it runs on every commit.
 *
 * It is a STRING SEARCH, not a render. It cannot prove the element appears on
 * the right page — only that the copy still exists somewhere. That is exactly
 * the failure mode it is for: a rename.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const SPECS = join(ROOT, "tests", "e2e");

function walk(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, match);
    return match.test(entry) ? [full] : [];
  });
}

/** All source text a rendered string could come from. */
const sourceText = walk(SRC, /\.(tsx?|mdx)$/)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

interface Assertion {
  readonly spec: string;
  readonly role: string;
  readonly name: string;
}

function assertions(): Assertion[] {
  const found: Assertion[] = [];

  for (const file of walk(SPECS, /\.spec\.ts$/)) {
    const source = readFileSync(file, "utf8");
    const spec = relative(ROOT, file);

    for (const match of source.matchAll(
      /getByRole\(\s*"(heading|button|link)"\s*,\s*\{\s*name:\s*"([^"]+)"/g,
    )) {
      const role = match[1];
      const name = match[2];
      if (role === undefined || name === undefined) continue;
      found.push({ spec, role, name });
    }
  }

  return found;
}

describe("e2e selectors point at copy that still exists", () => {
  const all = assertions();

  it("found assertions to check", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it("every asserted role+name appears somewhere in src/", () => {
    const missing = all
      .filter(({ name }) => {
        // Apostrophes are escaped differently in JSX (&apos;) than in a spec.
        const plain = name.replace(/'/g, "");
        return !sourceText.includes(name) && !sourceText.replace(/&apos;|'/g, "").includes(plain);
      })
      .map((a) => `${a.spec}: getByRole("${a.role}", { name: "${a.name}" })`);

    expect(
      [...new Set(missing)],
      `these assert copy that no longer exists — a rename, not a product bug:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("prints what it checked", () => {
    const byRole = all.reduce<Record<string, number>>((acc, a) => {
      acc[a.role] = (acc[a.role] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `\n  e2e selector check: ${all.length} assertions across ${new Set(all.map((a) => a.spec)).size} specs ` +
        `(${Object.entries(byRole)
          .map(([r, n]) => `${n} ${r}`)
          .join(", ")})\n`,
    );
  });
});
