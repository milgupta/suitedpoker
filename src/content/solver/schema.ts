/**
 * The solver scenario schema — the configuration that drives the offline solve
 * pipeline in 2.9.
 *
 * We are NOT writing a solver. TexasSolver is an open-source CFR
 * implementation; this file describes the inputs it consumes.
 *
 * Every number here is a claim that will eventually be published alongside the
 * methodology, so the schema is strict about the things that quietly produce
 * confident, precise, wrong answers: a pot that does not match the action
 * history it came from, a range that does not parse, a rake model left at zero.
 */

import { z } from "zod";

import { HERO_POSITIONS } from "@/poker/solutions";

export const POT_TYPES = ["srp", "3bet"] as const;
export type PotType = (typeof POT_TYPES)[number];

export const STREETS = ["flop", "turn", "river"] as const;
export type SolveStreet = (typeof STREETS)[number];

/** A preflop action, structured so `potBb` can be derived rather than typed. */
export const preflopActionSchema = z.object({
  actor: z.enum(HERO_POSITIONS),
  action: z.enum(["post", "fold", "call", "raise"]),
  /** Total chips this actor has committed after the action, in bb. */
  toBb: z.number().nonnegative(),
});

export type PreflopAction = z.infer<typeof preflopActionSchema>;

export const betTreeSchema = z.object({
  /** Pot fractions. Deliberately short — see the note in matrix.ts. */
  flop: z.array(z.number().positive()).min(1),
  turn: z.array(z.number().positive()).min(1),
  river: z.array(z.number().positive()).min(1),
  raiseSizes: z.array(z.number().positive()).min(1),
  allowAllIn: z.boolean(),
});

export const rakeSchema = z.object({
  percent: z.number().min(0).max(0.1),
  capBb: z.number().nonnegative(),
});

export const scenarioSchema = z
  .object({
    /** Stable — this is the solve cache key. Changing it re-solves. */
    id: z.string().min(1),
    label: z.string().min(1),
    /** Why this scenario earns a solver slot. */
    rationale: z.string().min(20),
    tableSize: z.literal(6),
    effStackBb: z.number().positive(),
    potType: z.enum(POT_TYPES),
    heroPos: z.enum(HERO_POSITIONS),
    villainPos: z.enum(HERO_POSITIONS),
    street: z.enum(STREETS),
    actionHistory: z.array(preflopActionSchema).min(2),
    potBb: z.number().positive(),
    /** Range notation. Imported from the 2.4 solution set, never retyped. */
    heroRange: z.string().min(1),
    villainRange: z.string().min(1),
    /** Whose solution node each range came from, so drift is traceable. */
    heroRangeRef: z.string().min(1),
    villainRangeRef: z.string().min(1),
    boards: z.array(z.string()).min(1),
    betTree: betTreeSchema,
    rake: rakeSchema,
    /** Exploitability stop condition, as a percentage of the pot. */
    accuracyTargetPctPot: z.number().positive().max(5),
  })
  .superRefine((scenario, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });

    if (scenario.heroPos === scenario.villainPos) {
      fail(`${scenario.id}: hero and villain are both ${scenario.heroPos}`);
    }

    // The pot must be the sum of what everyone actually put in. A hand-typed
    // pot that disagrees with its own action history is the single most likely
    // way to solve a spot that cannot occur.
    const committed = new Map<string, number>();
    for (const action of scenario.actionHistory) {
      const previous = committed.get(action.actor) ?? 0;
      if (action.toBb < previous) {
        fail(`${scenario.id}: ${action.actor} un-commits from ${previous} to ${action.toBb}`);
      }
      committed.set(action.actor, action.toBb);
    }
    const derived = [...committed.values()].reduce((sum, bb) => sum + bb, 0);
    if (Math.abs(derived - scenario.potBb) > 1e-6) {
      fail(
        `${scenario.id}: potBb is ${scenario.potBb} but the action history commits ${derived.toFixed(2)}`,
      );
    }

    if (scenario.rake.percent === 0 && scenario.rake.capBb === 0) {
      fail(
        `${scenario.id}: rake is zero. A rake-free solve systematically overstates how wide to play, ` +
          `which is exactly the mistake a beginner product must not teach. Set it explicitly.`,
      );
    }

    for (const board of scenario.boards) {
      const cards = board.trim().split(/\s+/);
      const expected = scenario.street === "flop" ? 3 : scenario.street === "turn" ? 4 : 5;
      if (cards.length !== expected) {
        fail(
          `${scenario.id}: board "${board}" has ${cards.length} cards, ${scenario.street} needs ${expected}`,
        );
      }
    }
  });

export type Scenario = z.infer<typeof scenarioSchema>;

export interface ScenarioValidation {
  ok: boolean;
  id: string;
  errors: string[];
}

export function validateScenario(input: unknown, id = "<unknown>"): ScenarioValidation {
  const result = scenarioSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      id,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, id: result.data.id, errors: [] };
}

export function parseScenario(input: unknown, source = "<inline>"): Scenario {
  const result = scenarioSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new SyntaxError(`${source} is not a valid solver scenario:\n${issues}`);
  }
  return result.data;
}

/** Total solves this matrix implies: scenarios × boards. */
export function solveCount(scenarios: readonly Scenario[]): number {
  return scenarios.reduce((sum, scenario) => sum + scenario.boards.length, 0);
}
