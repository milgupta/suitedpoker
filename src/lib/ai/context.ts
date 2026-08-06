import type { Grade } from "@/poker/grader";
import type { ClientSpot, Spot } from "@/poker/generator";
import type { SkillTier } from "@/lib/explain-policy";

/**
 * The context block handed to the model.
 *
 * Compact and STRUCTURED rather than prose: the model is being asked to explain
 * numbers, so the numbers have to be unambiguous. Kept under ~1200 tokens
 * because every token is paid for on every cache miss.
 */

export interface CoachProfile {
  /**
   * The onboarding answer, verbatim. Typed rather than a loose string so 7.1
   * cannot invent a second vocabulary — the prompt, the template and the cache
   * key all branch on this value.
   */
  skillTier: SkillTier;
  /** Top two, at most — more is noise and costs tokens. */
  leaks: readonly string[];
}

export interface CoachContext {
  /** Rendered into the user message. */
  readonly text: string;
  /** For the cache key and the redact guard. */
  readonly bestAction: string;
  readonly nodeRef: string;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function buildCoachContext(
  spot: Pick<Spot, "nodeRef" | "handKey" | "heroPos" | "potBb" | "effStackBb" | "actionHistory">,
  grade: Grade,
  profile: CoachProfile,
  rationale?: string | null,
): CoachContext {
  const mix = Object.entries(grade.frequencies)
    .sort((a, b) => b[1] - a[1])
    .map(([action, freq]) => `${action} ${pct(freq)}`)
    .join(", ");

  const evs = [
    `${grade.bestAction} ${grade.bestEv.toFixed(2)}bb (best)`,
    ...grade.alternativeActions.slice(0, 3).map((a) => `${a.action} ${a.ev.toFixed(2)}bb`),
  ].join(", ");

  const lines = [
    `SPOT`,
    `Position: ${spot.heroPos}. Hand: ${spot.handKey}.`,
    `Pot ${spot.potBb.toFixed(1)}bb, effective stacks ${spot.effStackBb.toFixed(0)}bb.`,
    spot.actionHistory.length > 0 ? `Action so far: ${spot.actionHistory.join(", ")}.` : "",
    ``,
    `GROUND TRUTH STRATEGY (do not contradict)`,
    `Solver mix: ${mix}.`,
    `EVs: ${evs}.`,
    `Best action: ${grade.bestAction}.`,
    grade.displayMode === "mixed"
      ? `This spot is a GENUINE MIX — more than one action is correct. Explain why both exist.`
      : grade.displayMode === "preferred"
        ? `One action is preferred but another is close.`
        : `One action is clearly best.`,
    ``,
    `WHAT THE USER DID`,
    `Chose: ${grade.chosenAction}. Grade: ${grade.grade}. EV given up: ${grade.evLoss.toFixed(2)}bb.`,
    grade.isBalancedAlternative
      ? `Their action IS a real part of the mixed strategy. Say so — do not treat it as an error.`
      : "",
    ``,
    `AUTHOR'S NOTE`,
    rationale != null && rationale !== "" ? rationale : "(none)",
    ``,
    `USER`,
    `Skill tier: ${profile.skillTier}.`,
    profile.leaks.length > 0 ? `Known weaknesses: ${profile.leaks.slice(0, 2).join(", ")}.` : "",
  ];

  return {
    text: lines.filter((l) => l !== "").join("\n"),
    bestAction: grade.bestAction,
    nodeRef: spot.nodeRef,
  };
}

/** The hint context omits the answer entirely — it fires BEFORE the user acts. */
export function buildHintContext(
  spot: ClientSpot & { nodeRef?: string },
  level: 1 | 2 | 3,
  strategyHint: { bestAction: string; mix: Record<string, number> },
): CoachContext {
  const lines = [
    `SPOT`,
    `Position: ${spot.heroPos}.`,
    `Pot ${spot.potBb.toFixed(1)}bb, effective stacks ${spot.effStackBb.toFixed(0)}bb.`,
    spot.actionHistory.length > 0 ? `Action so far: ${spot.actionHistory.join(", ")}.` : "",
    `Legal actions: ${spot.legalActions.join(", ")}.`,
    ``,
    // Levels 1 and 2 are forbidden from naming an action, and the redact guard
    // enforces it. The mix is supplied so the hint can be ABOUT the right idea
    // without stating it.
    `GROUND TRUTH (for your reasoning only — obey the level rules about what you may say)`,
    `Solver mix: ${Object.entries(strategyHint.mix)
      .sort((a, b) => b[1] - a[1])
      .map(([action, freq]) => `${action} ${pct(freq)}`)
      .join(", ")}.`,
    `Level: ${level}.`,
  ];

  return {
    text: lines.filter((l) => l !== "").join("\n"),
    bestAction: strategyHint.bestAction,
    nodeRef: spot.nodeRef ?? "",
  };
}
