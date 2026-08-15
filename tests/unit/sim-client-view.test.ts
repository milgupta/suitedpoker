/**
 * The client-view fields the game surface reads: seeded bot names, the dealer
 * seat, the showdown flag and the payouts. Each one is public information —
 * the leak surface itself is covered in sim.test.ts and stays untouched.
 */

import { describe, expect, it } from "vitest";
import {
  applyHeroAction,
  createLiveSession,
  dealNextHand,
  heroLegalActions,
} from "../../src/lib/sim-server";
import {
  botDisplayNames,
  resultLineFor,
  toClientSimState,
  type LiveSimState,
} from "../../src/lib/sim";
import type { Action } from "../../src/poker/gamestate";

/** Calls or checks everything down, so showdowns actually happen. */
function passiveHero(live: LiveSimState): Action {
  const legal = heroLegalActions(live);
  const check = legal.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  const call = legal.find((a) => a.type === "call");
  if (call !== undefined) return { type: "call", amount: call.amount };
  return { type: "fold" };
}

function playHand(live: LiveSimState, seed: string, policy = passiveHero): LiveSimState {
  let guard = 0;
  while (live.game !== null && !live.game.complete) {
    if (++guard > 100) throw new Error("hand did not complete");
    const result = applyHeroAction(live, policy(live), seed);
    if (!result.ok) throw new Error(result.error);
    live = result.live;
  }
  return live;
}

describe("botDisplayNames", () => {
  it("is deterministic in the seed, null at the hero, unique per table", () => {
    const botBySeat = [null, "tag", "tag", "nit", "station", "maniac"] as const;
    const a = botDisplayNames("session-1", botBySeat);
    const b = botDisplayNames("session-1", botBySeat);
    expect(a).toEqual(b);

    expect(a[0]).toBeNull();
    const names = a.slice(1);
    expect(names.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("the client view for the game surface", () => {
  const SEED = "sim-surface-view";

  it("carries seeded bot names that survive a refresh, and the dealer seat", () => {
    const live = createLiveSession({
      presetId: "cardroom",
      totalHands: 5,
      stackBb: 100,
      seed: SEED,
    });

    const first = toClientSimState(SEED, live, heroLegalActions(live), null);
    const refreshed = toClientSimState(SEED, live, heroLegalActions(live), null);

    const namesOf = (view: typeof first) =>
      view.seats.filter((s) => !s.isHero).map((s) => s.botName);
    expect(namesOf(first)).toEqual(namesOf(refreshed));
    expect(namesOf(first).every((n) => typeof n === "string" && n.length > 0)).toBe(true);
    // Distinct names — "Marcus raised" must be unambiguous.
    expect(new Set(namesOf(first)).size).toBe(namesOf(first).length);

    const heroSeat = first.seats.find((s) => s.isHero);
    expect(heroSeat?.botName).toBeNull();

    expect(first.buttonSeat).toBe(live.game?.button ?? null);
    expect(first.stackBb).toBe(100);
  });

  it("a legacy live state without stored names derives the same names from the session id", () => {
    const live = createLiveSession({ presetId: "online", totalHands: 5, stackBb: 100, seed: SEED });
    const legacy = { ...live, botNames: undefined } as LiveSimState;

    const stored = toClientSimState(SEED, live, [], null);
    const derived = toClientSimState(SEED, legacy, [], null);
    expect(derived.seats.map((s) => s.botName)).toEqual(stored.seats.map((s) => s.botName));
  });

  it("exposes payouts and the showdown flag only once the hand is complete", () => {
    let live = createLiveSession({
      presetId: "cardroom",
      totalHands: 20,
      stackBb: 100,
      seed: SEED,
    });

    let sawShowdown = false;
    for (let hand = 0; hand < 20 && !sawShowdown; hand++) {
      // Mid-hand: no payouts, no showdown claim.
      if (live.game !== null && !live.game.complete) {
        const mid = toClientSimState(SEED, live, heroLegalActions(live), null);
        expect(mid.payoutsBb).toEqual([]);
        expect(mid.wentToShowdown).toBe(false);
      }

      live = playHand(live, SEED);
      const done = toClientSimState(SEED, live, [], null);

      if (live.game !== null && live.game.complete) {
        // Payouts are the engine's, in bb, and the pot they sum to is the pot.
        const paidBb = done.payoutsBb.reduce((sum, p) => sum + p, 0);
        expect(paidBb).toBeCloseTo(done.potBb, 3);

        const showdownInHistory = live.game.history.some((e) => e.kind === "showdown");
        expect(done.wentToShowdown).toBe(showdownInHistory);
        if (showdownInHistory) sawShowdown = true;
      }

      live = dealNextHand(live, SEED);
    }

    expect(sawShowdown, "20 call-down hands produced no showdown").toBe(true);
  });
});

describe("resultLineFor storytelling", () => {
  it("names the winning hand at showdown when a label is supplied", () => {
    expect(resultLineFor(12.5, true, false, "Flush")).toBe("Won 25 with a flush");
    expect(resultLineFor(3, true, false, "Two pair")).toBe("Won 6 with two pair");
    // High card wins stay plain — "with high card" reads as mockery.
    expect(resultLineFor(2, true, false, "High card")).toBe("Won 4 at showdown");
    expect(resultLineFor(2, true, false, null)).toBe("Won 4 at showdown");
    // Non-showdown wins never name a hand nobody saw.
    expect(resultLineFor(4, false, false, "Flush")).toBe("Won 8");
    expect(resultLineFor(-4, false, false, null)).toBe("Lost 8");
  });
});
