/**
 * The simulator, driven without HTTP.
 *
 * Two properties carry the mode:
 *
 *   CHIP CONSERVATION — across a 50-hand session, every chip the hero wins or
 *   loses is a chip a villain lost or won. A conservation bug here is not
 *   cosmetic: net bb is the number the session HUD shows, and a HUD that
 *   drifts from reality teaches the user their results are fake.
 *
 *   THE LEAK SURFACE — the client view never contains the deck or a villain's
 *   hole cards before a showdown they reached. Same class as the drill-answer
 *   leak, same severity.
 */

import { describe, expect, it } from "vitest";
import {
  applyHeroAction,
  createLiveSession,
  dealNextHand,
  heroLegalActions,
} from "../../src/lib/sim-server";
import {
  FORBIDDEN_IN_CLIENT_PAYLOAD,
  PRESET_IDS,
  PRESETS,
  toClientSimState,
  type LiveSimState,
} from "../../src/lib/sim";
import type { Action } from "../../src/poker/gamestate";

/** A deterministic hero: calls/checks when cheap, folds to big pressure. */
function heroPolicy(live: LiveSimState): Action {
  const legal = heroLegalActions(live);
  const check = legal.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };

  const call = legal.find((a) => a.type === "call");
  const hero = live.game?.players[live.heroSeat];
  if (call !== undefined && call.amount !== undefined && hero !== undefined) {
    // Call anything up to a quarter of the stack; fold to more.
    if (call.amount <= (hero.stack + hero.committedThisStreet) / 4) {
      return { type: "call", amount: call.amount };
    }
  }
  const fold = legal.find((a) => a.type === "fold");
  if (fold !== undefined) return { type: "fold" };
  return call !== undefined ? { type: "call", amount: call.amount } : { type: "check" };
}

/** Plays the current hand to completion; returns the settled state. */
function playHand(live: LiveSimState, seed: string): LiveSimState {
  let guard = 0;
  while (live.game !== null && !live.game.complete) {
    if (++guard > 100) throw new Error("hand did not complete");
    const result = applyHeroAction(live, heroPolicy(live), seed);
    if (!result.ok) throw new Error(`hero action rejected: ${result.error}`);
    live = result.live;
  }
  return live;
}

describe("a 50-hand session", () => {
  const SEED = "sim-test-session";
  let live = createLiveSession({
    presetId: "casino",
    totalHands: 50,
    stackBb: 100,
    seed: SEED,
  });

  it("plays to completion with chips conserved on every hand", () => {
    let guard = 0;
    while (!live.ended) {
      if (++guard > 500) throw new Error("session did not end");

      // A walkover chain can settle hands inside dealNextHand, so the loop is
      // driven by session state rather than a fixed count.
      if (live.game === null || live.game.complete) {
        live = dealNextHand(live, SEED);
        continue;
      }

      live = playHand(live, SEED);

      const game = live.game;
      if (game !== null && game.complete) {
        // Conservation: what everyone put in equals what was paid out.
        const committed = game.players.reduce((sum, p) => sum + p.totalCommitted, 0);
        const paidOut = game.payouts.reduce((sum, p) => sum + p, 0);
        expect(paidOut, `hand ${live.handNumber} leaked chips`).toBe(committed);

        // Zero-sum: the seat deltas cancel exactly (integer chips).
        const deltas = game.players.map((p, seat) => (game.payouts[seat] ?? 0) - p.totalCommitted);
        expect(
          deltas.reduce((a, b) => a + b, 0),
          `hand ${live.handNumber} is not zero-sum`,
        ).toBe(0);
      }
    }

    expect(live.records).toHaveLength(50);
    expect(live.ended).toBe(true);
  });

  it("keeps the HUD sum equal to the per-hand sum", () => {
    const summed = live.records.reduce((sum, r) => sum + r.netBb, 0);
    expect(live.netBbTotal).toBeCloseTo(summed, 3);
    expect(live.records.map((r) => r.handNumber)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it("gave every hand a result line", () => {
    for (const record of live.records) {
      expect(record.resultLine.length).toBeGreaterThan(3);
    }
  });

  it("graded at least some hero preflop decisions", () => {
    // Not all lines have a covering node, but across 50 hands plenty do. Zero
    // graded hands means the node lookup is broken, not that poker is odd.
    const graded = live.records.filter((r) => r.grade !== null);
    expect(graded.length).toBeGreaterThan(5);
  });

  it("rotated the button through full orbits", () => {
    const seats = PRESETS.casino.villains.length + 1;
    expect(seats).toBe(6);
    // The button advanced once per hand: 50 hands from seat 0.
    expect(live.button).toBe(50 % seats);
  });
});

describe("the leak surface", () => {
  it("never serialises the deck, and hides villain cards until showdown", () => {
    const SEED = "sim-leak-test";
    let live = createLiveSession({ presetId: "boss", totalHands: 5, stackBb: 100, seed: SEED });

    for (let hand = 0; hand < 5; hand++) {
      // Mid-hand views, before completion.
      let guard = 0;
      while (live.game !== null && !live.game.complete) {
        if (++guard > 100) throw new Error("hand did not complete");

        const view = toClientSimState("sess", live, heroLegalActions(live), null);
        const raw = JSON.stringify(view);

        // The deck must never appear under any name.
        for (const key of FORBIDDEN_IN_CLIENT_PAYLOAD) {
          if (key === "holeCards") continue; // hero's are allowed; checked below
          expect(raw, `${key} leaked mid-hand`).not.toContain(`"${key}"`);
        }

        // Only the hero's cards are visible before completion.
        for (const seat of view.seats) {
          if (seat.isHero) {
            expect(seat.holeCards, "hero cannot see their own cards").not.toBeNull();
          } else {
            expect(seat.holeCards, `seat ${seat.seat} leaked before showdown`).toBeNull();
          }
        }

        const result = applyHeroAction(live, heroFold(live), SEED);
        if (!result.ok) throw new Error(result.error);
        live = result.live;
      }

      // After completion by folds there was no showdown: still nothing.
      const finished = toClientSimState("sess", live, [], null);
      for (const seat of finished.seats) {
        if (seat.isHero) continue;
        const reachedShowdown = live.game!.history.some(
          (e) => e.kind === "showdown" && e.seat === seat.seat,
        );
        if (!reachedShowdown) {
          expect(seat.holeCards, `folded seat ${seat.seat} revealed`).toBeNull();
        }
      }

      live = dealNextHand(live, SEED);
    }
  });

  it("reveals showdown reachers once the hand is over", () => {
    // Force showdowns by calling everything down with a passive hero.
    const SEED = "sim-showdown-test";
    let live = createLiveSession({ presetId: "casino", totalHands: 20, stackBb: 100, seed: SEED });

    let sawShowdownReveal = false;
    for (let hand = 0; hand < 20 && !sawShowdownReveal; hand++) {
      let guard = 0;
      while (live.game !== null && !live.game.complete) {
        if (++guard > 100) throw new Error("hand did not complete");
        const legal = heroLegalActions(live);
        const check = legal.find((a) => a.type === "check");
        const call = legal.find((a) => a.type === "call");
        const action: Action =
          check !== undefined
            ? { type: "check" }
            : call !== undefined
              ? { type: "call", amount: call.amount }
              : { type: "fold" };
        const result = applyHeroAction(live, action, SEED);
        if (!result.ok) throw new Error(result.error);
        live = result.live;
      }

      const view = toClientSimState("sess", live, [], null);
      for (const seat of view.seats) {
        if (seat.isHero || live.game === null) continue;
        const reached = live.game.history.some(
          (e) => e.kind === "showdown" && e.seat === seat.seat,
        );
        if (reached) {
          expect(seat.holeCards, `showdown seat ${seat.seat} still hidden`).not.toBeNull();
          sawShowdownReveal = true;
        }
      }

      live = dealNextHand(live, SEED);
    }

    expect(sawShowdownReveal, "20 call-down hands produced no showdown").toBe(true);
  });
});

function heroFold(live: LiveSimState): Action {
  const legal = heroLegalActions(live);
  const check = legal.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  return { type: "fold" };
}

describe("tampering", () => {
  it("rejects an action out of turn and an illegal amount", () => {
    const live = createLiveSession({
      presetId: "casino",
      totalHands: 5,
      stackBb: 100,
      seed: "sim-tamper",
    });

    // A raise to a million is not in the legal band.
    const absurd = applyHeroAction(live, { type: "raise", amount: 1_000_000 }, "sim-tamper");
    expect(absurd.ok).toBe(false);
    if (!absurd.ok) expect(absurd.error).toBe("illegal_action");

    // A bet when facing a raise (bet is only legal with no bet outstanding).
    const wrongKind = applyHeroAction(live, { type: "bet", amount: 3 }, "sim-tamper");
    expect(wrongKind.ok).toBe(false);
  });

  it("every preset seats the advertised bots", () => {
    for (const id of PRESET_IDS) {
      const live = createLiveSession({
        presetId: id,
        totalHands: 5,
        stackBb: 100,
        seed: `preset-${id}`,
      });
      expect(live.botBySeat[live.heroSeat]).toBeNull();
      expect(live.botBySeat.filter((b) => b !== null)).toEqual([...PRESETS[id].villains]);
      expect(live.game).not.toBeNull();
    }
  });
});
