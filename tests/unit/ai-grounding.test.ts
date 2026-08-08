/**
 * What the model is told, and what it is not allowed to say back.
 *
 * The failure this exists for: a PREFLOP button-versus-UTG opening decision was
 * explained in terms of "the straight and flush draws you pick up on this
 * board". There is no board. `buildCoachContext` accepted a `board` parameter
 * and never wrote it into the prompt, so the model was handed a hand, a pot and
 * a mix with nothing saying whether community cards existed — and filled the
 * hole. Every other guard passed it: nothing was prescriptive, nothing named
 * money, nothing claimed a solver. It was simply false, in a way a beginner
 * cannot detect, which is the only kind of wrong that matters here.
 */

import { describe, expect, it } from "vitest";
import { buildCoachContext, buildHintContext } from "../../src/lib/ai/context";
import { inventsBoard, redact, redactHint } from "../../src/lib/ai/redact";
import { loadSolutionData } from "../../src/lib/solution-data";
import { generateSpot, toClientSpot } from "../../src/poker/generator";
import { gradeDecision } from "../../src/poker/grader";
import { cardsFromString } from "../../src/poker/cards";
import { isPreflopNodeRef } from "../../src/poker/solutions";

const data = loadSolutionData();

function preflopSpot(index = 0) {
  const node = data.preflop[index % data.preflop.length]!;
  const spot = generateSpot(
    { type: "preflop", heroPos: node.heroPos, actionSeq: node.actionSeq },
    data,
    `ground:${String(index)}`,
  );
  const result = gradeDecision(
    {
      actions: node.actions,
      frequencies: node.strategy[spot.handKey] ?? {},
      evs: node.ev[spot.handKey] ?? {},
    },
    node.actions[0]!,
  );
  return { node, spot, result };
}

describe("the coach context", () => {
  it("states that there is no board on every preflop spot", () => {
    for (let i = 0; i < data.preflop.length; i++) {
      const { spot, result } = preflopSpot(i);
      const context = buildCoachContext(spot, result, { skillTier: "never", leaks: [] });

      expect(context.text, `${spot.nodeRef} says nothing about the board`).toContain("Board: NONE");
      expect(context.text).toContain("preflop decision");
    }
  });

  it("writes the actual cards when there is a board", () => {
    const { spot, result } = preflopSpot();
    const board = cardsFromString("Ah 7d 2c");
    const context = buildCoachContext({ ...spot, board }, result, {
      skillTier: "solver",
      leaks: [],
    });

    expect(context.text).toContain("Ah");
    expect(context.text).toContain("flop");
    expect(context.text).not.toContain("Board: NONE");
  });

  it("names the seat the hero is facing", () => {
    const { spot, result } = preflopSpot(
      data.preflop.findIndex((node) => node.actionSeq.startsWith("vs_rfi_")),
    );
    const context = buildCoachContext(spot, result, { skillTier: "charts", leaks: [] });

    const villain = spot.nodeRef.split("_").pop();
    expect(context.text).toContain(`Facing: ${villain!}`);
  });

  it("says how many players are still to act, or that nobody is", () => {
    for (let i = 0; i < data.preflop.length; i++) {
      const { spot, result } = preflopSpot(i);
      const context = buildCoachContext(spot, result, { skillTier: "never", leaks: [] });

      const stated = /Still to act behind the hero|Nobody is left to act/.test(context.text);
      expect(stated, `${spot.nodeRef} leaves the seat count to the model's imagination`).toBe(true);
    }
  });

  it("prints no identifier into the prompt", () => {
    // The model echoes the vocabulary it is given, so a `raise_small` here comes
    // straight back out in a sentence the user reads.
    for (let i = 0; i < data.preflop.length; i++) {
      const { spot, result } = preflopSpot(i);
      const context = buildCoachContext(spot, result, { skillTier: "never", leaks: [] });
      expect(/\b[a-z]+_[a-z0-9]+\b/.test(context.text.replace(/^Facing.*$/gm, ""))).toBe(false);
    }
  });

  it("gives the hint context the same board statement", () => {
    const { spot, node } = preflopSpot();
    const context = buildHintContext(toClientSpot(spot), 1, {
      bestAction: node.actions[0]!,
      mix: node.strategy[spot.handKey] ?? {},
    });

    expect(context.text).toContain("Board: NONE");
  });
});

describe("the invented-board guard", () => {
  /*
   * Present tense goes, future tense stays. Preflop reasoning legitimately
   * talks about what a hand can BECOME — "small pairs are here to hit a set" is
   * the actual reason they are in the range — and a guard that blocked it would
   * remove the explanation it exists to protect.
   */
  const FICTION = [
    "You pick up straight and flush draws on this board.",
    "The flop is dry, so betting small is enough.",
    "You have a flush draw and two overcards.",
    "Your top pair is good enough here.",
    "On an ace-high board this hand does well.",
    "The board texture favours the preflop aggressor.",
    "You flopped a set.",
  ];

  const HONEST = [
    "Small pairs are here because they sometimes make a set later.",
    "Suited connectors can make straights, which is why they come along.",
    "Ace-five suited plays well after the flop, so it can afford to raise.",
    "This hand is ahead of the range that calls you.",
    "Raising folds out the hands that would outdraw you.",
    "You have position, so you get to act last for the rest of the hand.",
  ];

  it("catches every board claim", () => {
    for (const line of FICTION) {
      expect(inventsBoard(line), `let through: "${line}"`).toBe(true);
    }
  });

  it("allows a hand's future without asserting a present one", () => {
    for (const line of HONEST) {
      expect(inventsBoard(line), `wrongly blocked: "${line}"`).toBe(false);
    }
  });

  it("templates the explanation when the model invents a board preflop", () => {
    const { result } = preflopSpot();
    const checked = redact(FICTION[0]!, result, "never", { hasBoard: false });

    expect(checked.safe).toBe(false);
    expect(checked.reason).toBe("invents_board");
    expect(checked.text).not.toBe(FICTION[0]);
  });

  it("leaves the same sentence alone on a real flop", () => {
    const { result } = preflopSpot();
    const checked = redact(FICTION[0]!, result, "never", { hasBoard: true });

    expect(checked.safe).toBe(true);
  });

  it("applies to hints too, which fire before the user acts", () => {
    const checked = redactHint("Think about how this board hits your range.", 1, ["fold", "call"], {
      hasBoard: false,
    });

    expect(checked.reason).toBe("invents_board");
  });
});

describe("preflop is derivable from the node ref alone", () => {
  // The guard is handed a graded decision, not the spot that produced it, so
  // "is there a board" has to be answerable without one.
  it("reads every served preflop node as preflop", () => {
    for (const node of data.preflop) {
      expect(isPreflopNodeRef(node.ref), `${node.ref}`).toBe(true);
    }
  });

  it("reads every postflop template as postflop", () => {
    for (const template of data.postflop) {
      expect(isPreflopNodeRef(template.ref), `${template.ref}`).toBe(false);
    }
  });
});
