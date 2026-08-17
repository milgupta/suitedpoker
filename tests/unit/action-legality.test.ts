/**
 * Every action list a drill can put on screen is checked against the rules of
 * poker — by the game engine, not by a second opinion.
 *
 * The action lists in the solution files are authored, and for eleven substages
 * nothing validated them: all five RFI nodes shipped offering only Fold/Raise,
 * omitting the legal call (limp), and a paying user noticed before we did. The
 * codebase has always contained a correct legality engine (`legalActions` in
 * src/poker/gamestate.ts — the sim runs on it); this test replays every
 * preflop node's action sequence through that engine and holds the authored
 * list against the real one. A node that offers an illegal action, or hides a
 * legal passive one, fails the build instead of reaching a player.
 */

import { describe, expect, it } from "vitest";
import {
  advanceUntilAction,
  applyAction,
  createGame,
  legalActions,
  type GameState,
  type Position,
} from "../../src/poker/gamestate";
import { loadAllSolutionData } from "../../src/lib/solution-data";
import type { PreflopNode } from "../../src/poker/solutions";

const data = loadAllSolutionData();

/** Preflop acting order at a six-max table. */
const ORDER: readonly Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];

// Integer chips at 2 per bb, as the engine deals: open 2.5bb, 3bet 11bb,
// 4bet 22bb — the same line every node's actionSeq describes.
const STACK = 200;
const OPEN = 5;
const THREE_BET = 22;
const FOUR_BET = 44;

type Step = { pos: Position; type: "fold" | "raise" | "call"; amount?: number };

/** The scripted actions, in engine order, that reach the hero's decision. */
function stepsFor(node: PreflopNode): Step[] {
  const hero = node.heroPos;
  const seq = node.actionSeq;
  const at = (pos: Position) => ORDER.indexOf(pos);
  const between = (a: Position, b: Position) => ORDER.slice(at(a) + 1, at(b));
  const before = (pos: Position) => ORDER.slice(0, at(pos));
  const after = (pos: Position) => ORDER.slice(at(pos) + 1);
  const folds = (positions: readonly Position[]): Step[] =>
    positions.map((pos) => ({ pos, type: "fold" as const }));

  if (seq === "rfi") return folds(before(hero));

  const opponent = seq.split("_").pop() as Position;

  // Multiway. A limp is a CALL of the big blind, and the caller in a squeeze
  // spot calls the open — both are passive actions the engine must accept at
  // that seat, which is exactly what makes this replay worth running on them.
  if (seq.startsWith("vs_limp_")) {
    return [
      ...folds(before(opponent)),
      { pos: opponent, type: "call" },
      ...folds(between(opponent, hero)),
    ];
  }

  if (seq.startsWith("vs_open_call_")) {
    const [, , , openerName, callerName] = seq.split("_");
    const opener = openerName as Position;
    const caller = callerName as Position;
    return [
      ...folds(before(opener)),
      { pos: opener, type: "raise", amount: OPEN },
      ...folds(between(opener, caller)),
      { pos: caller, type: "call" },
      ...folds(between(caller, hero)),
    ];
  }

  if (seq.startsWith("vs_rfi_")) {
    return [
      ...folds(before(opponent)),
      { pos: opponent, type: "raise", amount: OPEN },
      ...folds(between(opponent, hero)),
    ];
  }

  if (seq.startsWith("vs_3bet_")) {
    return [
      ...folds(before(hero)),
      { pos: hero, type: "raise", amount: OPEN },
      ...folds(between(hero, opponent)),
      { pos: opponent, type: "raise", amount: THREE_BET },
      ...folds(after(opponent)),
    ];
  }

  if (seq.startsWith("vs_4bet_")) {
    // The 4bettor acts twice: the open and, once the hero 3bets, the 4bet.
    // The engine's own turn order routes the second raise back to them.
    return [
      ...folds(before(opponent)),
      { pos: opponent, type: "raise", amount: OPEN },
      ...folds(between(opponent, hero)),
      { pos: hero, type: "raise", amount: THREE_BET },
      ...folds(after(hero)),
      { pos: opponent, type: "raise", amount: FOUR_BET },
    ];
  }

  throw new Error(`unknown actionSeq: ${seq}`);
}

/** Drive the engine to the hero's decision point for this node. */
function replayToHero(node: PreflopNode): GameState {
  // Button at seat 0 puts UTG at seat 3; positionsFor assigns the rest.
  let state = advanceUntilAction(
    createGame({ seats: 6, button: 0, smallBlind: 1, bigBlind: 2, startingStacks: STACK, seed: 1 }),
  );

  const queue = stepsFor(node);
  for (const step of queue) {
    const actor = state.actionOn === null ? null : state.players[state.actionOn];
    expect(actor?.position, `${node.ref}: expected ${step.pos} to act`).toBe(step.pos);
    state =
      step.type === "fold"
        ? applyAction(state, { type: "fold" })
        : step.type === "call"
          ? // The engine prices the call itself (it differs by seat — the small
            // blind already has chips in), so the amount is read off the legal
            // list rather than assumed here.
            applyAction(state, {
              type: "call",
              amount: legalActions(state).find((a) => a.type === "call")?.amount,
            })
          : applyAction(state, { type: "raise", amount: step.amount! });
  }

  const hero = state.actionOn === null ? null : state.players[state.actionOn];
  expect(hero?.position, `${node.ref}: replay did not end on the hero`).toBe(node.heroPos);
  return state;
}

describe("preflop action lists against the rules of poker", () => {
  // Quarantined nodes are tested too: they come back someday, and an illegal
  // action list must not be waiting when they do.
  for (const node of data.preflop) {
    it(`${node.ref} offers exactly the legal actions [${node.actions.join(", ")}]`, () => {
      const state = replayToHero(node);
      const legal = legalActions(state);
      const legalTypes = new Set(legal.map((a) => a.type));
      const raiseRoom = legal.find((a) => a.type === "raise" || a.type === "bet");

      for (const action of node.actions) {
        if (action === "fold" || action === "call") {
          expect(legalTypes.has(action), `${node.ref} offers ${action}, which is illegal`).toBe(
            true,
          );
        } else if (action === "raise") {
          expect(raiseRoom, `${node.ref} offers raise, which is illegal`).toBeDefined();
        } else if (action === "allin") {
          // An all-in is a raise to the full stack; legal iff raising is.
          expect(raiseRoom, `${node.ref} offers allin, which is illegal`).toBeDefined();
        } else if (action === "check") {
          expect(legalTypes.has("check"), `${node.ref} offers check, which is illegal`).toBe(true);
        }
      }

      // The other direction is the shipped bug: a legal passive action the
      // buttons hide reads as the app not knowing the rules.
      if (legalTypes.has("call")) {
        expect(node.actions, `${node.ref} hides a legal call`).toContain("call");
      }
      if (legalTypes.has("check")) {
        expect(node.actions, `${node.ref} hides a legal check`).toContain("check");
      }
      expect(node.actions, `${node.ref} hides fold`).toContain(
        legalTypes.has("fold") ? "fold" : node.actions[0]!,
      );
    });
  }
});

describe("postflop action lists are internally legal", () => {
  // Postflop templates carry multi-street histories the replay above does not
  // model, but the rules still pin their shape: facing a bet you may fold,
  // call, or raise — never check; facing no bet you may check or bet — never
  // fold or call. Offering both check and fold is a rules violation no matter
  // what the history was.
  for (const template of data.postflop) {
    it(`${template.id} does not mix facing-a-bet and unopened actions`, () => {
      const names = template.actions.map((a) => String(a));
      const hasCheck = names.includes("check");
      const hasFold = names.includes("fold");
      const hasCall = names.some((a) => a === "call" || a.startsWith("call_"));

      expect(hasCheck && hasFold, `${template.id} offers both check and fold`).toBe(false);
      expect(hasCheck && hasCall, `${template.id} offers both check and call`).toBe(false);
      if (hasFold) {
        expect(hasCall, `${template.id} can fold but not call`).toBe(true);
      }
    });
  }
});
