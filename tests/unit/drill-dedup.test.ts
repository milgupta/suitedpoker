import { describe, expect, it } from "vitest";
import {
  RECENT_NODES_WINDOW,
  exclusionAttempts,
  generateSpotExcludingRecent,
  parseRecentNodes,
  pushRecentNode,
} from "@/lib/drill-dedup";
import { generateSpot, type SolutionData, type SpotConfig } from "@/poker/generator";
import { isServableNode } from "@/poker/node-status";
import { loadPostflopTemplates, loadPreflopNodes } from "./poker/helpers/load-solutions";

/**
 * The serving pool, quarantine applied — the same set loadSolutionData() hands
 * the route, rebuilt here because that module is `server-only`.
 */
const data: SolutionData = {
  preflop: loadPreflopNodes().filter((node) => isServableNode(node.ref)),
  postflop: loadPostflopTemplates(),
};

/** Serves `count` spots the way the route does: window in, served ref pushed. */
function simulateSession(config: SpotConfig, count: number): string[] {
  let recent: string[] = [];
  const refs: string[] = [];
  for (let i = 0; i < count; i++) {
    const { spot } = generateSpotExcludingRecent(config, recent, data, `session-seed-${i}`);
    refs.push(spot.nodeRef);
    recent = pushRecentNode(recent, spot.nodeRef);
  }
  return refs;
}

function maxRepeatFreeStretch(refs: readonly string[]): number {
  // The shortest distance between two servings of the same ref.
  let shortest = Number.POSITIVE_INFINITY;
  const lastSeen = new Map<string, number>();
  refs.forEach((ref, index) => {
    const previous = lastSeen.get(ref);
    if (previous !== undefined) shortest = Math.min(shortest, index - previous);
    lastSeen.set(ref, index);
  });
  return shortest;
}

describe("parseRecentNodes", () => {
  it("tolerates garbage from the cache", () => {
    expect(parseRecentNodes(null)).toEqual([]);
    expect(parseRecentNodes("not-an-array")).toEqual([]);
    expect(parseRecentNodes(42)).toEqual([]);
    expect(parseRecentNodes([1, "BTN:rfi", null, "CO:rfi"])).toEqual(["BTN:rfi", "CO:rfi"]);
  });

  it("caps an oversized stored window at the newest entries", () => {
    const oversized = Array.from({ length: 30 }, (_, i) => `node-${i}`);
    const parsed = parseRecentNodes(oversized);
    expect(parsed).toHaveLength(RECENT_NODES_WINDOW);
    expect(parsed[parsed.length - 1]).toBe("node-29");
  });
});

describe("pushRecentNode", () => {
  it("appends newest last and caps at the window", () => {
    let recent: string[] = [];
    for (let i = 0; i < RECENT_NODES_WINDOW + 5; i++) {
      recent = pushRecentNode(recent, `node-${i}`);
    }
    expect(recent).toHaveLength(RECENT_NODES_WINDOW);
    expect(recent[recent.length - 1]).toBe(`node-${RECENT_NODES_WINDOW + 4}`);
    expect(recent[0]).toBe("node-5");
  });

  it("moves a re-served ref to the newest slot instead of duplicating", () => {
    const recent = pushRecentNode(["a", "b", "c"], "a");
    expect(recent).toEqual(["b", "c", "a"]);
  });
});

describe("exclusionAttempts", () => {
  it("is strictest first, drops oldest one at a time, ends empty", () => {
    expect(exclusionAttempts(["a", "b", "c"])).toEqual([["a", "b", "c"], ["b", "c"], ["c"], []]);
    expect(exclusionAttempts([])).toEqual([[]]);
  });
});

describe("generateSpotExcludingRecent", () => {
  it("never repeats within a full window on the open preflop pool", () => {
    const refs = simulateSession({ type: "preflop" }, 40);
    // Window of 12: any 13 consecutive hands are 13 distinct situations.
    expect(maxRepeatFreeStretch(refs)).toBeGreaterThan(RECENT_NODES_WINDOW);
  });

  it("cycles the whole 3-bet focus pool before any repeat", () => {
    const pool = data.preflop.filter((n) => n.actionSeq.startsWith("vs_3bet_"));
    expect(pool.length).toBe(8);

    const refs = simulateSession({ type: "preflop", tags: ["3bet"] }, 20);
    // The first 8 serves are the 8 distinct nodes — the whole pool, cycled.
    expect(new Set(refs.slice(0, pool.length)).size).toBe(pool.length);
    expect(maxRepeatFreeStretch(refs)).toBeGreaterThanOrEqual(pool.length);
  });

  it("cycles the whole postflop focus pool before any repeat", () => {
    const config: SpotConfig = {
      type: "postflop",
      tags: ["dry", "ace-high", "wet", "connected"],
    };
    const pool = data.postflop.filter((t) =>
      ["dry", "ace-high", "wet", "connected"].some((tag) =>
        [...t.boardTags, t.street, "postflop"].includes(tag),
      ),
    );
    expect(pool.length).toBeGreaterThan(RECENT_NODES_WINDOW);

    const refs = simulateSession(config, 20);
    expect(new Set(refs.slice(0, pool.length)).size).toBe(pool.length);
    expect(maxRepeatFreeStretch(refs)).toBeGreaterThanOrEqual(pool.length);
  });

  it("relaxes the window instead of failing when it empties a pinned pool", () => {
    // A lesson pin can match exactly one node. With that node in the window,
    // full exclusion empties the pool — the deal must still succeed.
    const pinned = data.preflop[0]!;
    const config: SpotConfig = {
      type: "preflop",
      heroPos: pinned.heroPos,
      actionSeq: pinned.actionSeq,
    };
    const recent = [pinned.ref, "some-other-node"];

    const served = generateSpotExcludingRecent(config, recent, data, "pinned-seed");
    expect(served.spot.nodeRef).toBe(pinned.ref);
    expect(served.config.excludeNodeRefs).not.toContain(pinned.ref);
  });

  it("keeps caller-pinned exclusions in every attempt", () => {
    const banned = data.preflop.map((n) => n.ref).slice(0, 1);
    const refs = simulateSession({ type: "preflop", excludeNodeRefs: banned }, 30);
    expect(refs).not.toContain(banned[0]);
  });

  it("stores a config the answer route can regenerate from", () => {
    // /api/drills/answer replays generateSpot(stored.config, data, seed) and
    // 409s on a nodeRef/handKey mismatch, so the returned config + seed must
    // reproduce the served spot exactly.
    let recent: string[] = [];
    for (let i = 0; i < 15; i++) {
      const seed = `regen-seed-${i}`;
      const served = generateSpotExcludingRecent({ type: "preflop" }, recent, data, seed);
      const replay = generateSpot(served.config, data, seed);
      expect(replay.nodeRef).toBe(served.spot.nodeRef);
      expect(replay.handKey).toBe(served.spot.handKey);
      recent = pushRecentNode(recent, served.spot.nodeRef);
    }
  });

  it("throws when the config itself matches nothing, even with no exclusions", () => {
    expect(() =>
      generateSpotExcludingRecent(
        { type: "preflop", actionSeq: "no_such_sequence" },
        [],
        data,
        "seed",
      ),
    ).toThrow();
  });
});
