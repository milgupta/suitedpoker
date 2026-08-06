import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parsePreflopNode, type PreflopNode } from "@/poker/solutions";

/** Loads the shipped preflop set. Shared so each test does not re-roll it. */
export function loadPreflopNodes(): PreflopNode[] {
  const dir = resolve(process.cwd(), "src/content/solutions/preflop");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => parsePreflopNode(JSON.parse(readFileSync(join(dir, name), "utf8")), name));
}
