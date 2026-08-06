/**
 * The adversarial run against the real model.
 *
 * `coach.test.ts` proves the guard holds when the model misbehaves. This proves
 * something different and unprovable structurally: that on twenty deliberately
 * COUNTERINTUITIVE spots — the ones where a language model's poker priors are
 * most likely to fight the supplied ground truth — the explanations it produces
 * are actually true.
 *
 * Every spot here is chosen because the "obvious" answer is wrong: small suited
 * aces raising, big offsuit aces folding, sets check-calling, overpairs folding
 * to a raise. If the model is going to contradict the data anywhere, it is here.
 *
 * Skips without GOOGLE_GENERATIVE_AI_API_KEY, exactly like the RLS tests skip
 * without Supabase credentials. A test that quietly passes because it never ran
 * is worse than no test, so the skip is loud in the reporter.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../support/load-local-env";
import type { Grade } from "../../src/poker/grader";
import type { HandKey } from "../../src/poker/range";
import type { HeroPosition } from "../../src/poker/solutions";

loadLocalEnv();

const HAS_KEY =
  typeof process.env.GOOGLE_GENERATIVE_AI_API_KEY === "string" &&
  process.env.GOOGLE_GENERATIVE_AI_API_KEY !== "";

interface SpotSpec {
  readonly label: string;
  /** Why a model would get this wrong if it were guessing. */
  readonly trap: string;
  readonly nodeRef: string;
  readonly handKey: HandKey;
  readonly heroPos: HeroPosition;
  readonly potBb: number;
  readonly effStackBb: number;
  readonly actionHistory: readonly string[];
  readonly frequencies: Record<string, number>;
  readonly evs: Record<string, number>;
  readonly chosen: string;
}

/** Twenty spots where the intuitive answer and the solver answer disagree. */
const ADVERSARIAL: readonly SpotSpec[] = [
  {
    label: "A5s opens from UTG",
    trap: "beginners and models both think a weak ace is a fold from early position",
    nodeRef: "UTG:rfi",
    handKey: "A5s",
    heroPos: "UTG",
    potBb: 1.5,
    effStackBb: 100,
    actionHistory: [],
    frequencies: { raise: 0.86, fold: 0.14 },
    evs: { raise: 0.31, fold: 0 },
    chosen: "fold",
  },
  {
    label: "AJo folds to an UTG open from the SB",
    trap: "an ace-jack looks far too strong to fold",
    nodeRef: "UTG:rfi>SB",
    handKey: "AJo",
    heroPos: "SB",
    potBb: 3.5,
    effStackBb: 100,
    actionHistory: ["UTG raises to 2.5"],
    frequencies: { fold: 0.72, raise: 0.28 },
    evs: { fold: 0, raise: -0.18, call: -0.44 },
    chosen: "call",
  },
  {
    label: "KQo folds to a 3-bet after opening CO",
    trap: "two big broadway cards feel like a call",
    nodeRef: "CO:rfi>BTN:3bet",
    handKey: "KQo",
    heroPos: "CO",
    potBb: 12,
    effStackBb: 100,
    actionHistory: ["CO raises to 2.5", "BTN 3-bets to 8"],
    frequencies: { fold: 0.91, call: 0.09 },
    evs: { fold: 0, call: -0.62 },
    chosen: "call",
  },
  {
    label: "76s 3-bets the BTN from the BB",
    trap: "a small suited connector looks like a call, not a bluff-raise",
    nodeRef: "BTN:rfi>BB",
    handKey: "76s",
    heroPos: "BB",
    potBb: 3.5,
    effStackBb: 100,
    actionHistory: ["BTN raises to 2.5"],
    frequencies: { call: 0.55, raise: 0.35, fold: 0.1 },
    evs: { call: 0.12, raise: 0.09, fold: 0 },
    chosen: "fold",
  },
  {
    label: "TT calls rather than 4-bets facing a 3-bet",
    trap: "a big pair 'should' get the money in",
    nodeRef: "BTN:rfi>BB:3bet",
    handKey: "TT",
    heroPos: "BTN",
    potBb: 13,
    effStackBb: 100,
    actionHistory: ["BTN raises to 2.5", "BB 3-bets to 10"],
    frequencies: { call: 0.82, raise: 0.11, fold: 0.07 },
    evs: { call: 1.44, raise: 0.9, fold: 0 },
    chosen: "raise",
  },
  {
    label: "A2s 4-bets as a bluff",
    trap: "the weakest ace in the deck raising for value looks absurd",
    nodeRef: "CO:rfi>BTN:3bet",
    handKey: "A2s",
    heroPos: "CO",
    potBb: 12,
    effStackBb: 100,
    actionHistory: ["CO raises to 2.5", "BTN 3-bets to 8"],
    frequencies: { raise: 0.64, fold: 0.36 },
    evs: { raise: 0.21, fold: 0, call: -0.3 },
    chosen: "fold",
  },
  {
    label: "a flopped set checks back",
    trap: "'always bet your sets' is the single most repeated beginner rule",
    nodeRef: "BTN:cbet:flop",
    handKey: "55",
    heroPos: "BTN",
    potBb: 6.5,
    effStackBb: 97,
    actionHistory: ["BTN raises to 2.5", "BB calls", "flop 5h 9c Jd", "BB checks"],
    frequencies: { check: 0.58, bet: 0.42 },
    evs: { check: 4.1, bet: 3.94 },
    chosen: "bet",
  },
  {
    label: "top pair top kicker check-calls three streets",
    trap: "TPTK feels like a raising hand",
    nodeRef: "BB:defend:river",
    handKey: "AKo",
    heroPos: "BB",
    potBb: 26,
    effStackBb: 62,
    actionHistory: [
      "BTN raises",
      "BB calls",
      "flop Ah 7c 2d",
      "turn 4s",
      "river 9h",
      "BTN bets 13",
    ],
    frequencies: { call: 0.94, fold: 0.06 },
    evs: { call: 6.2, fold: 0, raise: 3.1 },
    chosen: "raise",
  },
  {
    label: "an overpair folds to a river raise",
    trap: "folding an overpair feels weak",
    nodeRef: "CO:barrel:river>raise",
    handKey: "QQ",
    heroPos: "CO",
    potBb: 44,
    effStackBb: 30,
    actionHistory: ["CO bets 22 on the river", "BTN raises to 66"],
    frequencies: { fold: 0.88, call: 0.12 },
    evs: { fold: 0, call: -4.8 },
    chosen: "call",
  },
  {
    label: "bottom pair calls a big turn bet",
    trap: "bottom pair 'is never good'",
    nodeRef: "BB:defend:turn",
    handKey: "T9s",
    heroPos: "BB",
    potBb: 18,
    effStackBb: 74,
    actionHistory: [
      "flop 9c 4h 2s",
      "BB checks",
      "BTN bets 6",
      "BB calls",
      "turn Kd",
      "BTN bets 12",
    ],
    frequencies: { call: 0.61, fold: 0.39 },
    evs: { call: 1.2, fold: 0 },
    chosen: "fold",
  },
  {
    label: "a flush draw checks rather than semi-bluffs",
    trap: "'always bet your draws' is another rule that is only half true",
    nodeRef: "BB:lead:flop",
    handKey: "KQs",
    heroPos: "BB",
    potBb: 7,
    effStackBb: 96,
    actionHistory: ["flop 8h 5h 2c"],
    frequencies: { check: 0.79, bet: 0.21 },
    evs: { check: 3.4, bet: 3.22 },
    chosen: "bet",
  },
  {
    label: "AA checks back the flop",
    trap: "slowplaying aces looks like the classic beginner mistake",
    nodeRef: "BTN:cbet:flop",
    handKey: "AA",
    heroPos: "BTN",
    potBb: 6.5,
    effStackBb: 97,
    actionHistory: ["flop 7h 8h 9c", "BB checks"],
    frequencies: { check: 0.53, bet: 0.47 },
    evs: { check: 4.55, bet: 4.4 },
    chosen: "bet",
  },
  {
    label: "J8s defends the big blind against a button open",
    trap: "jack-eight suited looks like a trash hand",
    nodeRef: "BTN:rfi>BB",
    handKey: "J8s",
    heroPos: "BB",
    potBb: 3.5,
    effStackBb: 100,
    actionHistory: ["BTN raises to 2.5"],
    frequencies: { call: 0.93, fold: 0.07 },
    evs: { call: 0.28, fold: 0 },
    chosen: "fold",
  },
  {
    label: "99 folds to a squeeze",
    trap: "a mid pair against two opponents feels like a set-mine",
    nodeRef: "CO:rfi>BTN:call>BB:squeeze",
    handKey: "99",
    heroPos: "CO",
    potBb: 18,
    effStackBb: 100,
    actionHistory: ["CO raises to 2.5", "BTN calls", "BB squeezes to 13"],
    frequencies: { fold: 0.76, call: 0.24 },
    evs: { fold: 0, call: -0.55 },
    chosen: "call",
  },
  {
    label: "the small blind opens 44 rather than limping",
    trap: "limping small pairs from the SB feels cheap and safe",
    nodeRef: "SB:rfi",
    handKey: "44",
    heroPos: "SB",
    potBb: 1.5,
    effStackBb: 100,
    actionHistory: ["folds to SB"],
    frequencies: { raise: 0.68, fold: 0.32 },
    evs: { raise: 0.14, fold: 0 },
    chosen: "fold",
  },
  {
    label: "second pair raises the flop",
    trap: "raising with a marginal made hand looks like spew",
    nodeRef: "BB:defend:flop",
    handKey: "A8o",
    heroPos: "BB",
    potBb: 7,
    effStackBb: 96,
    actionHistory: ["flop Kd 8c 3h", "BTN bets 3.5"],
    frequencies: { call: 0.66, raise: 0.34 },
    evs: { call: 1.9, raise: 1.75 },
    chosen: "fold",
  },
  {
    label: "AQo folds to a UTG open under the gun+1",
    trap: "AQ offsuit is the hand beginners most reliably overplay",
    nodeRef: "UTG:rfi>MP",
    handKey: "AQo",
    heroPos: "MP",
    potBb: 4,
    effStackBb: 100,
    actionHistory: ["UTG raises to 2.5"],
    frequencies: { raise: 0.58, fold: 0.42 },
    evs: { raise: 0.09, fold: 0, call: -0.21 },
    chosen: "call",
  },
  {
    label: "a straight draw folds to a small bet",
    trap: "pot odds arithmetic alone says call",
    nodeRef: "BB:defend:turn",
    handKey: "JTo",
    heroPos: "BB",
    potBb: 20,
    effStackBb: 70,
    actionHistory: ["turn Qd", "BTN bets 5"],
    frequencies: { call: 0.51, fold: 0.49 },
    evs: { call: 0.4, fold: 0 },
    chosen: "raise",
  },
  {
    label: "KK folds the river on a four-flush board",
    trap: "folding kings ever is emotionally hard",
    nodeRef: "CO:barrel:river",
    handKey: "KK",
    heroPos: "CO",
    potBb: 40,
    effStackBb: 55,
    actionHistory: ["river brings the fourth heart", "BB bets 30"],
    frequencies: { fold: 0.83, call: 0.17 },
    evs: { fold: 0, call: -3.6 },
    chosen: "call",
  },
  {
    label: "a naked ace-high bluff-catches the river",
    trap: "'I only have ace high' overrides the maths for almost every beginner",
    nodeRef: "BTN:bluffcatch:river",
    handKey: "AJs",
    heroPos: "BTN",
    potBb: 22,
    effStackBb: 66,
    actionHistory: ["river 2c", "BB bets 7"],
    frequencies: { call: 0.74, fold: 0.26 },
    evs: { call: 1.1, fold: 0 },
    chosen: "fold",
  },
];

function gradeFor(spec: SpotSpec): Grade {
  const sorted = Object.entries(spec.frequencies).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];
  if (top === undefined) throw new Error(`${spec.label} has no frequencies`);

  const bestAction = top[0];
  const bestEv = spec.evs[bestAction] ?? 0;
  const chosenEv = spec.evs[spec.chosen] ?? 0;
  const evLoss = Math.max(0, bestEv - chosenEv);
  const chosenFreq = spec.frequencies[spec.chosen] ?? 0;

  const displayMode: Grade["displayMode"] =
    second !== undefined && second[1] >= 0.4
      ? "mixed"
      : second !== undefined
        ? "preferred"
        : "clear";

  return {
    grade: evLoss === 0 ? "sharp" : evLoss < 0.5 ? "inaccuracy" : "blunder",
    evLoss,
    chosenEv,
    bestEv,
    bestAction,
    chosenAction: spec.chosen,
    frequencies: spec.frequencies,
    displayMode,
    topAction: bestAction,
    topFreq: top[1],
    evGap: bestEv - (second === undefined ? 0 : (spec.evs[second[0]] ?? 0)),
    alternativeActions: sorted.slice(1).map(([action, freq]) => ({
      action,
      freq,
      ev: spec.evs[action] ?? 0,
      evLoss: Math.max(0, bestEv - (spec.evs[action] ?? 0)),
    })),
    isBalancedAlternative: chosenFreq >= 0.2,
  };
}

/**
 * Every percentage the model states must be one the data actually contains.
 *
 * The prompt forbids computing frequencies or equities, so a number that is not
 * in the supplied mix is an invented one — the exact failure mode that makes an
 * AI poker coach untrustworthy, and one the structural guard cannot see.
 */
function inventedPercentages(text: string, frequencies: Record<string, number>): string[] {
  const allowed = new Set<number>();
  for (const freq of Object.values(frequencies)) {
    const pct = Math.round(freq * 100);
    allowed.add(pct - 1);
    allowed.add(pct);
    allowed.add(pct + 1);
  }
  // Round talk about "about half the time" is fine and common.
  for (const round of [50, 100]) allowed.add(round);

  const found: string[] = [];
  for (const match of text.matchAll(/(\d{1,3})\s?%/g)) {
    const value = Number(match[1]);
    if (!allowed.has(value)) found.push(`${value}%`);
  }
  return found;
}

describe.skipIf(!HAS_KEY)("live adversarial run against Gemini", () => {
  const results: {
    spec: SpotSpec;
    text: string;
    source: string;
    redactedFor: string | null;
    costUsd: number;
  }[] = [];

  let explainDecision: typeof import("../../src/lib/ai/coach").explainDecision;

  beforeAll(async () => {
    ({ explainDecision } = await import("../../src/lib/ai/coach"));

    for (const spec of ADVERSARIAL) {
      // Stop early rather than grinding through twenty doomed calls. A key with
      // no quota fails identically every time, and 20 x retries x backoff is
      // four minutes of a test run spent proving the first failure twice.
      if (results.length >= 3 && results.every((r) => r.source === "template")) {
        throw new Error(
          `The model was unreachable for the first ${results.length} spots ` +
            `(reason: ${results[0]?.redactedFor}). Fix the key or the quota, then re-run — ` +
            `this suite is the only check that the coach never contradicts ground truth.`,
        );
      }

      const grade = gradeFor(spec);
      const result = await explainDecision(
        {
          nodeRef: spec.nodeRef,
          handKey: spec.handKey,
          heroPos: spec.heroPos,
          potBb: spec.potBb,
          effStackBb: spec.effStackBb,
          actionHistory: [...spec.actionHistory],
        },
        grade,
        { skillTier: "never", leaks: [] },
      );
      results.push({
        spec,
        text: result.text,
        source: result.source,
        redactedFor: result.redactedFor,
        costUsd: result.costUsd,
      });
    }

    // Printed in full, because the acceptance criterion is that a human reads
    // all twenty. An assertion cannot tell you an explanation is unhelpful.
    console.log(`\n${"=".repeat(72)}\n20 ADVERSARIAL EXPLANATIONS\n${"=".repeat(72)}`);
    for (const [index, r] of results.entries()) {
      const grade = gradeFor(r.spec);
      console.log(
        `\n[${index + 1}] ${r.spec.label}\n` +
          `    trap  : ${r.spec.trap}\n` +
          `    truth : best=${grade.bestAction} mix=${Object.entries(r.spec.frequencies)
            .map(([a, f]) => `${a} ${Math.round(f * 100)}%`)
            .join(", ")}\n` +
          `    chose : ${r.spec.chosen}\n` +
          `    source: ${r.source}${r.redactedFor === null ? "" : ` (redacted: ${r.redactedFor})`}\n` +
          `    ---> ${r.text}`,
      );
    }
    console.log(`\n${"=".repeat(72)}\n`);
  }, 300_000);

  it("reaches the model rather than silently falling back for every spot", () => {
    const fromModel = results.filter((r) => r.source === "model").length;
    expect(fromModel, "no spot reached the model at all").toBeGreaterThan(0);
  });

  it("never contradicts the supplied best action", () => {
    const contradictions = results.filter((r) => r.redactedFor === "contradicts_best_action");
    expect(
      contradictions.map((c) => `${c.spec.label}: ${c.text}`),
      "the model contradicted ground truth",
    ).toEqual([]);
  });

  it("never trips any content rule", () => {
    const tripped = results.filter((r) => r.redactedFor !== null);
    expect(tripped.map((t) => `${t.spec.label}: ${t.redactedFor}`)).toEqual([]);
  });

  it("never invents a frequency the data does not contain", () => {
    const invented = results
      .filter((r) => r.source === "model")
      .map((r) => ({ label: r.spec.label, bad: inventedPercentages(r.text, r.spec.frequencies) }))
      .filter((r) => r.bad.length > 0);

    expect(invented.map((i) => `${i.label}: ${i.bad.join(", ")}`)).toEqual([]);
  });

  it("stays short enough for a phone screen", () => {
    const tooLong = results.filter((r) => r.text.length > 500);
    expect(tooLong.map((t) => `${t.spec.label}: ${t.text.length} chars`)).toEqual([]);
  });

  it("costs what the projection says it costs", () => {
    const modelCalls = results.filter((r) => r.source === "model");
    const total = modelCalls.reduce((sum, r) => sum + r.costUsd, 0);
    const perCall = total / Math.max(1, modelCalls.length);
    console.log(
      `\nMEASURED: $${perCall.toFixed(6)} per explanation over ${modelCalls.length} live calls\n`,
    );
    expect(perCall).toBeLessThan(0.001);
  });

  it("serves a repeat of the same spot from cache, and faster", async () => {
    const spec = ADVERSARIAL[0];
    if (spec === undefined) throw new Error("no spots");
    const grade = gradeFor(spec);
    const spot = {
      nodeRef: spec.nodeRef,
      handKey: spec.handKey,
      heroPos: spec.heroPos,
      potBb: spec.potBb,
      effStackBb: spec.effStackBb,
      actionHistory: [...spec.actionHistory],
    };

    const started = performance.now();
    const repeat = await explainDecision(spot, grade, { skillTier: "never", leaks: [] });
    const elapsed = performance.now() - started;

    console.log(`\nCACHE HIT: ${Math.round(elapsed)}ms (source: ${repeat.source})\n`);
    expect(repeat.source).toBe("cache");
    expect(repeat.costUsd).toBe(0);
    // A cache hit that is not dramatically faster is not doing its job.
    expect(elapsed).toBeLessThan(200);
  }, 30_000);
});

describe.skipIf(HAS_KEY)("live adversarial run", () => {
  it("SKIPPED — set GOOGLE_GENERATIVE_AI_API_KEY in .env.local to run it", () => {
    expect(HAS_KEY).toBe(false);
  });
});
