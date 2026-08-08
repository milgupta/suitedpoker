/**
 * The poker engine is not in the marketing bundle.
 *
 * `src/poker` is the moat: the hand evaluator, the spot generator, and the
 * grader with its band boundaries. Every byte of it that reaches the landing
 * page is both dead weight on the one page every ad click pays for AND a free
 * copy of the thing competitors would have to rebuild.
 *
 * A static import-graph walk rather than a bundle-analyzer run, so it works in
 * CI without a build and cannot go stale against a changed output format.
 *
 * THE WALK STOPS AT `server-only`. A module that imports it cannot end up in a
 * browser bundle — Next fails the build if it does — so following through one
 * would report the engine as "in the marketing bundle" purely because a server
 * component reads three numbers off it at render time. That is a false alarm,
 * and a check that cries wolf gets deleted.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Resolves an import specifier to a file on disk, or null for a package. */
function resolveImport(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** A module that cannot reach the browser, by construction. */
function isServerOnly(file: string): boolean {
  return /^\s*import\s+["']server-only["']/m.test(readFileSync(file, "utf8"));
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const found: string[] = [];
  // Static imports and re-exports. A dynamic import() is deliberately excluded:
  // that is exactly the code-splitting boundary this test wants people to use.
  //
  // `import type` / `export type` are excluded because they EMIT NOTHING. A
  // type annotation naming `PreflopNode` costs zero bytes in the browser, and
  // counting it would report weight that does not exist — the same cry-wolf
  // failure the `server-only` rule above exists to avoid.
  for (const match of source.matchAll(
    /(?:^|\n)\s*(?:import|export)(?!\s+type\s)[^;]*?from\s+["']([^"']+)["']/g,
  )) {
    const spec = match[1];
    if (spec !== undefined) found.push(spec);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) {
    const spec = match[1];
    if (spec !== undefined) found.push(spec);
  }
  return found;
}

/** Every local file reachable from an entry point by STATIC import. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    // Reached, recorded, and not followed through: whatever it imports is
    // server-side too.
    if (file !== entry && isServerOnly(file)) continue;

    for (const specifier of importsOf(file)) {
      const resolved = resolveImport(specifier, file);
      if (resolved !== null && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return seen;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("the marketing bundle", () => {
  const landing = join(SRC, "app", "page.tsx");

  it("has a landing page to analyse", () => {
    expect(existsSync(landing)).toBe(true);
  });

  /**
   * The range grid's own coordinate system, and the only part of `src/poker`
   * the landing page is allowed to ship.
   *
   * `RangeGrid` needs `HAND_KEYS` and `GRID_SIZE` to lay out 169 cells, and
   * `range.ts` reaches `cards.ts` for rank and suit helpers. The alternative is
   * a marketing copy of the grid with its own hardcoded list of 169 hands —
   * a second source of truth for the thing the page exists to prove, which is
   * a worse outcome than the bytes.
   *
   * Everything else stays banned, and that ban is the point: `evaluator.ts`,
   * `handclass.ts`, `grader.ts`, `generator.ts` and `solutions.ts` are the
   * moat, and the first version of the new landing page pulled all five in
   * through one `bandFor` import in a client component.
   */
  const GRID_PRIMITIVES = [join("src", "poker", "range.ts"), join("src", "poker", "cards.ts")];

  it("reaches NOTHING in src/poker beyond the range grid's primitives", () => {
    const reached = [...reachableFrom(landing)]
      .map((f) => relative(ROOT, f))
      .filter((f) => f.startsWith(join("src", "poker")))
      .filter((f) => !GRID_PRIMITIVES.includes(f));

    expect(
      reached,
      `the poker engine is reachable from the landing page:\n${reached.join("\n")}`,
    ).toEqual([]);
  });

  it("never ships the hand evaluator or the grader", () => {
    // Named separately from the check above so the failure message says which
    // rule broke. These four are the ones worth a build failure on their own.
    const reached = [...reachableFrom(landing)].map((f) => relative(ROOT, f));

    for (const engineFile of ["evaluator.ts", "handclass.ts", "grader.ts", "generator.ts"]) {
      expect(reached, `src/poker/${engineFile} reaches the landing page`).not.toContain(
        join("src", "poker", engineFile),
      );
    }
  });

  it("reaches the solution data ONLY behind a server-only boundary", () => {
    // loadSolutionData pulls the whole strategy set, which IS the product. The
    // landing page prints three numbers off it, and `methodology-server.ts`
    // carries `import "server-only"` so none of it can reach a browser.
    const reached = [...reachableFrom(landing)].map((f) => relative(ROOT, f));
    const solutions = reached.filter((f) => /solution-data|content[/\\]solutions/.test(f));
    expect(solutions, solutions.join("\n")).toEqual([]);

    // And the boundary that makes that true is genuinely marked.
    const guard = join(SRC, "lib", "methodology-server.ts");
    expect(readFileSync(guard, "utf8")).toMatch(/^import "server-only";/m);
  });

  it("prints what the landing page does reach", () => {
    const reached = [...reachableFrom(landing)].map((f) => relative(ROOT, f)).sort();

    console.log(
      `\n${"=".repeat(60)}\nLANDING PAGE IMPORT GRAPH (${reached.length} files)\n${"=".repeat(60)}\n` +
        `${reached.map((f) => `  ${f}`).join("\n")}\n`,
    );
  });
});

describe("the poker engine stays pure", () => {
  // The non-negotiable rule 1, checked from the other direction: eslint owns
  // the import restriction, this owns the reachability.
  const engineFiles = walk(join(SRC, "poker"));

  it("has engine files", () => {
    expect(engineFiles.length).toBeGreaterThan(5);
  });

  it("imports nothing from react, next, or the database", () => {
    const offences: string[] = [];

    for (const file of engineFiles) {
      for (const specifier of importsOf(file)) {
        if (/^(react|next|@supabase|drizzle|postgres)($|\/)/.test(specifier)) {
          offences.push(`${relative(ROOT, file)} → ${specifier}`);
        }
        if (specifier.startsWith("@/db") || specifier.startsWith("@/lib/supabase")) {
          offences.push(`${relative(ROOT, file)} → ${specifier}`);
        }
      }
    }

    expect(offences, offences.join("\n")).toEqual([]);
  });
});
