/**
 * The quarantine, and everything that points at a node.
 *
 * Holding a node back is a data decision, but it silently becomes a PRODUCT
 * decision the moment something references the node by name: the demo hand's
 * shortlist and every lesson's `drillFilter` name spots directly, and a filter
 * that matches nothing degrades to a generic session rather than erroring. That
 * is the right runtime behaviour and the worst possible failure mode to debug —
 * the lesson still opens, it just stops teaching what it says it teaches.
 *
 * So: every reference resolves to a SERVABLE node, checked here rather than
 * noticed in production.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAllSolutionData, loadSolutionData } from "@/lib/solution-data";
import { generateSpot, tagsForNode } from "@/poker/generator";
import { nodeRefOf } from "@/poker/solutions";
import { isServableNode, QUARANTINED_NODES } from "@/poker/node-status";
import { ALL_DEMO_SPOTS } from "@/lib/demo-hand";

const CURRICULUM = resolve(process.cwd(), "src/content/curriculum");

interface DrillFilter {
  type: "preflop" | "postflop";
  tags?: string[];
  heroPos?: string;
  actionSeq?: string;
  templateId?: string;
}

/** Every lesson's `drillFilter`, read out of the MDX frontmatter. */
function drillFilters(): Array<{ file: string; filter: DrillFilter }> {
  const out: Array<{ file: string; filter: DrillFilter }> = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".mdx")) continue;

      const line = readFileSync(path, "utf8")
        .split("\n")
        .find((l) => l.startsWith("drillFilter:"));
      if (line === undefined) continue;

      out.push({
        file: entry.name,
        filter: JSON.parse(line.slice("drillFilter:".length).trim()) as DrillFilter,
      });
    }
  };

  walk(CURRICULUM);
  return out;
}

describe("the quarantine itself", () => {
  const all = loadAllSolutionData();
  const served = loadSolutionData();

  it("names only refs that exist on disk", () => {
    const onDisk = new Set(all.preflop.map((n) => n.ref));
    for (const node of QUARANTINED_NODES) {
      expect(onDisk.has(node.ref), `${node.ref} is quarantined but does not exist`).toBe(true);
    }
  });

  it("carries a written reason for every held-back node", () => {
    for (const node of QUARANTINED_NODES) {
      // An allowlist nobody can audit becomes permanent by default.
      expect(node.reason.length, `${node.ref} has no reason`).toBeGreaterThan(40);
    }
  });

  it("actually withholds them from the generator", () => {
    for (const node of served.preflop) {
      expect(isServableNode(node.ref), `${node.ref} is quarantined but still served`).toBe(true);
    }
    expect(served.preflop.length).toBe(all.preflop.length - QUARANTINED_NODES.length);
  });

  it("leaves every position able to open", () => {
    // Losing an `rfi` node would silently delete a whole lesson's worth of
    // drills, and it is the family the product is most confident about.
    for (const position of ["UTG", "MP", "CO", "BTN", "SB"]) {
      expect(
        served.preflop.some((n) => n.heroPos === position && n.actionSeq === "rfi"),
        `${position} can no longer open`,
      ).toBe(true);
    }
  });
});

describe("everything that names a node", () => {
  const served = loadSolutionData();
  const refs = new Set(served.preflop.map((n) => n.ref));

  it("deals every demo-hand shortlist entry from a servable node", () => {
    for (const spot of ALL_DEMO_SPOTS) {
      const ref = nodeRefOf(spot.heroPos, spot.actionSeq);
      expect(refs.has(ref), `demo spot ${spot.id} points at ${ref}, which is not served`).toBe(
        true,
      );
    }
  });

  it("matches at least one servable node for every lesson's drillFilter", () => {
    for (const { file, filter } of drillFilters()) {
      if (filter.type !== "preflop") continue;

      const matches = served.preflop.filter((node) => {
        if (filter.heroPos !== undefined && node.heroPos !== filter.heroPos) return false;
        if (filter.actionSeq !== undefined && node.actionSeq !== filter.actionSeq) return false;
        if (filter.tags !== undefined && filter.tags.length > 0) {
          const tags = tagsForNode(node);
          if (!filter.tags.some((tag) => tags.includes(tag))) return false;
        }
        return true;
      });

      expect(matches.length, `${file} drills nothing: ${JSON.stringify(filter)}`).toBeGreaterThan(
        0,
      );
    }
  });

  it("can actually generate a spot for every lesson's preflop filter", () => {
    // Matching a node is not the same as being able to deal from it.
    for (const { file, filter } of drillFilters()) {
      if (filter.type !== "preflop") continue;
      expect(() =>
        generateSpot(
          {
            type: "preflop",
            tags: filter.tags,
            heroPos: filter.heroPos as never,
            actionSeq: filter.actionSeq,
          },
          served,
          `lesson-${file}`,
        ),
      ).not.toThrow();
    }
  });
});
