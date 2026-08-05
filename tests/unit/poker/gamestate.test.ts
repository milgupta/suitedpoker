import { describe, expect, it } from "vitest";

import { type Card, cardsFromString, createRng, type Rng } from "@/poker/cards";
import {
  type Action,
  advanceStreet,
  applyAction,
  awardPot,
  createGame,
  type GameConfig,
  type GameState,
  isHandComplete,
  isStreetComplete,
  legalActions,
  positionsFor,
  toHandHistory,
} from "@/poker/gamestate";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

const SIX_MAX: GameConfig = {
  seats: 6,
  button: 0,
  smallBlind: 50,
  bigBlind: 100,
  startingStacks: 10_000,
  seed: "gamestate",
};

function game(overrides: Partial<GameConfig> = {}): GameState {
  return createGame({ ...SIX_MAX, ...overrides });
}

function chipsInPlay(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.stack + p.totalCommitted, 0);
}

function actionTypes(state: GameState): string[] {
  return legalActions(state).map((a) => a.type);
}

function play(state: GameState, pick: (s: GameState) => Action): GameState {
  let current = state;
  let guard = 0;
  while (!isHandComplete(current)) {
    if (++guard > 1000) throw new Error("hand did not terminate");
    if (current.actionOn === null) {
      current = advanceStreet(current);
      continue;
    }
    current = applyAction(current, pick(current));
  }
  return awardPot(current);
}

function randomAction(state: GameState, rng: Rng): Action {
  const options = legalActions(state);
  const choice = options[Math.floor(rng() * options.length)];
  if (choice === undefined) throw new Error("no legal action at a live decision point");
  if (choice.type === "bet" || choice.type === "raise") {
    const min = choice.min ?? 0;
    const max = choice.max ?? 0;
    return { type: choice.type, amount: min + Math.floor(rng() * (max - min + 1)) };
  }
  if (choice.type === "call") return { type: "call", amount: choice.amount };
  return { type: choice.type };
}

/** Checks when it can, calls when it must, never raises. */
function passive(state: GameState): Action {
  const options = legalActions(state);
  const check = options.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };
  const call = options.find((a) => a.type === "call");
  if (call !== undefined) return { type: "call", amount: call.amount };
  return { type: "fold" };
}

// ── Table geometry ────────────────────────────────────────────────────────────

describe("positions", () => {
  it("seats a full ring in order from the button", () => {
    expect(positionsFor(6, 0)).toEqual(["BTN", "SB", "BB", "UTG", "MP", "CO"]);
    expect(positionsFor(6, 3)).toEqual(["UTG", "MP", "CO", "BTN", "SB", "BB"]);
  });

  it("drops seats from the middle as the table shortens", () => {
    expect(positionsFor(5, 0)).toEqual(["BTN", "SB", "BB", "UTG", "CO"]);
    expect(positionsFor(4, 0)).toEqual(["BTN", "SB", "BB", "CO"]);
    expect(positionsFor(3, 0)).toEqual(["BTN", "SB", "BB"]);
    expect(positionsFor(2, 0)).toEqual(["BTN", "BB"]);
  });

  it("rejects a table it cannot seat", () => {
    expect(() => positionsFor(7, 0)).toThrow();
    expect(() => createGame({ ...SIX_MAX, seats: 1 })).toThrow();
  });
});

describe("setup", () => {
  it("posts the blinds and puts the action on UTG", () => {
    const state = game();
    expect(state.players[1]?.committedThisStreet).toBe(50);
    expect(state.players[2]?.committedThisStreet).toBe(100);
    expect(state.pot).toBe(150);
    expect(state.currentBet).toBe(100);
    expect(state.actionOn).toBe(3);
    expect(state.players[3]?.position).toBe("UTG");
  });

  it("deals two distinct cards to everyone and none to the board", () => {
    const state = game();
    const dealt = state.players.flatMap((p) => p.holeCards ?? []);
    expect(dealt).toHaveLength(12);
    expect(new Set(dealt).size).toBe(12);
    expect(state.board).toHaveLength(0);
  });

  it("honours pre-set hole cards and a pre-set runout", () => {
    const hole: Array<readonly [Card, Card] | null> = [
      cardsFromString("AhAd") as [Card, Card],
      null,
      null,
      null,
      null,
      null,
    ];
    const board = cardsFromString("2c7d9sTh3c");
    const state = game({ holeCards: hole, board });
    expect(state.players[0]?.holeCards).toEqual(cardsFromString("AhAd"));

    const current = play(state, passive);
    expect(current.board).toEqual(board);
    const dealt = current.players.flatMap((p) => p.holeCards ?? []);
    expect(new Set([...dealt, ...current.board]).size).toBe(12 + 5);
    record("authored spots", "pre-set hole cards and runout survive a full hand");
  });
});

// ── Named rule scenarios ──────────────────────────────────────────────────────

describe("rule: min-raise sizing", () => {
  it("requires a raise to be at least the size of the previous raise", () => {
    let state = game();
    expect(legalActions(state).find((a) => a.type === "raise")).toEqual({
      type: "raise",
      min: 200,
      max: 10_000,
    });

    state = applyAction(state, { type: "raise", amount: 300 });
    expect(state.minRaise).toBe(200);
    expect(legalActions(state).find((a) => a.type === "raise")).toEqual({
      type: "raise",
      min: 500,
      max: 10_000,
    });

    expect(() => applyAction(state, { type: "raise", amount: 400 })).toThrow(/illegal/);
    expect(() => applyAction(state, { type: "raise", amount: 499 })).toThrow(/illegal/);

    state = applyAction(state, { type: "raise", amount: 900 });
    expect(state.minRaise).toBe(600);
    expect(legalActions(state).find((a) => a.type === "raise")?.min).toBe(1500);
    record("min-raise sizing", "each raise must match the previous increment");
  });

  it("makes the minimum postflop bet one big blind", () => {
    let state = game();
    state = applyAction(state, { type: "call", amount: 100 });
    for (const seat of [4, 5, 0]) {
      expect(state.actionOn).toBe(seat);
      state = applyAction(state, { type: "fold" });
    }
    state = applyAction(state, { type: "call", amount: 100 });
    state = applyAction(state, { type: "check" });
    state = advanceStreet(state);

    expect(state.street).toBe("flop");
    expect(legalActions(state).find((a) => a.type === "bet")).toEqual({
      type: "bet",
      min: 100,
      max: 9900,
    });
    expect(() => applyAction(state, { type: "bet", amount: 99 })).toThrow(/illegal/);
  });
});

describe("rule: a short all-in does not reopen the betting", () => {
  it("lets players who have not acted raise, and the rest only call or fold", () => {
    let state = game({ startingStacks: [10_000, 10_000, 10_000, 10_000, 10_000, 400] });

    state = applyAction(state, { type: "raise", amount: 300 }); // UTG
    expect(state.actionOn).toBe(4);
    state = applyAction(state, { type: "call", amount: 300 }); // MP
    expect(state.actionOn).toBe(5);

    // CO is all-in for 400: a 100 increment against a 200 minimum raise.
    state = applyAction(state, { type: "raise", amount: 400 });
    expect(state.players[5]?.status).toBe("allin");
    expect(state.minRaise).toBe(200);
    expect(state.currentBet).toBe(400);

    // BTN has not acted, so the all-in costs it nothing — it may still raise.
    expect(state.actionOn).toBe(0);
    expect(actionTypes(state)).toEqual(["fold", "call", "raise"]);
    state = applyAction(state, { type: "fold" });
    state = applyAction(state, { type: "fold" }); // SB
    state = applyAction(state, { type: "fold" }); // BB

    // UTG already acted at 300 and owes 100 more. Call or fold only.
    expect(state.actionOn).toBe(3);
    expect(actionTypes(state)).toEqual(["fold", "call"]);
    expect(() => applyAction(state, { type: "raise", amount: 800 })).toThrow(/illegal/);

    state = applyAction(state, { type: "call", amount: 400 });
    expect(state.actionOn).toBe(4);
    expect(actionTypes(state)).toEqual(["fold", "call"]);
    record(
      "short all-in does not reopen",
      "players who had acted may only call or fold; those who had not may raise",
    );
  });

  it("does reopen the betting when the all-in is a full raise", () => {
    let state = game({ startingStacks: [10_000, 10_000, 10_000, 10_000, 10_000, 600] });
    state = applyAction(state, { type: "raise", amount: 300 }); // UTG
    state = applyAction(state, { type: "call", amount: 300 }); // MP
    state = applyAction(state, { type: "raise", amount: 600 }); // CO all-in, full raise
    expect(state.minRaise).toBe(300);

    state = applyAction(state, { type: "fold" }); // BTN
    state = applyAction(state, { type: "fold" }); // SB
    state = applyAction(state, { type: "fold" }); // BB
    expect(state.actionOn).toBe(3);
    expect(actionTypes(state)).toEqual(["fold", "call", "raise"]);
    expect(legalActions(state).find((a) => a.type === "raise")?.min).toBe(900);
  });
});

describe("rule: heads-up blind order", () => {
  it("puts the small blind on the button, first preflop and last postflop", () => {
    let state = createGame({ ...SIX_MAX, seats: 2, startingStacks: 10_000 });
    expect(state.players.map((p) => p.position)).toEqual(["BTN", "BB"]);
    expect(state.players[0]?.committedThisStreet).toBe(50);
    expect(state.players[1]?.committedThisStreet).toBe(100);
    expect(state.actionOn).toBe(0);

    state = applyAction(state, { type: "call", amount: 100 });
    expect(state.actionOn).toBe(1);
    state = applyAction(state, { type: "check" });
    expect(isStreetComplete(state)).toBe(true);

    state = advanceStreet(state);
    expect(state.street).toBe("flop");
    expect(state.actionOn).toBe(1);
    record("heads-up blinds", "button posts the SB, acts first preflop and last postflop");
  });
});

describe("rule: the big blind's option", () => {
  it("gives the big blind a check-or-raise when the pot is limped", () => {
    let state = game();
    state = applyAction(state, { type: "fold" }); // UTG
    state = applyAction(state, { type: "fold" }); // MP
    state = applyAction(state, { type: "fold" }); // CO
    state = applyAction(state, { type: "fold" }); // BTN
    state = applyAction(state, { type: "call", amount: 100 }); // SB completes

    expect(state.actionOn).toBe(2);
    expect(actionTypes(state)).toEqual(["check", "raise"]);
    expect(isStreetComplete(state)).toBe(false);

    const raised = applyAction(state, { type: "raise", amount: 400 });
    expect(raised.actionOn).toBe(1);

    const checked = applyAction(state, { type: "check" });
    expect(isStreetComplete(checked)).toBe(true);
    record("big blind option", "limped pot returns the action to the big blind");
  });

  it("ends the hand when everyone folds to the big blind", () => {
    let state = game();
    for (let i = 0; i < 5; i++) state = applyAction(state, { type: "fold" });
    expect(isHandComplete(state)).toBe(true);

    const awarded = awardPot(state);
    expect(awarded.payouts[2]).toBe(150);
    expect(chipsInPlay(game())).toBe(chipsInPlay(state));
  });
});

describe("rule: side pots", () => {
  it("splits three all-ins of 10, 50 and 200 against a caller of 200", () => {
    const config: GameConfig = {
      seats: 4,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      startingStacks: [200, 10, 50, 200],
      seed: "side-pots",
    };
    let state = createGame(config);
    expect(state.actionOn).toBe(3);

    state = applyAction(state, { type: "raise", amount: 200 }); // CO all-in
    state = applyAction(state, { type: "call", amount: 200 }); // BTN all-in call
    state = applyAction(state, { type: "call", amount: 10 }); // SB all-in for 10
    state = applyAction(state, { type: "call", amount: 50 }); // BB all-in for 50

    expect(state.players.map((p) => p.totalCommitted)).toEqual([200, 10, 50, 200]);
    expect(state.pot).toBe(460);
    expect(state.sidePots).toEqual([
      { amount: 40, eligibleSeats: [0, 1, 2, 3] },
      { amount: 120, eligibleSeats: [0, 2, 3] },
      { amount: 300, eligibleSeats: [0, 3] },
    ]);

    let runout = state;
    while (!isHandComplete(runout)) runout = advanceStreet(runout);
    const awarded = awardPot(runout);

    const paid = awarded.payouts.reduce((sum, p) => sum + p, 0);
    expect(paid).toBe(460);
    expect(awarded.players.reduce((sum, p) => sum + p.stack, 0)).toBe(460);
    // Nobody can win more than the pots they were eligible for.
    expect(awarded.payouts[1] ?? 0).toBeLessThanOrEqual(40);
    expect(awarded.payouts[2] ?? 0).toBeLessThanOrEqual(160);
    record("layered side pots", "10 / 50 / 200 against a 200 call → pots of 40, 120, 300");
  });

  it("returns an uncalled bet to the player who made it", () => {
    const config: GameConfig = {
      seats: 2,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      startingStacks: [500, 100],
      seed: "uncalled",
    };
    let state = createGame(config);
    state = applyAction(state, { type: "raise", amount: 500 }); // BTN shoves 500
    state = applyAction(state, { type: "call", amount: 100 }); // BB can only call 100

    expect(state.sidePots).toEqual([
      { amount: 200, eligibleSeats: [0, 1] },
      { amount: 400, eligibleSeats: [0] },
    ]);

    let runout = state;
    while (!isHandComplete(runout)) runout = advanceStreet(runout);
    const awarded = awardPot(runout);
    expect(awarded.payouts[0] ?? 0).toBeGreaterThanOrEqual(400);
    expect(awarded.players.reduce((sum, p) => sum + p.stack, 0)).toBe(600);
  });
});

describe("rule: odd chips", () => {
  it("gives the odd chip to the first winner left of the button", () => {
    // Both live players end up playing the board, so the pot is an exact chop.
    const config: GameConfig = {
      seats: 3,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      startingStacks: 5,
      seed: "odd-chip",
      holeCards: [
        cardsFromString("2c3d") as [Card, Card],
        cardsFromString("7c8d") as [Card, Card],
        cardsFromString("4c5d") as [Card, Card],
      ],
      board: cardsFromString("AhKhQhJhTh"),
    };
    let state = createGame(config);
    state = applyAction(state, { type: "call", amount: 2 }); // BTN calls
    state = applyAction(state, { type: "fold" }); // SB folds, leaving 1 dead chip
    state = applyAction(state, { type: "check" }); // BB checks

    let current = state;
    while (!isHandComplete(current)) {
      current =
        current.actionOn === null ? advanceStreet(current) : applyAction(current, passive(current));
    }
    const awarded = awardPot(current);

    expect(awarded.pot).toBe(5);
    // Seat 1 is left of the button but folded, so the chip goes to seat 2.
    expect(awarded.payouts).toEqual([2, 0, 3]);
    expect(awarded.players.reduce((sum, p) => sum + p.stack, 0)).toBe(15);
    record("odd chips", "5-chip chop pays 3 to the first live seat left of the button");
  });

  it("chops a pot evenly when it divides", () => {
    const config: GameConfig = {
      seats: 2,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      startingStacks: 10,
      seed: "even-chop",
      holeCards: [cardsFromString("2c3d") as [Card, Card], cardsFromString("4c5d") as [Card, Card]],
      board: cardsFromString("AhKhQhJhTh"),
    };
    let state = createGame(config);
    state = applyAction(state, { type: "call", amount: 2 });
    state = applyAction(state, { type: "check" });
    let current = state;
    while (!isHandComplete(current)) {
      current =
        current.actionOn === null ? advanceStreet(current) : applyAction(current, passive(current));
    }
    const awarded = awardPot(current);
    expect(awarded.payouts).toEqual([2, 2]);
  });
});

// ── Immutability and legality ─────────────────────────────────────────────────

describe("immutability", () => {
  it("never mutates the state it was handed", () => {
    const before = game();
    const snapshot = JSON.stringify(toHandHistory(before));
    const after = applyAction(before, { type: "raise", amount: 300 });
    expect(JSON.stringify(toHandHistory(before))).toBe(snapshot);
    expect(after).not.toBe(before);
    expect(after.players).not.toBe(before.players);
  });
});

describe("legality", () => {
  it("rejects every action outside legalActions", () => {
    const state = game();
    const illegal: Action[] = [
      { type: "check" }, // there is a bet to call
      { type: "bet", amount: 500 }, // preflop is always a raise
      { type: "call", amount: 99 }, // wrong call amount
      { type: "call", amount: 101 },
      { type: "raise", amount: 199 }, // under the minimum
      { type: "raise", amount: 10_001 }, // over the stack
      { type: "raise" }, // no amount
      { type: "raise", amount: 250.5 }, // fractional chips
    ];
    for (const action of illegal) expect(() => applyAction(state, action)).toThrow(/illegal/);
    record("illegal actions rejected", `${illegal.length} malformed actions all throw`);
  });

  it("refuses to act on a completed street or a completed hand", () => {
    let state = game();
    for (let i = 0; i < 5; i++) state = applyAction(state, { type: "fold" });
    expect(() => applyAction(state, { type: "check" })).toThrow(/complete/);
    expect(() => advanceStreet(state)).toThrow(/complete/);
    expect(legalActions(state)).toEqual([]);
  });

  it("refuses to award a pot that is still being contested", () => {
    expect(() => awardPot(game())).toThrow(/complete/);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("determinism", () => {
  it("produces a byte-identical hand history for the same seed and actions", () => {
    const run = () => {
      const state = createGame({ ...SIX_MAX, seed: "determinism" });
      const rng = createRng("actions");
      return JSON.stringify(toHandHistory(play(state, (s) => randomAction(s, rng))));
    };
    const first = run();
    expect(run()).toBe(first);
    expect(run()).toBe(first);
    record("determinism", "same seed and action sequence → byte-identical hand history");
  });

  it("deals differently for a different seed", () => {
    const holeCards = (seed: string) =>
      JSON.stringify(createGame({ ...SIX_MAX, seed }).players.map((p) => p.holeCards));
    expect(holeCards("a")).not.toBe(holeCards("b"));
  });
});

// ── Property test ─────────────────────────────────────────────────────────────

describe("50,000 random hands", () => {
  it("conserves chips exactly and never accepts an illegal action", () => {
    const rng = createRng("property");
    const hands = 50_000;

    let actions = 0;
    let showdowns = 0;
    let sidePotHands = 0;
    let allInHands = 0;
    let worstChipDrift = 0;

    for (let hand = 0; hand < hands; hand++) {
      const seats = 2 + Math.floor(rng() * 5);
      const stacks = Array.from({ length: seats }, () => 2 + Math.floor(rng() * 60));
      const config: GameConfig = {
        seats,
        button: Math.floor(rng() * seats),
        smallBlind: 1,
        bigBlind: 2,
        startingStacks: stacks,
        seed: hand,
      };

      let state = createGame(config);
      const startingTotal = stacks.reduce((sum, s) => sum + s, 0);
      expect(chipsInPlay(state)).toBe(startingTotal);

      let guard = 0;
      while (!isHandComplete(state)) {
        if (++guard > 1000) throw new Error(`hand ${hand} did not terminate`);
        if (state.actionOn === null) {
          state = advanceStreet(state);
          continue;
        }

        const options = legalActions(state);
        if (options.length === 0) throw new Error(`hand ${hand}: a live seat had no legal action`);

        // Every thousandth decision, prove the guard rails hold.
        if (hand % 1000 === 0 && guard === 1) {
          expect(() => applyAction(state, { type: "raise", amount: -1 })).toThrow();
          expect(() => applyAction(state, { type: "bet", amount: 1_000_000 })).toThrow();
        }

        state = applyAction(state, randomAction(state, rng));
        actions++;

        const drift = Math.abs(chipsInPlay(state) - startingTotal);
        worstChipDrift = Math.max(worstChipDrift, drift);
        if (drift !== 0) {
          throw new Error(`hand ${hand}: chips drifted by ${drift} after ${actions} actions`);
        }
        if (state.pot !== state.players.reduce((sum, p) => sum + p.totalCommitted, 0)) {
          throw new Error(`hand ${hand}: pot does not equal committed chips`);
        }
        for (const player of state.players) {
          if (player.stack < 0) throw new Error(`hand ${hand}: seat ${player.seat} went negative`);
          if (player.committedThisStreet > player.totalCommitted) {
            throw new Error(
              `hand ${hand}: seat ${player.seat} committed more this street than total`,
            );
          }
        }
      }

      if (state.sidePots.length > 1) sidePotHands++;
      if (state.players.some((p) => p.status === "allin")) allInHands++;
      if (state.players.filter((p) => p.status !== "folded").length > 1) showdowns++;

      const awarded = awardPot(state);
      const finalChips = awarded.players.reduce((sum, p) => sum + p.stack, 0);
      if (finalChips !== startingTotal) {
        throw new Error(`hand ${hand}: paid out ${finalChips}, started with ${startingTotal}`);
      }
      const paid = awarded.payouts.reduce((sum, p) => sum + p, 0);
      if (paid !== awarded.pot) {
        throw new Error(`hand ${hand}: paid ${paid} out of a pot of ${awarded.pot}`);
      }
    }

    console.log(
      `\n50,000 random hands\n` +
        `  actions applied          ${actions.toLocaleString("en-US")}\n` +
        `  hands reaching showdown  ${showdowns.toLocaleString("en-US")}\n` +
        `  hands with an all-in     ${allInHands.toLocaleString("en-US")}\n` +
        `  hands with side pots     ${sidePotHands.toLocaleString("en-US")}\n` +
        `  worst chip drift         ${worstChipDrift}\n`,
    );

    expect(worstChipDrift).toBe(0);
    expect(sidePotHands).toBeGreaterThan(0);
    expect(showdowns).toBeGreaterThan(0);
    record(
      "chip conservation",
      `50,000 hands, ${actions.toLocaleString("en-US")} actions, drift exactly 0 chips`,
    );
    record(
      "coverage",
      `${sidePotHands.toLocaleString("en-US")} hands produced side pots, ${allInHands.toLocaleString("en-US")} had an all-in`,
    );
  }, 300_000);
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.3 — game state machine\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
  });
});
