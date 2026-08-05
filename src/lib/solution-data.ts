import "server-only";

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parsePostflopTemplate,
  parsePreflopNode,
  type PostflopTemplate,
  type PreflopNode,
} from "@/poker/solutions";
import type { SolutionData } from "@/poker/generator";

/**
 * Loads and validates the on-disk solution set.
 *
 * Read once per process and held in module scope: these files never change at
 * runtime, and re-reading 43 nodes on every drill request would be pure
 * latency on the hottest path in the product.
 *
 * Every file goes through the parser rather than being cast. A malformed node
 * that reaches the generator produces a spot with a broken strategy, and the
 * user is graded against it — the failure is silent and the damage is to their
 * learning, so it has to fail loudly here instead.
 */

const ROOT = resolve(process.cwd(), "src/content/solutions");

let cached: SolutionData | null = null;

function loadDirectory<T>(dir: string, parse: (input: unknown, source: string) => T): T[] {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    // An absent directory is a legitimate state before the content lands.
    return [];
  }

  return entries.map((file) => {
    const path = join(dir, file);
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parse(raw, path);
  });
}

export function loadSolutionData(): SolutionData {
  if (cached !== null) return cached;

  const preflop: PreflopNode[] = loadDirectory(join(ROOT, "preflop"), parsePreflopNode);
  const postflop: PostflopTemplate[] = loadDirectory(join(ROOT, "postflop"), parsePostflopTemplate);

  if (preflop.length === 0) {
    throw new Error(
      `No preflop solution nodes found under ${ROOT}/preflop — the drill generator has nothing to draw from.`,
    );
  }

  cached = { preflop, postflop };
  return cached;
}

/** Test-only. Drops the module-scope cache. */
export function __resetSolutionCache(): void {
  cached = null;
}
