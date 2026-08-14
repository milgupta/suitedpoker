/**
 * The one hand played before the paywall.
 *
 * Two properties carry the whole feature. The spot must never be PURE — a
 * frequency bar showing one action at 100% demonstrates a right/wrong app,
 * which is what every competitor already is. And the diagnosis line must be
 * SPECIFIC — "you folded AJo from the button" is evidence; "you may be too
 * passive" is a horoscope, and the difference is the entire reason this screen
 * exists.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_DEMO_SPOTS,
  demoHandDetail,
  demoHandHeadline,
  demoSeedFor,
  demoSpotFor,
  DEMO_INTRO,
  frequencyPhrase,
  isDemoWorthy,
  MAX_ADDED_SECONDS,
  MAX_DEMO_TOP_FREQ,
  nounOf,
  pastTenseOf,
  positionName,
  presentTenseOf,
  timesPerHour,
  type DemoHandRecord,
} from "../../src/lib/demo-hand";
import { displayModeFor } from "../../src/poker/grader";
import type { SkillTier } from "../../src/lib/explain-policy";

const TIERS: SkillTier[] = ["never", "videos", "charts", "solver"];

/** The solution files, read directly — no server-only imports. */
function preflopNodes(): Record<string, unknown>[] {
  const dir = join(process.cwd(), "src/content/solutions/preflop");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>);
}

describe("the shortlist", () => {
  const nodes = preflopNodes();

  it("gives every skill tier at least two spots", () => {
    for (const tier of TIERS) {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) seen.add(demoSpotFor(`user-${i}`, tier).id);
      expect(seen.size, `${tier} rotates through only ${seen.size} spot(s)`).toBeGreaterThan(1);
    }
  });

  it("names a node that actually exists in the solution data", () => {
    for (const spot of ALL_DEMO_SPOTS) {
      const found = nodes.some((n) => n.heroPos === spot.heroPos && n.actionSeq === spot.actionSeq);
      expect(
        found,
        `${spot.id} points at ${spot.heroPos}:${spot.actionSeq}, which has no node`,
      ).toBe(true);
    }
  });

  it("EVERY shortlisted node has genuinely mixed hands to draw from", () => {
    /*
     * The demo is the frequency capsules doing something. A node whose every
     * hand is pure would show a single bar at 100% — a right/wrong app, which
     * is the thing this screen exists to disprove.
     */
    const rows: string[] = [];

    for (const spot of ALL_DEMO_SPOTS) {
      const node = nodes.find((n) => n.heroPos === spot.heroPos && n.actionSeq === spot.actionSeq);
      expect(node, `no node for ${spot.id}`).toBeDefined();

      const strategy = node!.strategy as Record<string, Record<string, number>>;
      let mixed = 0;
      let total = 0;

      for (const mix of Object.values(strategy)) {
        total += 1;
        const sorted = Object.values(mix).sort((a, b) => b - a);
        const top = sorted[0] ?? 1;
        // evGap is unknown here, so use the frequency half of the rule — a
        // topFreq under the threshold is `mixed` whatever the gap.
        if (displayModeFor(top, 0) !== "clear") mixed += 1;
      }

      const share = mixed / total;
      rows.push(
        `  ${spot.id.padEnd(14)} ${mixed}/${total} hands mixed (${Math.round(share * 100)}%)`,
      );
      expect(mixed, `${spot.id} has no mixed hands at all`).toBeGreaterThan(0);
    }

    console.log(`\n${"=".repeat(56)}\nDEMO SHORTLIST\n${"=".repeat(56)}\n${rows.join("\n")}\n`);
  });

  it("gives a harder spot to someone who has used a solver than to a beginner", () => {
    // A total beginner handed a 4-bet pot learns nothing and feels stupid at
    // the exact moment we ask for money. Someone who has used a solver handed
    // "is 87o a button open?" concludes the product is beneath them.
    const beginner = Math.max(
      ...Array.from({ length: 50 }, (_, i) => demoSpotFor(`u${i}`, "never").difficulty),
    );
    const advanced = Math.min(
      ...Array.from({ length: 50 }, (_, i) => demoSpotFor(`u${i}`, "solver").difficulty),
    );
    expect(advanced).toBeGreaterThan(beginner);
  });
});

describe("selection is deterministic", () => {
  it("gives the same user the same spot every time", () => {
    // A refresh must not reroll — otherwise the hand is shoppable and the
    // diagnosis is about whichever one they liked.
    for (const tier of TIERS) {
      const first = demoSpotFor("stable-user", tier);
      for (let i = 0; i < 20; i++) {
        expect(demoSpotFor("stable-user", tier).id).toBe(first.id);
      }
    }
  });

  it("gives the same user the same seed sequence", () => {
    expect(demoSeedFor("u1", 0)).toBe(demoSeedFor("u1", 0));
    expect(demoSeedFor("u1", 0)).not.toBe(demoSeedFor("u1", 1));
    expect(demoSeedFor("u1", 0)).not.toBe(demoSeedFor("u2", 0));
  });

  it("spreads users across the pool rather than giving everyone the first", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 500; i++) {
      const id = demoSpotFor(`8f14e45f-ceea-467a-9575-${String(i).padStart(12, "0")}`, "never").id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of counts) {
      // With two spots, a fair hash puts each within shouting distance of half.
      expect(count, `${id} got ${count}/500`).toBeGreaterThan(100);
    }
  });
});

describe("a pure spot is never demo-worthy", () => {
  it("accepts a genuine split, rejects a clear spot", () => {
    expect(isDemoWorthy("mixed", 0.62)).toBe(true);
    expect(isDemoWorthy("preferred", 0.7)).toBe(true);
    expect(isDemoWorthy("clear", 0.9)).toBe(false);
  });

  it("REJECTS a 100% spot even when the grader calls it 'preferred'", () => {
    /*
     * The bug this exists to stop, found by reading the e2e output rather than
     * by a failing assertion: the demo shipped saying "a solver raises it 100%
     * of the time".
     *
     * `displayModeFor` returns "preferred" for a 100%-frequency spot whose EV
     * gap is small — correct for the grader, meaning "one action is preferred
     * and the other is not costly". But the demo's entire job is showing the
     * frequency capsules with a visible second bar, and 100% has none.
     */
    expect(isDemoWorthy("preferred", 1)).toBe(false);
    expect(isDemoWorthy("mixed", 0.99)).toBe(false);
    expect(isDemoWorthy("preferred", MAX_DEMO_TOP_FREQ)).toBe(true);
    expect(isDemoWorthy("preferred", MAX_DEMO_TOP_FREQ + 0.01)).toBe(false);
  });
});

/* ── the carry-forward ────────────────────────────────────────────────────── */

function record(over: Partial<DemoHandRecord> = {}): DemoHandRecord {
  return {
    nodeRef: "BTN:rfi",
    handKey: "AJo",
    heroPos: "BTN",
    chosenAction: "fold",
    bestAction: "raise",
    grade: "mistake",
    evLoss: 0.2,
    topFreq: 0.71,
    displayMode: "mixed",
    timeMs: 6_000,
    playedAt: "2026-08-06T12:00:00.000Z",
    ...over,
  };
}

describe("the diagnosis opening line", () => {
  it("names the hand, the action and the position", () => {
    // The plan's own example. If this reads as anything less specific, the
    // demo hand has bought nothing.
    expect(demoHandHeadline(record())).toBe("You folded AJo from the button.");
  });

  it("spells out the position rather than abbreviating it", () => {
    // The audience knows the rules and nothing after them. "BTN" is the first
    // jargon a beginner meets, and this is the wrong sentence to make them
    // decode.
    const named: [string, string][] = [
      ["BTN", "button"],
      ["CO", "cutoff"],
      ["SB", "small blind"],
      ["BB", "big blind"],
      ["UTG", "first seat"],
      ["MP", "middle position"],
    ];
    for (const [pos, expected] of named) {
      expect(demoHandHeadline(record({ heroPos: pos }))).toContain(`from the ${expected}.`);
    }
  });

  it("states what a solver does, how often, and what the difference costs", () => {
    const detail = demoHandDetail(record());
    expect(detail).toContain("raises it 71%");
    expect(detail).toContain("0.2bb");
    expect(detail).toMatch(/once an hour|roughly \d+ times an hour/);
  });

  /**
   * The old assertion was `/\d+ times an hour/`, which "1 times an hour"
   * satisfies — a regex that passes on the exact string it should have caught.
   * This enumerates the counts instead of testing the two that are reachable
   * from the fixtures today.
   */
  it("never says '1 times an hour'", () => {
    expect(frequencyPhrase(1)).toBe("once an hour");
    for (const n of [0, 2, 3, 5, 12]) {
      expect(frequencyPhrase(n)).toBe(`roughly ${n} times an hour`);
    }
    for (const n of [0, 1, 2, 3, 5, 12]) {
      expect(frequencyPhrase(n)).not.toMatch(/\b1 times\b/);
    }
  });

  it("says 'that fold costs', not 'that folded costs'", () => {
    // Caught by reading the e2e output. The sentence needs the noun, and the
    // past tense reads as broken English in the one paragraph a prospect
    // reads most carefully.
    const detail = demoHandDetail(record({ chosenAction: "fold", evLoss: 0.3 }));
    expect(detail).toContain("That fold costs");
    expect(detail.toLowerCase()).not.toContain("that folded costs");

    expect(nounOf("allin")).toBe("shove");
    expect(nounOf("straddle")).toBe("straddle");
  });

  it("congratulates rather than charges when they got it right", () => {
    const detail = demoHandDetail(record({ chosenAction: "raise", evLoss: 0, grade: "best" }));
    expect(detail).toContain("You found it");
    expect(detail).not.toContain("costs");
  });

  it("NEVER puts a dollar figure on a poker result", () => {
    // Rule 5, and an ad-account boundary rather than a copy preference.
    for (const action of ["fold", "call", "raise"]) {
      for (const evLoss of [0, 0.2, 3.4]) {
        const line = `${demoHandHeadline(record({ chosenAction: action, evLoss }))} ${demoHandDetail(record({ chosenAction: action, evLoss }))}`;
        expect(line).not.toMatch(/\$/);
      }
    }
  });

  it("conjugates every legal action", () => {
    for (const action of ["fold", "call", "raise", "check", "bet", "allin"]) {
      expect(pastTenseOf(action)).not.toBe(action === "bet" ? "" : action);
      expect(presentTenseOf(action)).not.toBe(action);
    }
    expect(pastTenseOf("fold")).toBe("folded");
    expect(presentTenseOf("raise")).toBe("raises");
  });

  it("falls back to the raw action rather than crashing on an unknown one", () => {
    expect(pastTenseOf("straddle")).toBe("straddle");
    expect(positionName("HJ")).toBe("HJ");
  });

  it("quotes a frequency the user can check against the capsules", () => {
    // The number in the sentence is the same number on the frequency bar.
    expect(demoHandDetail(record({ topFreq: 0.62 }))).toContain("62%");
  });
});

describe("how often this comes up", () => {
  it("is lower for a spot that needs a villain to act first", () => {
    // Every seat is dealt in once an orbit; a spot that also requires someone
    // to raise into you happens less often than that.
    expect(timesPerHour("vs_3bet_BB")).toBeLessThan(timesPerHour("rfi"));
  });

  it("never claims less than once an hour", () => {
    for (const seq of ["rfi", "vs_rfi_BTN", "vs_3bet_BB", "vs_4bet_BTN"]) {
      expect(timesPerHour(seq)).toBeGreaterThanOrEqual(1);
    }
  });

  it("prints the numbers the copy will quote", () => {
    const rows = ["rfi", "vs_rfi_BTN", "vs_3bet_BB", "vs_4bet_BTN"].map(
      (seq) => `  ${seq.padEnd(14)} ~${timesPerHour(seq)}x per hour`,
    );
    console.log(`\nSPOT FREQUENCY\n${rows.join("\n")}\n`);
  });
});

describe("the framing", () => {
  it("promises no judgement, because the point is to see how they think", () => {
    expect(DEMO_INTRO.body.toLowerCase()).toContain("no right or wrong");
  });

  it("budgets under 45 seconds of added funnel", () => {
    expect(MAX_ADDED_SECONDS).toBe(45);
  });
});
