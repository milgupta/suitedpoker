/**
 * The two layers that re-key a decision on something finer than its node.
 *
 * `refine.ts` keys a postflop decision on the actual combo and board; before it
 * the whole postflop product was 130 answers, and `AhKh` on `Ah 7d 2c` graded
 * identically to `AcKs` on `As 8h 3d`. `sizing.ts` keys a preflop decision on
 * the raise hero faces; before it every node was authored against exactly one
 * price and the most transferable preflop lesson there is — a bigger raise
 * means a narrower defence — could not be asked at all.
 *
 * Both are bounded models rather than solves, so what is asserted here is the
 * part that is actually claimed: the DIRECTION is right, the bounds hold, and
 * neither layer can invent a line the authored data does not play.
 */

import { describe, expect, it } from "vitest";
import { cardsFromString, type Card } from "../../../src/poker/cards";
import { classifyHand } from "../../../src/poker/handclass";
import { loadSolutionData } from "../../../src/lib/solution-data";
import {
  comboFeatures,
  deriveIndifferentEv,
  featureKey,
  MAX_SHIFT,
  refineEntry,
} from "../../../src/poker/refine";
import {
  BASELINE_OPEN_CHIPS,
  OPEN_SIZES,
  THREE_BET_SIZES,
  FOUR_BET_SIZES,
  sizedPotBb,
  sizedRow,
  sizesFor,
} from "../../../src/poker/sizing";
import { getPostflopStrategy } from "../../../src/poker/solutions";
import { HAND_KEYS } from "../../../src/poker/range";
import { Range, randomHandFromRange } from "../../../src/poker/range";
import { createRng } from "../../../src/poker/cards";
import { generateSpot } from "../../../src/poker/generator";

const data = loadSolutionData();

const pair = (text: string): readonly [Card, Card] => {
  const [a, b] = cardsFromString(text);
  return [a!, b!];
};

describe("postflop combo refinement", () => {
  it("never shifts a strategy further than the declared bound", () => {
    const rng = createRng("refine-bound");
    let checked = 0;
    for (const template of data.postflop) {
      const heroRange = Range.parse(template.heroRange);
      for (const boardText of template.exampleBoards) {
        const board = cardsFromString(boardText);
        for (let i = 0; i < 300; i++) {
          const combo = randomHandFromRange(heroRange, board, rng);
          if (combo === undefined) continue;
          const hole = [combo[0], combo[1]] as const;
          const handClass = classifyHand(hole, board);
          const entry = getPostflopStrategy(template, handClass);
          if (entry === undefined) continue;

          const refined = refineEntry(entry, template.actions, { hole, board });
          for (const action of template.actions) {
            const before = entry.strategy[action] ?? 0;
            const after = refined.strategy[action] ?? 0;
            expect(
              Math.abs(after - before),
              `${template.id}/${handClass} moved ${action} by more than ${MAX_SHIFT}`,
            ).toBeLessThanOrEqual(MAX_SHIFT + 1e-9);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("never invents a line the template does not play, and never drops one it does", () => {
    // A support change would be this layer authoring strategy rather than
    // refining it — the one thing it must not do.
    const rng = createRng("refine-support");
    for (const template of data.postflop) {
      const heroRange = Range.parse(template.heroRange);
      for (const boardText of template.exampleBoards) {
        const board = cardsFromString(boardText);
        for (let i = 0; i < 200; i++) {
          const combo = randomHandFromRange(heroRange, board, rng);
          if (combo === undefined) continue;
          const hole = [combo[0], combo[1]] as const;
          const handClass = classifyHand(hole, board);
          const entry = getPostflopStrategy(template, handClass);
          if (entry === undefined) continue;

          const refined = refineEntry(entry, template.actions, { hole, board });
          const before = template.actions.filter((a) => (entry.strategy[a] ?? 0) > 0);
          const after = template.actions.filter((a) => (refined.strategy[a] ?? 0) > 0);
          expect(after, `${template.id}/${handClass} changed its support`).toEqual(before);
        }
      }
    }
  });

  it("leaves every refined strategy summing to one", () => {
    const rng = createRng("refine-sum");
    for (const template of data.postflop) {
      const heroRange = Range.parse(template.heroRange);
      for (const boardText of template.exampleBoards) {
        const board = cardsFromString(boardText);
        for (let i = 0; i < 200; i++) {
          const combo = randomHandFromRange(heroRange, board, rng);
          if (combo === undefined) continue;
          const hole = [combo[0], combo[1]] as const;
          const entry = getPostflopStrategy(template, classifyHand(hole, board));
          if (entry === undefined) continue;
          const refined = refineEntry(entry, template.actions, { hole, board });
          const total = template.actions.reduce((s, a) => s + (refined.strategy[a] ?? 0), 0);
          expect(total).toBeCloseTo(1, 6);
        }
      }
    }
  });

  /*
   * THE BUG THIS LOCKS DOWN. Every postflop template shipped an EV column that
   * contradicted its own frequencies: in
   * `river-facing-large-bet-after-two-calls`, `top_pair_weak_kicker` folds 65%
   * and calls 35% while pricing the call at -0.23. The file recommended a line
   * it simultaneously called a mistake, and the product printed both numbers on
   * the same screen. 118 of 130 authored cells were in that state.
   */
  it("prices every action in a mix at the same value", () => {
    const offenders: string[] = [];
    for (const template of data.postflop) {
      for (const entry of template.strategies) {
        const refined = refineEntry(entry, template.actions);
        const played = template.actions.filter((a) => (refined.strategy[a] ?? 0) > 0);
        if (played.length < 2) continue;
        const evs = played.map((a) => refined.ev[a] ?? 0);
        const spread = Math.max(...evs) - Math.min(...evs);
        if (spread > 0.011) {
          offenders.push(`${template.id}/${entry.handClass} spread ${spread.toFixed(2)}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("never prices an unplayed action at or above a played one", () => {
    for (const template of data.postflop) {
      for (const entry of template.strategies) {
        const refined = refineEntry(entry, template.actions);
        const played = template.actions.filter((a) => (refined.strategy[a] ?? 0) > 0);
        if (played.length === 0) continue;
        const value = Math.max(...played.map((a) => refined.ev[a] ?? 0));
        for (const action of template.actions) {
          if ((refined.strategy[action] ?? 0) > 0) continue;
          expect(
            refined.ev[action] ?? 0,
            `${template.id}/${entry.handClass}: ${action} is unplayed but priced at the top`,
          ).toBeLessThan(value);
        }
      }
    }
  });

  it("reads the combo features it claims to", () => {
    // Ac2c on Ks 7c 2h: three clubs with two in hand is a backdoor flush, and
    // the club ace is the nut blocker on a board showing two of them.
    const f = comboFeatures(pair("Ac 2c"), cardsFromString("Ks 7c 2h"), "bottom_pair");
    expect(f.backdoorFlush).toBe(true);

    // AhKc on Ks 7d 2c is top pair with an ace kicker.
    const strong = comboFeatures(
      pair("Ah Kc"),
      cardsFromString("Ks 7d 2c"),
      "top_pair_good_kicker",
    );
    expect(strong.strongKicker).toBe(true);

    // Ah2c on a two-heart board blocks the nut flush without making one.
    const blocker = comboFeatures(pair("Ah 2c"), cardsFromString("Kh 7h 3d"), "air");
    expect(blocker.nutSuitBlocker).toBe(true);

    // K7o on a rainbow board: no suit, four ranks apart, nothing to improve to.
    const junk = comboFeatures(pair("Kd 7c"), cardsFromString("Ah 5s 2d"), "air");
    expect(junk.offsuitDisconnected).toBe(true);
    expect(junk.backdoorFlush).toBe(false);
    expect(junk.nutSuitBlocker).toBe(false);
  });

  it("splits the served postflop set into far more cells than the bare hand class", () => {
    // The whole point of the layer, measured rather than asserted from memory.
    const rng = createRng("refine-cells");
    const classCells = new Set<string>();
    const refinedCells = new Set<string>();
    for (const template of data.postflop) {
      const heroRange = Range.parse(template.heroRange);
      for (const boardText of template.exampleBoards) {
        const board = cardsFromString(boardText);
        for (let i = 0; i < 1500; i++) {
          const combo = randomHandFromRange(heroRange, board, rng);
          if (combo === undefined) continue;
          const hole = [combo[0], combo[1]] as const;
          const handClass = classifyHand(hole, board);
          if (getPostflopStrategy(template, handClass) === undefined) continue;
          classCells.add(`${template.id}|${handClass}`);
          refinedCells.add(
            `${template.id}|${handClass}|${featureKey(comboFeatures(hole, board, handClass))}`,
          );
        }
      }
    }
    expect(refinedCells.size).toBeGreaterThan(classCells.size * 2);
  });
});

describe("the indifference derivation", () => {
  it("makes a mixed continue worth exactly what folding is worth", () => {
    const ev = deriveIndifferentEv({ fold: 0.4, call: 0.6 }, ["fold", "call", "raise"] as const, {
      fold: 0,
      call: 1.2,
      raise: -0.5,
    });
    expect(ev.fold).toBe(0);
    expect(ev.call).toBe(0);
    expect(ev.raise!).toBeLessThan(0);
  });

  it("leaves a pure fold priced by the authored column", () => {
    const ev = deriveIndifferentEv({ fold: 1 }, ["fold", "call"] as const, {
      fold: 0,
      call: -2.23,
    });
    expect(ev.call).toBe(-2.23);
  });
});

describe("preflop raise sizing", () => {
  it("offers whole numbers of chips only", () => {
    for (const size of [...OPEN_SIZES, ...THREE_BET_SIZES, ...FOUR_BET_SIZES]) {
      expect(Number.isInteger(size), `${size} is not a whole number of chips`).toBe(true);
    }
  });

  it("offers no sizing at an unopened pot", () => {
    // There is no raise in front of hero to vary.
    expect(sizesFor("rfi")).toEqual([]);
  });

  it("returns the authored row unchanged at the baseline price", () => {
    for (const node of data.preflop) {
      const sizes = sizesFor(node.actionSeq);
      if (sizes.length === 0) continue;
      const baseline = sizes[0]!;
      for (const key of HAND_KEYS) {
        const row = sizedRow(node, key, baseline);
        for (const action of node.actions) {
          expect(
            row.strategy[action] ?? 0,
            `${node.ref}/${key}/${action} drifted at baseline`,
          ).toBe(node.strategy[key]?.[action] ?? 0);
        }
      }
      expect(sizedPotBb(node, baseline)).toBe(node.potBb);
    }
  });

  it("defends strictly less as the price rises, at every node", () => {
    for (const node of data.preflop) {
      const sizes = sizesFor(node.actionSeq);
      if (sizes.length === 0) continue;

      const widthAt = (chips: number): number => {
        let combos = 0;
        for (const key of HAND_KEYS) {
          const row = sizedRow(node, key, chips);
          combos += 1 - (row.strategy.fold ?? 0);
        }
        return combos;
      };

      const widths = sizes.map(widthAt);
      for (let i = 1; i < widths.length; i++) {
        // Never wider, at any node.
        expect(
          widths[i]!,
          `${node.ref} defends WIDER at ${sizes[i]} chips than at ${sizes[i - 1]}`,
        ).toBeLessThanOrEqual(widths[i - 1]!);

        // Strictly tighter where there is a range to tighten. A `vs_4bet` node
        // continues with about six hands, all of them premiums the narrowing
        // is deliberately unable to reach — "you fold less of nothing" is the
        // correct answer there, not a broken model.
        if (node.actionSeq.startsWith("vs_rfi_")) {
          expect(
            widths[i]!,
            `${node.ref} defends no tighter at ${sizes[i]} chips than at ${sizes[i - 1]}`,
          ).toBeLessThan(widths[i - 1]!);
        }
      }
    }
  });

  it("never folds a premium to a bigger raise", () => {
    // The narrowing is weighted by what a hand is worth precisely so it cannot
    // reach the top of the range. If it ever does, the weighting is broken.
    const premiums = ["AA", "KK", "QQ", "AKs"] as const;
    for (const node of data.preflop) {
      const sizes = sizesFor(node.actionSeq);
      if (sizes.length === 0) continue;
      const largest = sizes[sizes.length - 1]!;
      for (const key of premiums) {
        const authored = node.strategy[key] ?? {};
        if ((authored.fold ?? 0) > 0.05) continue; // already folded at baseline
        const row = sizedRow(node, key, largest);
        expect(row.strategy.fold ?? 0, `${node.ref} folds ${key} at ${largest} chips`).toBeLessThan(
          0.05,
        );
      }
    }
  });

  it("keeps every sized row summing to one", () => {
    for (const node of data.preflop) {
      for (const chips of sizesFor(node.actionSeq)) {
        for (const key of HAND_KEYS) {
          const row = sizedRow(node, key, chips);
          const total = node.actions.reduce((s, a) => s + (row.strategy[a] ?? 0), 0);
          expect(total, `${node.ref}/${key} at ${chips} sums to ${total}`).toBeCloseTo(1, 6);
        }
      }
    }
  });

  it("grows the pot by exactly the extra chips put in", () => {
    const node = data.preflop.find((n) => n.actionSeq.startsWith("vs_rfi_"))!;
    // 7 chips is 2 more than the 5-chip baseline, which is 1 big blind.
    expect(sizedPotBb(node, BASELINE_OPEN_CHIPS + 2)).toBe(node.potBb + 1);
  });
});

describe("postflop difficulty targeting", () => {
  /*
   * `generatePostflop` computed a difficulty onto its OUTPUT and never read
   * `config.difficulty` as an INPUT. So for eleven substages the whole adaptive
   * loop — rating → target difficulty → spot — was inert on every postflop
   * hand: a 1400-rated player and a 700-rated one drew from an identical pool.
   *
   * Nothing caught it because the returned spot always carried a plausible
   * difficulty number. The only way to see it is to ask for two different
   * targets and compare what comes back.
   */
  it("returns harder spots when asked for harder spots", () => {
    const meanAt = (difficulty: number): number => {
      let total = 0;
      const draws = 400;
      for (let i = 0; i < draws; i++) {
        total += generateSpot(
          { type: "postflop", difficulty },
          data,
          `diff:${difficulty}:${i}`,
        ).difficulty;
      }
      return total / draws;
    };

    const easy = meanAt(2);
    const hard = meanAt(9);
    expect(hard, `asking for 9 returned ${hard}, asking for 2 returned ${easy}`).toBeGreaterThan(
      easy + 0.5,
    );
  });

  it("moves toward the target rather than ignoring it", () => {
    // Not "hits it exactly": a template's hand classes only offer so many
    // difficulties, and the generator is explicit that it targets rather than
    // guarantees. Drifting AWAY from the target is the failure.
    for (const target of [2, 5, 9]) {
      let aimedError = 0;
      let blindError = 0;
      const draws = 200;
      for (let i = 0; i < draws; i++) {
        const aimed = generateSpot({ type: "postflop", difficulty: target }, data, `aim:${i}`);
        const blind = generateSpot({ type: "postflop" }, data, `aim:${i}`);
        aimedError += Math.abs(aimed.difficulty - target);
        blindError += Math.abs(blind.difficulty - target);
      }
      // STRICTLY less, and compared against the same seeds. An earlier version
      // of this asserted `aimed <= blind` per draw, which a generator that
      // ignored the target passed 100% of the time — the two spots were then
      // literally identical. A test that cannot fail is worse than no test.
      expect(
        aimedError / draws,
        `targeting ${target} was no closer than not targeting it`,
      ).toBeLessThan(blindError / draws);
    }
  });
});

describe("multiway nodes", () => {
  const multiway = data.preflop.filter(
    (n) => n.actionSeq.startsWith("vs_open_call_") || n.actionSeq.startsWith("vs_limp_"),
  );

  it("serves both multiway families", () => {
    expect(multiway.length).toBeGreaterThanOrEqual(7);
    expect(multiway.some((n) => n.actionSeq.startsWith("vs_open_call_"))).toBe(true);
    expect(multiway.some((n) => n.actionSeq.startsWith("vs_limp_"))).toBe(true);
  });

  it("puts a third player in the pot, and draws them at the table", () => {
    // The whole reason these exist: every other node resolves to hero against
    // exactly one opponent. A history that left the caller folded would be the
    // old two-handed spot wearing a new name.
    for (const node of multiway) {
      const spot = generatedSpotFor(node.ref);
      const live = spot.seats.filter((s) => !s.folded && !s.isHero);
      expect(live.length, `${node.ref} has no live opponents besides hero`).toBeGreaterThanOrEqual(
        2,
      );
    }
  });

  it("isolates a limper wider from the button than from the cutoff", () => {
    // Position is the only difference between the two nodes, so it has to be
    // the only thing that moves — and it has to move the right way.
    const raiseWidth = (ref: string): number => {
      const node = data.preflop.find((n) => n.ref === ref)!;
      return HAND_KEYS.reduce((sum, key) => sum + (node.strategy[key]?.raise ?? 0), 0);
    };
    expect(raiseWidth("BTN:vs_limp_UTG")).toBeGreaterThan(raiseWidth("CO:vs_limp_MP"));
  });

  it("calls tightest from the small blind in a squeeze spot", () => {
    // Out of position against two players with a third still to act is the
    // worst seat in the set, and the ranges have to say so.
    const callWidth = (ref: string): number => {
      const node = data.preflop.find((n) => n.ref === ref)!;
      return HAND_KEYS.reduce((sum, key) => sum + (node.strategy[key]?.call ?? 0), 0);
    };
    expect(callWidth("SB:vs_open_call_MP_CO")).toBeLessThan(callWidth("BTN:vs_open_call_UTG_MP"));
    expect(callWidth("SB:vs_open_call_MP_CO")).toBeLessThan(callWidth("BB:vs_open_call_CO_BTN"));
  });
});

/** A spot at a named node, for the seat assertions above. */
function generatedSpotFor(ref: string) {
  const [heroPos, actionSeq] = ref.split(":");
  return generateSpot(
    {
      type: "preflop",
      heroPos: heroPos as never,
      actionSeq: actionSeq!,
    },
    data,
    `multiway:${ref}`,
  );
}
