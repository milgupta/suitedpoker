/**
 * The bot-realism gate, and the unit tests for the machinery behind it.
 *
 * The 4,000-hand audit that motivated this pass measured a hero open ending
 * the hand instantly ~50% of the time on the online/boss presets, flop c-bets
 * taking it down another ~70%, and ~20% of hands reaching showdown — a table
 * that plays like a script, not like poker. The bench below replays that
 * audit with a scripted hero (opens 2.5bb, c-bets 2/3 pot, never folds) and
 * asserts the bounds the pass was tuned to. The RNG is seeded, so these are
 * exact numbers, not flaky statistics; the bounds are still generous so an
 * unrelated data repair does not turn them red.
 */

import { describe, expect, it } from "vitest";

import {
  applyDefendBand,
  applyMixNoise,
  applyPriceScale,
  archetypeFrequencies,
  passiveFallback,
  pickPostflopTemplate,
  postflopContinueProbability,
  potOddsOf,
  preflopRaiseTarget,
  priceScaleFor,
} from "@/poker/bots";
import { PROFILES } from "@/poker/bots/profiles";
import { createRng } from "@/poker/cards";
import { createGame, type LegalAction } from "@/poker/gamestate";
import { buildSolutionIndex } from "@/poker/solutions";

import { loadPreflopNodes } from "./helpers/load-solutions";
import { BENCH_PRESETS, loadBenchBotData, runBench } from "./helpers/sim-bench";

const data = loadBenchBotData();

/* ── The gate ────────────────────────────────────────────────────────────── */

describe("the realism bench", () => {
  // Same seed as scripts/sim-bench.ts, so the numbers printed there are the
  // numbers asserted here.
  const HANDS = 4000;
  const cardroom = runBench("cardroom", BENCH_PRESETS.cardroom!, HANDS, "sim-bench-v1", data);
  const online = runBench("online", BENCH_PRESETS.online!, HANDS, "sim-bench-v1", data);
  const boss = runBench("boss", BENCH_PRESETS.boss!, HANDS, "sim-bench-v1", data);

  it("conserves chips through every benched hand", () => {
    for (const m of [cardroom, online, boss]) {
      expect(m.chipDrift, `${m.preset} leaked chips`).toBe(0);
    }
  });

  it("does not fold the cardroom around to a single open more than 15% of the time", () => {
    expect(cardroom.instantFoldAroundPct).toBeLessThanOrEqual(15);
  });

  it("does not fold online or boss around to a single open more than 35% of the time", () => {
    expect(online.instantFoldAroundPct).toBeLessThanOrEqual(35);
    expect(boss.instantFoldAroundPct).toBeLessThanOrEqual(35);
  });

  it("reaches showdown at least 35% of hands on cardroom and 25% on boss", () => {
    expect(cardroom.showdownPct).toBeGreaterThanOrEqual(35);
    expect(boss.showdownPct).toBeGreaterThanOrEqual(25);
  });

  it("folds to a c-bet at most 55% of the time on every preset", () => {
    for (const m of [cardroom, online, boss]) {
      expect(m.foldToCbetPct, `${m.preset} fold-to-cbet`).toBeLessThanOrEqual(55);
    }
  });
}, 300_000);

/* ── Price awareness ─────────────────────────────────────────────────────── */

describe("price awareness", () => {
  it("computes pot odds as call over pot-after-call", () => {
    expect(potOddsOf(3, 8)).toBeCloseTo(3 / 11);
    expect(potOddsOf(0, 8)).toBe(0);
    expect(potOddsOf(-2, 8)).toBe(0);
  });

  it("scales continue up at a good price and down at a bad one, for every profile", () => {
    for (const profile of Object.values(PROFILES)) {
      const cheap = priceScaleFor(0.15, profile);
      const standard = priceScaleFor(0.35, profile);
      const dear = priceScaleFor(0.48, profile);
      expect(cheap, `${profile.id} at a cheap price`).toBeGreaterThanOrEqual(standard);
      expect(cheap, `${profile.id} loosens at a cheap price`).toBeGreaterThan(1);
      expect(standard, `${profile.id} ordering`).toBeGreaterThan(dear);
      expect(dear, `${profile.id} at a dear price`).toBeLessThan(1);
    }
  });

  it("gives a min-raise and an overbet different responses", () => {
    // The audit's exact complaint: state.currentBet was never read, so both
    // sizes got the identical action mix.
    const mixed = { fold: 0.6, call: 0.3, raise: 0.1 };
    const profile = PROFILES.tag;
    const minRaise = applyPriceScale(mixed, priceScaleFor(potOddsOf(2, 9), profile));
    const overbet = applyPriceScale(mixed, priceScaleFor(potOddsOf(78, 85), profile));
    expect(minRaise.fold!).toBeLessThan(mixed.fold);
    expect(overbet.fold!).toBeGreaterThan(mixed.fold);
    expect(minRaise.fold!).toBeLessThan(overbet.fold!);
  });

  it("never makes a pure fold continue, and never folds a pure continue, at any price", () => {
    for (const scale of [0.45, 0.8, 1, 1.3, 1.8]) {
      expect(applyPriceScale({ fold: 1 }, scale).fold).toBe(1);
      const strong = applyPriceScale({ fold: 0, call: 0.4, raise: 0.6 }, scale);
      expect(strong.fold).toBe(0);
      expect(strong.call! + strong.raise!).toBeCloseTo(1, 9);
    }
  });

  it("keeps distributions normalised through the price scale", () => {
    const scaled = applyPriceScale({ fold: 0.7, call: 0.2, raise: 0.1 }, 1.5);
    const total = Object.values(scaled).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it("damps how much a good price loosens a fearful profile", () => {
    // A rock getting a great price is still a rock; a station barely changes
    // either way. The asymmetry lives in the exponent.
    const nit = priceScaleFor(0.25, PROFILES.nit);
    const gto = priceScaleFor(0.25, PROFILES.gto);
    expect(nit).toBeLessThan(gto);
  });

  it("tightens the postflop continue as the bet grows", () => {
    for (const profile of Object.values(PROFILES)) {
      const vsThirdPot = postflopContinueProbability(0.4, 0.2, profile);
      const vsPot = postflopContinueProbability(0.4, 0.33, profile);
      const vsOverbet = postflopContinueProbability(0.4, 0.45, profile);
      expect(vsThirdPot, profile.id).toBeGreaterThan(vsPot);
      expect(vsPot, profile.id).toBeGreaterThan(vsOverbet);
    }
  });

  it("orders postflop stickiness by archetype: station loosest, nit tightest", () => {
    const continueAt = (id: keyof typeof PROFILES) =>
      postflopContinueProbability(0.35, 0.3, PROFILES[id]);
    expect(continueAt("station")).toBeGreaterThan(continueAt("tag"));
    expect(continueAt("maniac")).toBeGreaterThan(continueAt("tag"));
    expect(continueAt("tag")).toBeGreaterThan(continueAt("nit"));
  });
});

/* ── The defend band ─────────────────────────────────────────────────────── */

describe("the defend band", () => {
  it("defends a hand just under the range boundary at a good price", () => {
    const banded = applyDefendBand({ fold: 1, call: 0 }, 1.6, 0.68, 0.7);
    expect(banded.fold!).toBeLessThan(1);
    expect(banded.call!).toBeGreaterThan(0.2);
  });

  it("leaves trash folded at any price", () => {
    // 72o sits ~60 percentile points under a typical range boundary; the
    // exponential decay must have zeroed the band long before that.
    const trash = applyDefendBand({ fold: 1, call: 0 }, 1.8, 0.05, 0.7);
    expect(trash.fold!).toBeGreaterThan(0.99);
  });

  it("does nothing at a neutral or bad price", () => {
    expect(applyDefendBand({ fold: 1, call: 0 }, 1, 0.69, 0.7)).toEqual({ fold: 1, call: 0 });
    expect(applyDefendBand({ fold: 1, call: 0 }, 0.7, 0.69, 0.7)).toEqual({ fold: 1, call: 0 });
  });

  it("does not touch hands the strategy already plays", () => {
    const played = { fold: 0.4, call: 0.6 };
    expect(applyDefendBand(played, 1.6, 0.8, 0.7)).toEqual(played);
  });
});

/* ── Mixing ──────────────────────────────────────────────────────────────── */

describe("per-decision mixing", () => {
  const index = buildSolutionIndex(loadPreflopNodes());

  it("varies a pure-strategy hand across 100 decisions for every non-gto profile", () => {
    // AKs at BB:vs_rfi_BTN is (near) pure continue; without temperature every
    // one of these 100 decisions lands on the same action.
    const node = index.nodes.get("BB:vs_rfi_BTN")!;
    for (const profile of Object.values(PROFILES)) {
      if (profile.id === "gto") continue;
      const rng = createRng(`mix:${profile.id}`);
      const seen = new Set<string>();
      for (let i = 0; i < 100; i++) {
        let f = archetypeFrequencies(node, "AKs", profile, true, true);
        f = applyMixNoise(f, profile.mixTemperature);
        // Sample the way decidePreflop does.
        let target = rng();
        let choice = "fold";
        for (const [action, weight] of Object.entries(f)) {
          target -= weight;
          if (target < 0) {
            choice = action;
            break;
          }
        }
        seen.add(choice);
      }
      expect(seen.size, `${profile.id} played AKs identically 100 times`).toBeGreaterThan(1);
    }
  });

  it("is not deterministic for gto at a genuine 50/50 mix", () => {
    const rng = createRng("gto-half-mix");
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const f = applyMixNoise({ fold: 0, call: 0.5, raise: 0.5 }, PROFILES.gto.mixTemperature);
      seen.add(rng() < f.call! ? "call" : "raise");
    }
    expect(seen.size).toBe(2);
  });

  it("leaves pure folds alone — trash does not wander into pots", () => {
    expect(applyMixNoise({ fold: 1, call: 0, raise: 0 }, 0.2)).toEqual({
      fold: 1,
      call: 0,
      raise: 0,
    });
  });

  it("preserves the fold frequency and total mass", () => {
    const noised = applyMixNoise({ fold: 0.3, call: 0.5, raise: 0.2 }, 0.15);
    expect(noised.fold).toBe(0.3);
    expect(Object.values(noised).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});

/* ── Sizing ──────────────────────────────────────────────────────────────── */

describe("raise sizing", () => {
  const openState = createGame({
    seats: 6,
    button: 0,
    smallBlind: 1,
    bigBlind: 2,
    startingStacks: 200,
    seed: "sizing-open",
  });

  it("opens inside the profile's band in big blinds, with real variety", () => {
    for (const profile of Object.values(PROFILES)) {
      const rng = createRng(`size:${profile.id}`);
      const sizes = new Set<number>();
      const [min, max] = profile.openRaiseBb;
      for (let i = 0; i < 200; i++) {
        const chips = preflopRaiseTarget(openState, profile, rng);
        // Rounding to integer chips can land half a chip outside the band.
        expect(chips).toBeGreaterThanOrEqual(min * openState.config.bigBlind - 0.5);
        expect(chips).toBeLessThanOrEqual(max * openState.config.bigBlind + 0.5);
        sizes.add(chips);
      }
      // gto is exempt from the variety demand: a solver uses ONE open size,
      // and its narrow band collapses to a single chip count at 2-chip blinds.
      if (profile.id !== "gto") {
        expect(sizes.size, `${profile.id} opens one exact size every time`).toBeGreaterThan(1);
      }
    }
  });

  it("sizes a re-raise as a multiple of the bet faced", () => {
    const raised = { ...openState, currentBet: 5 };
    for (const profile of Object.values(PROFILES)) {
      const rng = createRng(`3bet:${profile.id}`);
      const [min, max] = profile.reraiseX;
      for (let i = 0; i < 100; i++) {
        const chips = preflopRaiseTarget(raised, profile, rng);
        expect(chips).toBeGreaterThanOrEqual(min * 5 - 0.5);
        expect(chips).toBeLessThanOrEqual(max * 5 + 0.5);
      }
    }
  });

  it("gives the maniac bigger opens than the nit", () => {
    expect(PROFILES.maniac.openRaiseBb[0]).toBeGreaterThan(PROFILES.nit.openRaiseBb[1]);
  });
});

/* ── Template matching ───────────────────────────────────────────────────── */

describe("pickPostflopTemplate", () => {
  const templates = data.templates!;

  it("prefers a template whose board tags match the actual board", () => {
    // A dry ace-high flop must not be answered by the monotone template just
    // because it sorts first — the readdirSync-order bug this replaces.
    const picked = pickPostflopTemplate(templates, "flop", "BTN", ["ace-high", "dry"], false);
    expect(picked).toBeDefined();
    expect(picked!.boardTags).toContain("dry");
    expect(picked!.boardTags).not.toContain("monotone");
  });

  it("picks the monotone template on a monotone board for the same seat", () => {
    const picked = pickPostflopTemplate(templates, "flop", "BTN", ["monotone", "wet"], false);
    expect(picked).toBeDefined();
    expect(picked!.boardTags).toContain("monotone");
  });

  it("never crosses streets", () => {
    for (const street of ["flop", "turn", "river"] as const) {
      const picked = pickPostflopTemplate(templates, street, "BTN", ["dry"], false);
      if (picked !== undefined) expect(picked.street).toBe(street);
    }
  });

  it("is deterministic", () => {
    const a = pickPostflopTemplate(templates, "flop", "CO", ["wet", "two-tone"], true);
    const b = pickPostflopTemplate(templates, "flop", "CO", ["wet", "two-tone"], true);
    expect(a?.id).toBe(b?.id);
  });

  it("returns undefined only when no template exists for the street", () => {
    expect(pickPostflopTemplate([], "flop", "BTN", ["dry"], false)).toBeUndefined();
    expect(pickPostflopTemplate(undefined, "flop", "BTN", ["dry"], false)).toBeUndefined();
  });
});

/* ── Fallbacks ───────────────────────────────────────────────────────────── */

describe("passiveFallback", () => {
  it("prefers check, then call, then fold", () => {
    const withCheck: LegalAction[] = [{ type: "check" }, { type: "fold" }];
    expect(passiveFallback(withCheck).type).toBe("check");

    // The load-bearing case: the bot INTENDED an action, so throwing the hand
    // away when a call is available is indefensible.
    const facingBet: LegalAction[] = [{ type: "fold" }, { type: "call", amount: 6 }];
    expect(passiveFallback(facingBet)).toEqual({ type: "call", amount: 6 });

    const foldOnly: LegalAction[] = [{ type: "fold" }];
    expect(passiveFallback(foldOnly).type).toBe("fold");
  });
});
