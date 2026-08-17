/**
 * The low-confidence grade cap.
 *
 * Every solution file self-rates the confidence of its EV column. "Blunder"
 * claims >=5bb lost — scolding a user with that word off numbers the data
 * itself rates "low" is dishonest, so the grade-spot layer caps a would-be
 * blunder at "mistake" on those nodes. The NUMBER is untouched: evLoss feeds
 * rating, leaks and accuracy, and it is already shown next to its provenance
 * label. Only the word softens.
 *
 * The cap lives in grade-spot.ts, never in the pure grader — the grader has no
 * confidence input, and confidence is a property of the stored file. When the
 * deferred solver run (2.10) raises the data's own rating, the cap stops
 * firing without being touched.
 */

import { describe, expect, it } from "vitest";
import { capGradeForConfidence, gradeSpot } from "../../src/lib/grade-spot";
import {
  parsePostflopTemplate,
  parsePreflopNode,
  type PostflopTemplate,
  type PreflopNode,
} from "../../src/poker/solutions";
import { HAND_KEYS } from "../../src/poker/range";
import { cardsFromString } from "../../src/poker/cards";
import { loadSolutionData } from "../../src/lib/solution-data";
import type { SolutionData, Spot } from "../../src/poker/generator";

type Confidence = "high" | "medium" | "low";

/** A synthetic postflop template with a controllable EV gap and confidence. */
function template(evConfidence: Confidence, betEv: number): PostflopTemplate {
  return parsePostflopTemplate(
    {
      id: "test-confidence-node",
      solutionSet: "test",
      provenance: "authored-approximation",
      label: "Confidence-cap test node",
      street: "flop",
      heroPos: "BTN",
      villainPos: "BB",
      potBb: 5,
      effStackBb: 97.5,
      heroRange: "BTN open",
      villainRange: "BB defend",
      boardTags: ["dry"],
      exampleBoards: ["Ks 7d 2c", "Qs 8d 3c", "Js 6d 2c"],
      actionHistory: ["BB checks"],
      actions: ["check", "bet_66"],
      confidence: {
        rangeShape: "medium",
        frequencies: "medium",
        ev: evConfidence,
        note: "A synthetic node written for the confidence-cap tests.",
      },
      strategies: [
        {
          handClass: "top_pair_good_kicker",
          strategy: { check: 0, bet_66: 1 },
          ev: { check: 0, bet_66: betEv },
          rationale: "Bets for value against worse pairs and the draws that call.",
        },
      ],
    },
    "grade-confidence.test",
  );
}

function preflopNode(evConfidence: Confidence): PreflopNode {
  const strategy: Record<string, Record<string, number>> = {};
  const ev: Record<string, Record<string, number>> = {};
  for (const key of HAND_KEYS) {
    strategy[key] = { fold: 0, raise: 1 };
    ev[key] = { fold: 0, raise: 6 };
  }
  return parsePreflopNode(
    {
      solutionSet: "test",
      provenance: "authored-approximation",
      heroPos: "UTG",
      actionSeq: "rfi",
      potBb: 1.5,
      effStackBb: 100,
      actions: ["fold", "raise"],
      strategy,
      ev,
      confidence: {
        rangeShape: "medium",
        frequencies: "medium",
        ev: evConfidence,
        note: "A synthetic node written for the confidence-cap tests.",
      },
    },
    "grade-confidence.test",
  );
}

// Real cards and a real board, not a stub: postflop grading is keyed on the
// combo now, so a spot with no hole cards exercises a path no user ever takes.
// `Ah Kc` on `Ks 7d 2c` is top pair with an ace kicker — the class the
// synthetic template below authors a strategy for.
const postflopSpot = {
  nodeRef: "test-confidence-node",
  handKey: "AKo",
  handClass: "top_pair_good_kicker",
  heroCards: cardsFromString("Ah Kc"),
  board: cardsFromString("Ks 7d 2c"),
  legalActions: ["check", "bet_66"],
} as unknown as Spot;

const preflopSpot = {
  nodeRef: "UTG:rfi",
  handKey: "AA",
  handClass: null,
  legalActions: ["fold", "raise"],
} as unknown as Spot;

const dataWith = (t: PostflopTemplate): SolutionData => ({ preflop: [], postflop: [t] });
const dataWithNode = (n: PreflopNode): SolutionData => ({ preflop: [n], postflop: [] });

describe("the low-confidence cap on the postflop path", () => {
  it("caps a would-be blunder at mistake and leaves the number as computed", () => {
    // Checking away a 6bb value bet: the band says blunder, the file says its
    // own EVs are a guess. The word softens; the 6bb does not.
    const result = gradeSpot(dataWith(template("low", 6)), postflopSpot, "check", "postflop");
    expect(result).not.toBeNull();
    expect(result!.grade).toBe("mistake");
    expect(result!.evLoss).toBeCloseTo(6, 6);
  });

  it("leaves medium and high confidence nodes alone", () => {
    for (const confidence of ["medium", "high"] as const) {
      const result = gradeSpot(
        dataWith(template(confidence, 6)),
        postflopSpot,
        "check",
        "postflop",
      );
      expect(result!.grade, `${confidence} confidence must still grade blunder`).toBe("blunder");
      expect(result!.evLoss).toBeCloseTo(6, 6);
    }
  });

  it("touches nothing below blunder, even at low confidence", () => {
    // A cap is a ceiling, not a discount. Mistakes stay mistakes.
    expect(gradeSpot(dataWith(template("low", 3)), postflopSpot, "check", "postflop")!.grade).toBe(
      "mistake",
    );
    expect(gradeSpot(dataWith(template("low", 1)), postflopSpot, "check", "postflop")!.grade).toBe(
      "inaccuracy",
    );
    expect(gradeSpot(dataWith(template("low", 6)), postflopSpot, "bet_66", "postflop")!.grade).toBe(
      "best",
    );
  });
});

describe("the low-confidence cap on the preflop path", () => {
  it("caps a 6bb fold of a pure raise from blunder to mistake on a low node", () => {
    const result = gradeSpot(dataWithNode(preflopNode("low")), preflopSpot, "fold", "preflop");
    expect(result!.grade).toBe("mistake");
    expect(result!.evLoss).toBeCloseTo(6, 6);
  });

  it("leaves the same decision a blunder on a medium node", () => {
    const result = gradeSpot(dataWithNode(preflopNode("medium")), preflopSpot, "fold", "preflop");
    expect(result!.grade).toBe("blunder");
  });
});

describe("capGradeForConfidence is a ceiling on the word only", () => {
  const confidence = (ev: Confidence) => ({
    rangeShape: "medium" as const,
    frequencies: "medium" as const,
    ev,
    note: "A synthetic confidence block for the pure-function tests.",
  });

  it("rewrites only a blunder, and only at low confidence", () => {
    const graded = gradeSpot(dataWith(template("high", 6)), postflopSpot, "check", "postflop")!;
    expect(graded.grade).toBe("blunder");

    expect(capGradeForConfidence(graded, confidence("low")).grade).toBe("mistake");
    expect(capGradeForConfidence(graded, confidence("medium")).grade).toBe("blunder");
    expect(capGradeForConfidence(graded, confidence("high")).grade).toBe("blunder");

    // Everything except the word survives the cap byte for byte.
    const capped = capGradeForConfidence(graded, confidence("low"));
    expect({ ...capped, grade: "blunder" }).toEqual(graded);
  });

  it("returns non-blunder grades untouched", () => {
    const solid = gradeSpot(dataWith(template("low", 0.2)), postflopSpot, "check", "postflop")!;
    expect(capGradeForConfidence(solid, confidence("low"))).toBe(solid);
  });
});

describe("the blast radius, measured from the served data", () => {
  it("prints where the cap can fire today", () => {
    const data = loadSolutionData();
    const count = (level: Confidence) => ({
      preflop: data.preflop.filter((n) => n.confidence.ev === level).length,
      postflop: data.postflop.filter((t) => t.confidence.ev === level).length,
    });

    const rows = (["high", "medium", "low"] as const).map((level) => {
      const c = count(level);
      return `  ${level.padEnd(7)} preflop:${String(c.preflop).padStart(3)}  postflop:${String(c.postflop).padStart(3)}`;
    });
    console.log(`\nEV-CONFIDENCE OF SERVED NODES (cap fires on "low"):\n${rows.join("\n")}\n`);

    // The repaired RFI nodes vouch for their EVs; the cap must not fire there.
    const rfi = data.preflop.filter((n) => n.actionSeq === "rfi");
    expect(rfi.length).toBeGreaterThan(0);
    for (const node of rfi) {
      expect(node.confidence.ev, `${node.ref} regressed to low EV confidence`).not.toBe("low");
    }

    // Documented fact, not an aspiration: every served postflop template rates
    // its EV column "low" today, so no postflop decision can grade blunder
    // until the solver run raises the data's own rating.
    expect(data.postflop.every((t) => t.confidence.ev === "low")).toBe(true);
  });
});
