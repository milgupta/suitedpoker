import { isPlayedFrequency, type Grade } from "@/poker/grader";
import type { ClientSpot, Spot } from "@/poker/generator";
import type { Card } from "@/poker/cards";
import { cardsToString } from "@/poker/cards";
import type { SkillTier } from "@/lib/explain-policy";
import { actionLabel } from "@/lib/action-label";
import { PREFLOP_ORDER, seatActivity } from "@/lib/spot-seats";
import { evFromBb } from "@/lib/units";

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

/**
 * The board, or an explicit statement that there isn't one.
 *
 * `board` was accepted by this function and never written into the prompt for
 * four substages. On a PREFLOP spot the model was handed a hand, a pot and a
 * mix, with nothing at all saying whether community cards existed — and it
 * filled the hole, explaining a button-versus-UTG opening decision in terms of
 * "the straight and flush draws you pick up on this board". There is no board.
 *
 * Saying "there is no board" is the load-bearing half. An absent field reads to
 * a language model as a detail omitted for brevity, not as a fact about the
 * world, and it will reconstruct what it thinks should have been there.
 */
function boardLine(board: readonly Card[] | undefined): string {
  if (board === undefined || board.length === 0) {
    return (
      `Board: NONE. This is a preflop decision — no community cards have been ` +
      `dealt. There is no flop, no texture, no draw and no made hand. Do not ` +
      `refer to any of them.`
    );
  }
  const street = board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  return `Board (${street}, ${board.length} cards): ${cardsToString(board)}.`;
}

/** "vs_rfi_UTG" → "UTG". The seat the hero is actually up against. */
function villainOf(nodeRef: string): string | null {
  const match = /_(?:rfi|3bet|4bet)_([A-Z]+)$/.exec(nodeRef);
  return match?.[1] ?? null;
}

export function buildCoachContext(
  spot: Pick<Spot, "nodeRef" | "handKey" | "heroPos" | "potBb" | "effStackBb" | "actionHistory"> & {
    /** Postflop only. Supplied so the model never has to infer it. */
    handClass?: string | null;
    board?: readonly Card[];
  },
  grade: Grade,
  profile: CoachProfile,
  rationale?: string | null,
): CoachContext {
  const mix = Object.entries(grade.frequencies)
    .sort((a, b) => b[1] - a[1])
    .map(([action, freq]) => `${actionLabel(action)} ${pct(freq)}`)
    .join(", ");

  const evs = [
    `${actionLabel(grade.bestAction)} ${evFromBb(grade.bestEv)} (best)`,
    ...grade.alternativeActions
      .slice(0, 3)
      .map((a) => `${actionLabel(a.action)} ${evFromBb(a.ev)}`),
  ].join(", ");

  const villain = villainOf(spot.nodeRef);

  // Who is out and who has not spoken. Without it the model has no way to know
  // whether the hero is heads-up or four-handed, and "there are still players
  // behind you" is the single most common true thing to say about a preflop
  // spot — so it says it whether or not it happens to be true.
  const seats = seatActivity(spot.heroPos, spot.actionHistory);
  const toAct = PREFLOP_ORDER.filter((p) => seats[p].toAct);
  const folded = PREFLOP_ORDER.filter((p) => seats[p].folded);

  const neverPlayed = Object.entries(grade.frequencies)
    .filter(([, freq]) => !isPlayedFrequency(freq))
    .map(([action]) => actionLabel(action));

  const lines = [
    `SPOT`,
    `Position: ${spot.heroPos}. Hand: ${spot.handKey}.`,
    // Stated, never inferred. A model asked to judge hand strength from cards
    // and a board WILL sometimes invent a pair that is not there — observed in
    // the adversarial run, on an ace-high river the model called "your strong
    // pair". Handing it the classification removes the guess entirely.
    spot.handClass != null ? `Hand strength: ${spot.handClass.replace(/_/g, " ")}.` : "",
    boardLine(spot.board),
    `Pot ${spot.potBb.toFixed(1)}bb, effective stacks ${spot.effStackBb.toFixed(0)}bb.`,
    villain !== null ? `Facing: ${villain}.` : "",
    toAct.length > 0
      ? `Still to act behind the hero: ${toAct.join(", ")} (${toAct.length}).`
      : `Nobody is left to act behind the hero — the hero closes the action.`,
    folded.length > 0 ? `Already folded: ${folded.join(", ")}.` : "",
    spot.actionHistory.length > 0 ? `Action so far: ${spot.actionHistory.join(", ")}.` : "",
    ``,
    `GROUND TRUTH STRATEGY (do not contradict)`,
    `Solver mix: ${mix}.`,
    `EVs: ${evs}.`,
    `Best action: ${actionLabel(grade.bestAction)}.`,
    grade.displayMode === "mixed"
      ? `This spot is a GENUINE MIX — more than one action is correct. Explain why both exist.`
      : grade.displayMode === "preferred"
        ? `One action is preferred but another is close.`
        : `One action is clearly best.`,
    // Named explicitly so their absence is a stated fact rather than something
    // to be inferred from a mix that adds to 100%.
    neverPlayed.length > 0 ? `Never played here: ${neverPlayed.join(", ")}.` : "",
    ``,
    `WHAT THE USER DID`,
    `Chose: ${actionLabel(grade.chosenAction)}. Grade: ${grade.grade}. EV given up: ${evFromBb(grade.evLoss)}.`,
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
  const seats = seatActivity(spot.heroPos, spot.actionHistory);
  const toAct = PREFLOP_ORDER.filter((p) => seats[p].toAct);

  const lines = [
    `SPOT`,
    `Position: ${spot.heroPos}.`,
    boardLine(spot.board),
    `Pot ${spot.potBb.toFixed(1)}bb, effective stacks ${spot.effStackBb.toFixed(0)}bb.`,
    toAct.length > 0 ? `Still to act behind the hero: ${toAct.join(", ")} (${toAct.length}).` : "",
    spot.actionHistory.length > 0 ? `Action so far: ${spot.actionHistory.join(", ")}.` : "",
    `Legal actions: ${spot.legalActions.map(actionLabel).join(", ")}.`,
    ``,
    // Levels 1 and 2 are forbidden from naming an action, and the redact guard
    // enforces it. The mix is supplied so the hint can be ABOUT the right idea
    // without stating it.
    `GROUND TRUTH (for your reasoning only — obey the level rules about what you may say)`,
    `Solver mix: ${Object.entries(strategyHint.mix)
      .sort((a, b) => b[1] - a[1])
      .map(([action, freq]) => `${actionLabel(action)} ${pct(freq)}`)
      .join(", ")}.`,
    `Level: ${level}.`,
  ];

  return {
    text: lines.filter((l) => l !== "").join("\n"),
    bestAction: strategyHint.bestAction,
    nodeRef: spot.nodeRef ?? "",
  };
}
