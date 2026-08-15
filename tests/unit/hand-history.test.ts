/**
 * The text renderer must be driven purely by the 2.3 serializer.
 *
 * If it were not — if any line were hand-written or recomputed — the text and
 * the game state could drift, and a user would be graded on a hand different
 * from the one they read. So the test mutates the state and asserts the render
 * changes correspondingly.
 */

import { describe, expect, it } from "vitest";
import { historyLines, potByStreet } from "../../src/components/poker/HandHistory";
import {
  advanceUntilAction,
  applyAction,
  createGame,
  legalActions,
  toHandHistory,
  type Action,
  type GameState,
} from "../../src/poker/gamestate";
import { cardsFromString } from "../../src/poker/cards";

const BB = 100;

function base(seed: string, overrides = {}): GameState {
  return advanceUntilAction(
    createGame({
      seats: 6,
      button: 3,
      smallBlind: 50,
      bigBlind: BB,
      startingStacks: 100 * BB,
      seed,
      board: cardsFromString("Ks Jd 8d 4d 5d"),
      ...overrides,
    }),
  );
}

/** Plays passively so the hand reaches the requested depth. */
function playOut(state: GameState, steps: number): GameState {
  let next = state;
  for (let i = 0; i < steps && !next.complete && next.actionOn !== null; i++) {
    const legal = legalActions(next);
    const prefer =
      legal.find((a) => a.type === "check") ?? legal.find((a) => a.type === "call") ?? legal[0];
    if (prefer === undefined) break;
    const action: Action = { type: prefer.type, amount: prefer.amount ?? prefer.min };
    next = advanceUntilAction(applyAction(next, action));
  }
  return next;
}

describe("driven purely by the serializer", () => {
  it("changes when the game state changes", () => {
    const before = toHandHistory(playOut(base("mutate"), 2));
    const after = toHandHistory(playOut(base("mutate"), 6));

    const linesBefore = historyLines(before, 0);
    const linesAfter = historyLines(after, 0);

    // More action in the state must mean more lines in the render.
    expect(linesAfter.length).toBeGreaterThan(linesBefore.length);
  });

  it("renders one line per action event and nothing else", () => {
    const state = playOut(base("count"), 8);
    const hand = toHandHistory(state);
    const actionEvents = hand.events.filter((e) => e.kind === "action");

    expect(historyLines(hand, 0)).toHaveLength(actionEvents.length);
  });

  it("names the hero's own seat Hero and others by position", () => {
    const hand = toHandHistory(playOut(base("names"), 6));
    const lines = historyLines(hand, 2);

    const heroLines = lines.filter((l) => l.isHero);
    expect(heroLines.every((l) => l.text.startsWith("Hero"))).toBe(true);

    const villainLines = lines.filter((l) => !l.isHero);
    expect(villainLines.every((l) => !l.text.startsWith("Hero"))).toBe(true);
  });

  it("attributes every line to the street its event carried", () => {
    const state = playOut(base("streets"), 12);
    const hand = toHandHistory(state);
    const actionEvents = hand.events.filter((e) => e.kind === "action");
    const lines = historyLines(hand, 0);

    for (const [i, line] of lines.entries()) {
      expect(line.street).toBe(actionEvents[i]?.street);
    }
  });
});

describe("pot sizes match the state exactly", () => {
  it("agrees with the ENGINE's own pot, not with a repeat of its own arithmetic", () => {
    // Checked against the engine rather than against a re-implementation. The
    // first version of this test recomputed the pot the same (wrong) way the
    // renderer did — summing action amounts as increments when they are
    // to-amounts — so it passed while both were overstating every pot by the
    // small blind.
    for (let i = 0; i < 30; i++) {
      const state = playOut(base(`engine-${i}`), 10);
      const hand = toHandHistory(state);
      const pots = potByStreet(hand);

      const inFlight = state.players.reduce((sum, p) => sum + p.committedThisStreet, 0);
      // potByStreet reports CHIPS now, so no division — still the engine's
      // own number rather than a re-implementation of the arithmetic.
      const expected = state.pot + inFlight;

      expect(pots.showdown, `hand ${i}`).toBeCloseTo(expected, 6);
    }
  });

  it("never reports a negative or shrinking pot", () => {
    for (let i = 0; i < 40; i++) {
      const hand = toHandHistory(playOut(base(`grow-${i}`), 12));
      const pots = potByStreet(hand);
      const ordered = [pots.preflop, pots.flop, pots.turn, pots.river].filter((p) => p > 0);

      for (let j = 1; j < ordered.length; j++) {
        expect(ordered[j] ?? 0).toBeGreaterThanOrEqual(ordered[j - 1] ?? 0);
      }
    }
  });
});

describe("20 generated hands render sanely", () => {
  it("produces a complete, non-empty history for every one", () => {
    for (let i = 0; i < 20; i++) {
      const hand = toHandHistory(playOut(base(`render-${i}`), 14));
      const lines = historyLines(hand, 0);

      expect(lines.length, `hand ${i} rendered no lines`).toBeGreaterThan(0);
      for (const line of lines) {
        // Every line must be a complete sentence about a real action.
        expect(line.text).toMatch(/^(Hero|UTG|MP|CO|BTN|SB|BB)\b/);
        expect(line.text.endsWith(".")).toBe(true);
        expect(line.text).not.toContain("undefined");
        expect(line.text).not.toContain("NaN");
      }
    }
  });

  it("prints five hands in full, for reading by hand", () => {
    const rendered: string[] = [];

    for (let i = 0; i < 5; i++) {
      const state = playOut(base(`verify-${i}`), 14);
      const hand = toHandHistory(state);
      const pots = potByStreet(hand);
      const lines = historyLines(hand, 0);

      rendered.push(
        [
          `--- hand ${i} (seed verify-${i}) ---`,
          `blinds ${hand.smallBlind / hand.bigBlind} / 1.0 BB · board ${hand.board}`,
          `pots  preflop ${pots.preflop.toFixed(1)}  flop ${pots.flop.toFixed(1)}  turn ${pots.turn.toFixed(1)}  river ${pots.river.toFixed(1)}`,
          ...lines.map((l) => `  [${l.street}] ${l.text}`),
          `state pot: ${(state.pot / hand.bigBlind).toFixed(1)}BB`,
        ].join("\n"),
      );

      /**
       * The real invariant.
       *
       * `state.pot` is the pot as of the START of the current street — chips
       * wagered on the street in progress are still sitting in each player's
       * committedThisStreet. So the renderer's running total equals the
       * engine's pot PLUS whatever is still in front of the players.
       */
      const inFlight = state.players.reduce((sum, p) => sum + p.committedThisStreet, 0);

      expect(pots.showdown, `hand ${i} pot disagrees with the engine`).toBeCloseTo(
        state.pot + inFlight,
        6,
      );
    }

    console.log("\n" + rendered.join("\n\n") + "\n");
    expect(rendered).toHaveLength(5);
  });
});
