import type { HandClass } from "@/poker/handclass";

/**
 * The hint system's rules and its deterministic fallback.
 *
 * A hint fires BEFORE the user acts, which makes it the one AI surface where a
 * leak is not a quality problem but a product failure — a hint that names the
 * action has simply answered the question. So levels 1 and 2 may not contain any
 * action word at all, enforced by `redactHint()` on model output and guaranteed
 * here by construction for the templates.
 *
 * No model is required for a hint to be useful. Everything below is written from
 * the spot alone and is what ships when Gemini is unreachable or unconfigured.
 */

export type HintLevel = 1 | 2 | 3;
export const HINT_LEVELS: readonly HintLevel[] = [1, 2, 3];
export const MAX_HINT_LEVEL: HintLevel = 3;

/** Cost control, per the plan. Counted per new level, not per request. */
export const MAX_HINTS_PER_DAY = 20;

/**
 * How much of a rating GAIN a hint costs.
 *
 * Deliberately not a wipeout: the goal is learning, not gatekeeping. A user who
 * needed a nudge and then found the right answer has still learned something,
 * and zeroing them out teaches them to guess instead of asking.
 *
 * Level 1 is free because orientation is not an answer — it is the question
 * restated, which is what a good coach does before anything else.
 */
export const HINT_PENALTY: Record<0 | HintLevel, number> = {
  0: 0,
  1: 0,
  2: 0.3,
  3: 0.6,
};

/**
 * Applies the penalty to a rating delta.
 *
 * Only gains shrink. A hinted hand that still went wrong keeps its full loss —
 * softening that would let a user farm hints to protect a rating, and the rating
 * is supposed to mean something.
 */
export function applyHintPenalty(delta: number, maxLevelUsed: number): number {
  if (delta <= 0) return delta;
  const level = Math.min(3, Math.max(0, Math.round(maxLevelUsed))) as 0 | HintLevel;
  return Math.round(delta * (1 - HINT_PENALTY[level]));
}

/* ── The deterministic templates ─────────────────────────────────────────── */

export type Street = "preflop" | "flop" | "turn" | "river";

/**
 * Which preflop situation the hero is in.
 *
 * Derived from the node's `actionSeq` rather than sniffed out of the rendered
 * action history: the history is display text and will be rewritten one day,
 * and a hint that silently degrades when a string changes is worse than one
 * that fails loudly.
 */
export type PreflopSituation = "rfi" | "vs_rfi" | "vs_3bet" | "vs_4bet";

export interface PreflopContext {
  readonly situation: PreflopSituation;
  /** The opponent whose action hero is facing. Null when first in. */
  readonly villainPos: string | null;
}

export function preflopContextOf(actionSeq: string): PreflopContext {
  if (actionSeq === "rfi") return { situation: "rfi", villainPos: null };

  for (const prefix of ["vs_rfi_", "vs_3bet_", "vs_4bet_"] as const) {
    if (actionSeq.startsWith(prefix)) {
      return {
        situation: prefix.slice(0, -1) as PreflopSituation,
        villainPos: actionSeq.slice(prefix.length),
      };
    }
  }

  return { situation: "vs_rfi", villainPos: null };
}

export interface HintSpotView {
  readonly heroPos: string;
  readonly street: Street;
  readonly potBb: number;
  readonly effStackBb: number;
  readonly actionHistory: readonly string[];
  readonly legalActions: readonly string[];
  /** Server-side only — never on a ClientSpot. */
  readonly handClass: HandClass | null;
  readonly boardCards: number;
  /** Null on a postflop spot. */
  readonly preflop: PreflopContext | null;
}

/**
 * Two different facts about position, deliberately kept apart.
 *
 * CO has players behind it but does NOT open tight, and conflating the two
 * produces a hint that is fluent and wrong — "an opening range from CO is
 * tight" is exactly the kind of confidently false statement that destroys trust
 * in a product whose whole claim is accuracy.
 */
const OPENS_TIGHT = new Set(["UTG", "MP"]);

/** Who is still to speak when hero opens. Stated, not implied, so it is checkable. */
const BEHIND: Record<string, string> = {
  UTG: "most of the table still to speak behind you",
  MP: "most of the table still to speak behind you",
  CO: "the button and both blinds behind you",
  BTN: "only the two blinds behind you",
  SB: "only the big blind left",
};

/**
 * Level 1 — orientation. Points at what to consider without evaluating it.
 *
 * Every string here is checked by a test against the action-word list, because
 * "this template is safe" is exactly the kind of claim that rots.
 */
export function templateHintLevel1(spot: HintSpotView): string {
  if (spot.street === "preflop") {
    const preflop = spot.preflop;
    const villain = preflop?.villainPos ?? "the opener";

    switch (preflop?.situation) {
      case "rfi":
        return spot.heroPos === "SB"
          ? `Everyone has passed and only the big blind is left. Think about what it means to be the one out of position for the rest of the hand.`
          : `You are first into the pot from ${spot.heroPos}, with ${BEHIND[spot.heroPos] ?? "players still to speak behind you"}. How many of them wake up with a hand is the real question.`;
      case "vs_3bet":
        return `${villain} came back over the top of you. Think about what that answer is usually made of from ${villain}.`;
      case "vs_4bet":
        return `You applied the second wave of pressure and ${villain} answered anyway. Think about what has to be true for them to do that.`;
      default:
        return `The aggression came from ${villain}. Think about how wide that seat can be before you think about your own hand.`;
    }
  }

  if (spot.effStackBb < 40) {
    return `Stacks are ${spot.effStackBb.toFixed(0)}bb against a ${spot.potBb.toFixed(1)}bb pot. Think about how many more decisions are left in this hand.`;
  }

  if (spot.street === "river") {
    return `There are no more cards to come. Think about which hands got to this point on this line — theirs, not just yours.`;
  }

  if (spot.street === "turn") {
    return `Think about how this turn card changed who it helped. It rarely helps both ranges equally.`;
  }

  return `Think about how this flop connects with the range that took the aggressive line before it, not just with your two cards.`;
}

/**
 * Level 2 — narrowing. Names the key factor, or rules out a line by describing
 * why it does not apply. Still no action word.
 */
export function templateHintLevel2(spot: HintSpotView): string {
  const handClass = spot.handClass;

  if (spot.street === "preflop") {
    const preflop = spot.preflop;
    const villain = preflop?.villainPos ?? "the opener";

    switch (preflop?.situation) {
      case "rfi":
        if (spot.heroPos === "SB") {
          return `You will be out of position for every remaining street against one opponent. That, not the hand itself, is the deciding factor here.`;
        }
        return OPENS_TIGHT.has(spot.heroPos)
          ? `From ${spot.heroPos} the deciding factor is how this hand does when someone behind wakes up with a real one — not how it looks on its own.`
          : `From ${spot.heroPos} there are ${BEHIND[spot.heroPos] ?? "few players left"}, so the deciding factor is how well the hand plays against those specific seats rather than raw strength.`;
      case "vs_3bet":
        return `The range that came over the top is narrow and strong. The deciding factor is whether your hand keeps its value against THAT, not against the field.`;
      case "vs_4bet":
        return `Ranges are as narrow as they ever get preflop here. The deciding factor is whether your hand is in the small group that can stand that much pressure.`;
      default:
        return OPENS_TIGHT.has(villain)
          ? `An opening range from ${villain} is tight, so the deciding factor is whether your hand is genuinely ahead of it rather than merely pretty.`
          : `${villain} can be very wide from there, so the deciding factor is that hands which look marginal against a tight range are worth much more here.`;
    }
  }

  if (handClass === null) {
    return `The deciding factor is how much of your range is still strong on this texture, not how strong this particular hand is.`;
  }

  const STRONG = new Set<HandClass>([
    "straight_flush",
    "quads",
    "full_house",
    "flush",
    "straight",
    "set",
    "two_pair",
    "overpair",
    "top_pair_good_kicker",
  ]);

  const DRAWS = new Set<HandClass>(["combo_draw", "flush_draw", "open_ended", "gutshot"]);

  const THIN = new Set<HandClass>([
    "top_pair_weak_kicker",
    "middle_pair",
    "bottom_pair",
    "pocket_pair_below_top",
  ]);

  if (STRONG.has(handClass)) {
    return `Your hand is ahead of most of what they can hold, so the question is how to get the maximum out of it — not whether you are good.`;
  }

  if (DRAWS.has(handClass)) {
    return `Your equity is mostly in cards still to come. The deciding factor is how often you get to see them, and at what price.`;
  }

  if (THIN.has(handClass)) {
    return `You have showdown value but not much of it. The deciding factor is how many worse hands could still put money in against you.`;
  }

  return `Your hand is mostly card strength rather than made strength. The deciding factor is how often their range missed this board too.`;
}

/**
 * Level 3 — directional. Names the action CATEGORY, never a size and never a
 * frequency. This is the only level allowed to say an action word.
 */
export function templateHintLevel3(bestAction: string): string {
  const action = bestAction.toLowerCase();

  if (action.startsWith("fold")) return `This is a folding hand.`;
  if (action.startsWith("call")) return `This is a calling hand.`;
  if (action.startsWith("check")) return `This is a checking hand.`;
  if (action.startsWith("raise") || action.startsWith("3bet") || action.startsWith("4bet")) {
    return `This is a raising hand.`;
  }
  if (action.startsWith("bet")) return `This is a betting hand.`;
  if (action.includes("all")) return `This is a hand that wants the stacks in.`;

  return `The aggressive line is the one worth thinking hardest about here.`;
}

export function templateHint(
  level: HintLevel,
  spot: HintSpotView,
  bestAction: string | null,
): string {
  if (level === 1) return templateHintLevel1(spot);
  if (level === 2) return templateHintLevel2(spot);
  return bestAction === null ? templateHintLevel2(spot) : templateHintLevel3(bestAction);
}

/** Street from the number of board cards. */
export function streetOf(boardCards: number): Street {
  if (boardCards === 0) return "preflop";
  if (boardCards === 3) return "flop";
  if (boardCards === 4) return "turn";
  return "river";
}
