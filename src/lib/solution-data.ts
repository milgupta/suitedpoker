import "server-only";

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parsePostflopTemplate,
  parsePreflopNode,
  type PostflopTemplate,
  type PreflopNode,
} from "@/poker/solutions";
import { isServableNode } from "@/poker/node-status";
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
let all: SolutionData | null = null;
let version: string | null = null;

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

/** Everything on disk, quarantine ignored. For tooling and the data audit. */
export function loadAllSolutionData(): SolutionData {
  if (all !== null) return all;

  const preflop: PreflopNode[] = loadDirectory(join(ROOT, "preflop"), parsePreflopNode);
  const postflop: PostflopTemplate[] = loadDirectory(join(ROOT, "postflop"), parsePostflopTemplate);

  if (preflop.length === 0) {
    throw new Error(
      `No preflop solution nodes found under ${ROOT}/preflop — the drill generator has nothing to draw from.`,
    );
  }

  all = { preflop, postflop };
  return all;
}

/**
 * What the product is allowed to drill somebody on.
 *
 * Quarantined nodes are filtered HERE rather than at each call site, so there is
 * one place to audit and no route can accidentally serve one. The files stay on
 * disk — see `src/poker/node-status.ts` for what is held back and why.
 */
export function loadSolutionData(): SolutionData {
  if (cached !== null) return cached;

  const everything = loadAllSolutionData();
  const preflop = everything.preflop.filter((node) => isServableNode(node.ref));

  if (preflop.length === 0) {
    throw new Error(
      "Every preflop node is quarantined — the drill generator has nothing to draw from.",
    );
  }

  cached = { preflop, postflop: everything.postflop };
  return cached;
}

/**
 * A content hash of the strategy the product actually serves.
 *
 * Explanations are cached for thirty days against the node and the hand. That
 * was fine while the data never changed; the moment a node's frequencies or EVs
 * are repaired, every cached explanation of it describes the OLD strategy —
 * confidently, in a product whose entire claim is that the words match the
 * numbers. The numbers on screen would come from the new file and the sentence
 * under them from the old one.
 *
 * Hashing the served set means an edit invalidates exactly the explanations it
 * invalidated, with no flush to remember and no version constant to bump.
 */
export function solutionSetVersion(): string {
  if (version !== null) return version;

  const data = loadSolutionData();
  const hash = createHash("sha256");

  for (const node of [...data.preflop].sort((a, b) => a.ref.localeCompare(b.ref))) {
    hash.update(node.ref);
    hash.update(JSON.stringify(node.strategy));
    hash.update(JSON.stringify(node.ev));
  }
  for (const template of [...data.postflop].sort((a, b) => a.id.localeCompare(b.id))) {
    hash.update(template.id);
    hash.update(JSON.stringify(template));
  }

  version = hash.digest("hex").slice(0, 16);
  return version;
}

/** Test-only. Drops the module-scope cache. */
export function __resetSolutionCache(): void {
  cached = null;
  all = null;
  version = null;
}
