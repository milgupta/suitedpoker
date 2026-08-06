/**
 * The 36-explanation matrix.
 *
 * Six grades x three display modes x both skill-tier extremes. The point is not
 * that 36 is a magic number — it is that every combination has a DIFFERENT job,
 * and a coach that writes the same paragraph with the verdict swapped is the
 * thing a beginner recognises instantly as a machine.
 *
 * With no Gemini key, the templates below are what users actually read. So they
 * are held to the same three rules the model is: never contradict the ground
 * truth, never exceed four sentences, and never use undefined jargon on someone
 * who has never studied.
 */

import { describe, expect, it } from "vitest";
import { GRADE_NAMES, type DisplayMode, type Grade, type GradeName } from "../../src/poker/grader";
import { redact, templateExplanation } from "../../src/lib/ai/redact";
import {
  JARGON,
  shouldAutoExplain,
  SKILL_TIERS,
  tierOf,
  type SkillTier,
} from "../../src/lib/explain-policy";
import {
  COACH_SYSTEM_PROMPT,
  explanationInstruction,
  GRADE_INSTRUCTIONS,
  MIXED_INSTRUCTION,
  PROMPT_VERSION,
  TIER_INSTRUCTIONS,
} from "../../src/lib/ai/prompts";

const DISPLAY_MODES: readonly DisplayMode[] = ["clear", "preferred", "mixed"];
/** The extremes. A prompt that handles both ends handles the middle. */
const TIER_EXTREMES: readonly SkillTier[] = ["never", "solver"];

/** Word-boundary jargon match, plurals included. */
const JARGON_RE = new RegExp(`\\b(${JARGON.join("|")})s?\\b`, "i");

function gradeFor(grade: GradeName, displayMode: DisplayMode): Grade {
  const evLoss =
    grade === "best" || grade === "sharp"
      ? 0
      : grade === "solid"
        ? 0.2
        : grade === "inaccuracy"
          ? 0.8
          : grade === "mistake"
            ? 1.8
            : 4.5;

  const frequencies: Record<string, number> =
    displayMode === "mixed"
      ? { raise: 0.52, call: 0.48 }
      : displayMode === "preferred"
        ? { raise: 0.58, call: 0.35, fold: 0.07 }
        : { raise: 0.86, call: 0.1, fold: 0.04 };

  const chosenAction = grade === "best" || grade === "sharp" ? "raise" : "call";
  const topFreq = frequencies.raise ?? 0;

  return {
    grade,
    evLoss,
    chosenEv: 2.0 - evLoss,
    bestEv: 2.0,
    bestAction: "raise",
    chosenAction,
    frequencies,
    displayMode,
    topAction: "raise",
    topFreq,
    evGap: evLoss,
    alternativeActions: [{ action: "call", freq: frequencies.call ?? 0, ev: 2.0 - evLoss, evLoss }],
    // A `solid` grade on a preferred spot is exactly the balanced-alternative
    // case, which must never read as a near-miss.
    isBalancedAlternative: grade === "solid",
  };
}

interface Case {
  grade: GradeName;
  displayMode: DisplayMode;
  tier: SkillTier;
  data: Grade;
  text: string;
}

const CASES: Case[] = GRADE_NAMES.flatMap((grade) =>
  DISPLAY_MODES.flatMap((displayMode) =>
    TIER_EXTREMES.map((tier) => {
      const data = gradeFor(grade, displayMode);
      return { grade, displayMode, tier, data, text: templateExplanation(data, tier) };
    }),
  ),
);

describe("the 36-explanation matrix", () => {
  it("covers every grade, display mode and tier extreme", () => {
    expect(CASES).toHaveLength(36);
  });

  it("prints all 36 so they can be read", () => {
    console.log(
      `\n${"=".repeat(72)}\n36 EXPLANATIONS (template path — no Gemini key)\n${"=".repeat(72)}`,
    );
    for (const [index, c] of CASES.entries()) {
      console.log(
        `\n[${String(index + 1).padStart(2, "0")}] ${c.grade} / ${c.displayMode} / tier:${c.tier}\n     ${c.text}`,
      );
    }
    console.log(`\n${"=".repeat(72)}\n`);
    expect(CASES).toHaveLength(36);
  });

  it("never contradicts the ground truth", () => {
    const bad = CASES.filter((c) => !redact(c.text, c.data, c.tier).safe).map(
      (c) => `${c.grade}/${c.displayMode}/${c.tier}: ${c.text}`,
    );
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("never exceeds four sentences", () => {
    const long = CASES.map((c) => ({
      c,
      sentences: (c.text.match(/[.!?](\s|$)/g) ?? []).length,
    })).filter((x) => x.sentences > 4);
    expect(
      long.map((x) => `${x.c.grade}/${x.c.displayMode}: ${x.sentences} sentences`),
      "an explanation ran long",
    ).toEqual([]);
  });

  it("uses NO jargon on a user who has never studied", () => {
    const leaked = CASES.filter((c) => c.tier === "never")
      .map((c) => ({ c, match: JARGON_RE.exec(c.text)?.[0] }))
      .filter((x) => x.match !== undefined);

    expect(
      leaked.map((x) => `${x.c.grade}/${x.c.displayMode}: "${x.match}" in "${x.c.text}"`),
      "undefined jargon reached a beginner",
    ).toEqual([]);
  });

  it("never phrases a balanced alternative as a near-miss", () => {
    // The `solid` grade means the action IS part of the strategy. Copy that
    // calls it a small error contradicts the grader.
    for (const c of CASES.filter((x) => x.grade === "solid" && x.displayMode !== "mixed")) {
      expect(c.text.toLowerCase(), c.text).not.toMatch(/\b(mistake|error|wrong|worse)\b/);
    }
  });

  it("does not say the same thing for every grade", () => {
    // The whole point of 4.3 is that six grades have six different jobs. A
    // template that ignores the grade quietly undoes that — and with no Gemini
    // key the template is what every user reads.
    for (const displayMode of ["clear", "preferred"] as const) {
      const byGrade = GRADE_NAMES.map((grade) => templateExplanation(gradeFor(grade, displayMode)));
      expect(new Set(byGrade).size, `${displayMode}: grades share text`).toBeGreaterThan(3);
    }
  });

  it("praises a sharp specifically, not generically", () => {
    // `sharp` is `best` on a node most real players get wrong. That is a
    // concrete thing to say, and generic praise wastes the moment.
    const text = templateExplanation(gradeFor("sharp", "clear"));
    expect(text).toContain("most players do not find it");
    expect(templateExplanation(gradeFor("best", "clear"))).not.toContain("most players");
  });

  it("leads a blunder with the strategy rather than the criticism", () => {
    const text = templateExplanation(gradeFor("blunder", "clear"));
    expect(text.indexOf("strategy")).toBeLessThan(text.indexOf("costs"));
  });

  it("gives a mistake the number it costs at volume", () => {
    expect(templateExplanation(gradeFor("mistake", "clear"))).toContain("over a hundred spots");
  });

  it("never lists an action the strategy never takes", () => {
    // "raise 0%" in the mix is noise, and on a mixed spot the list is the
    // lesson — every entry has to be an action that actually happens.
    const zeroed = gradeFor("inaccuracy", "mixed");
    const text = templateExplanation({
      ...zeroed,
      frequencies: { fold: 0.55, call: 0.45, raise: 0 },
    });
    expect(text).not.toContain("0%");
  });

  it("says mix, not error, on a mixed spot", () => {
    for (const c of CASES.filter((x) => x.displayMode === "mixed")) {
      expect(c.text.toLowerCase()).toContain("mix");
    }
  });
});

describe("the per-grade instructions", () => {
  it("gives each grade a genuinely different job", () => {
    const texts = GRADE_NAMES.map((g) => GRADE_INSTRUCTIONS[g]);
    expect(new Set(texts).size, "two grades share an instruction").toBe(GRADE_NAMES.length);
  });

  it("earns praise only on sharp, and demands it be specific", () => {
    expect(GRADE_INSTRUCTIONS.sharp).toContain("praise is earned");
    expect(GRADE_INSTRUCTIONS.sharp).toContain("Generic praise wastes it");
  });

  it("forbids framing a solid as a near-miss", () => {
    expect(GRADE_INSTRUCTIONS.solid).toContain("NEVER phrase this as a near-miss");
  });

  it("starts a blunder with the concept, not the criticism", () => {
    expect(GRADE_INSTRUCTIONS.blunder).toContain("START with the concept");
    expect(GRADE_INSTRUCTIONS.blunder).toContain("Never make them feel stupid");
  });

  it("gives a mistake a rule of thumb to carry forward", () => {
    expect(GRADE_INSTRUCTIONS.mistake).toContain("rule of thumb");
  });

  it("replaces the grade job entirely on a mixed spot", () => {
    // Whatever the grade, a mix is about why both actions exist.
    for (const grade of GRADE_NAMES) {
      const instruction = explanationInstruction(grade, "mixed", "never");
      expect(instruction).toContain(MIXED_INSTRUCTION);
      expect(instruction).not.toContain(GRADE_INSTRUCTIONS[grade]);
    }
  });

  it("caps the length in the prompt as well as in the test", () => {
    expect(explanationInstruction("blunder", "clear", "never")).toContain("Maximum FOUR sentences");
  });
});

describe("the tier instructions", () => {
  it("bans every jargon term outright at the novice end", () => {
    const never = TIER_INSTRUCTIONS.never;
    for (const term of ["range", "equity", "polarized", "blocker", "GTO", "EV", "c-bet", "ICM"]) {
      expect(never, `"${term}" is not named in the never-studied instruction`).toContain(term);
    }
    expect(never).toContain("ZERO jargon");
  });

  it("expects range-versus-range language at the solver end", () => {
    expect(TIER_INSTRUCTIONS.solver).toContain("Range-versus-range");
    expect(TIER_INSTRUCTIONS.solver).toContain("condescension");
  });

  it("is reachable for every tier", () => {
    for (const tier of SKILL_TIERS) {
      expect(explanationInstruction("best", "clear", tier)).toContain(TIER_INSTRUCTIONS[tier]);
    }
  });

  it("bumps the prompt version, because the prompt changed", () => {
    // The cache key includes it. Editing a prompt without bumping serves stale
    // explanations for thirty days.
    expect(PROMPT_VERSION).toBe("v2");
    expect(COACH_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });
});

describe("when the coach speaks unasked", () => {
  it("stays quiet on best and solid", () => {
    expect(shouldAutoExplain("best")).toBe(false);
    expect(shouldAutoExplain("solid")).toBe(false);
  });

  it("always speaks on sharp", () => {
    // Rare by construction, and the moment the product feels worth the money.
    expect(shouldAutoExplain("sharp")).toBe(true);
  });

  it("always speaks on a mistake of any size", () => {
    expect(shouldAutoExplain("inaccuracy")).toBe(true);
    expect(shouldAutoExplain("mistake")).toBe(true);
    expect(shouldAutoExplain("blunder")).toBe(true);
  });

  it("skips the majority of answers, which is where the saving is", () => {
    const skipped = GRADE_NAMES.filter((g) => !shouldAutoExplain(g));
    expect(skipped).toEqual(["best", "solid"]);
  });
});

describe("tierOf", () => {
  it("passes through a real tier", () => {
    for (const tier of SKILL_TIERS) expect(tierOf(tier)).toBe(tier);
  });

  it("defaults to the careful end for anything else", () => {
    // Being wrong towards "explain everything" is the right way to be wrong.
    expect(tierOf(null)).toBe("never");
    expect(tierOf(undefined)).toBe("never");
    expect(tierOf("beginner")).toBe("never");
    expect(tierOf("")).toBe("never");
  });
});
