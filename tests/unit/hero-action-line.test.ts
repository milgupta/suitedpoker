import { describe, expect, it } from "vitest";
import { heroActionLine } from "@/components/poker/Table";
import type { GameState, LegalAction } from "@/poker/gamestate";

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    config: {
      seats: 6,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      startingStacks: 200,
      seed: 0,
    },
    players: [],
    button: 0,
    street: "preflop",
    board: [],
    pot: 3,
    sidePots: [],
    currentBet: 2,
    minRaise: 2,
    actionOn: 0,
    lastAggressor: null,
    history: [],
    complete: false,
    payouts: [],
    deck: [],
    deckIndex: 0,
    ...overrides,
  };
}

describe("heroActionLine", () => {
  it("names the call amount in big blinds", () => {
    const actions: LegalAction[] = [
      { type: "fold" },
      { type: "call", amount: 2 },
      { type: "raise", min: 4, max: 200 },
    ];
    expect(heroActionLine(baseState({ actionOn: 0 }), 0, actions)).toBe(
      "Your turn — 1.0 BB to call.",
    );
  });

  it("offers check or bet when checking is legal", () => {
    const actions: LegalAction[] = [{ type: "check" }, { type: "bet", min: 2, max: 200 }];
    expect(heroActionLine(baseState({ actionOn: 0, currentBet: 0 }), 0, actions)).toBe(
      "Your turn — check or bet.",
    );
  });

  it("is silent when it is not the hero's turn", () => {
    expect(heroActionLine(baseState({ actionOn: 2 }), 0, [{ type: "fold" }])).toBeNull();
  });
});
