import type { Grade } from "@/poker/grader";
import { isNoviceTier, type SkillTier } from "@/lib/explain-policy";

/**
 * The structural enforcement of "the AI never determines strategy".
 *
 * The prompt asks the model not to contradict the ground truth. This checks
 * that it did not, and replaces the output with a deterministic
 * template-generated explanation if it did. A prompt is a request; this is the
 * guarantee.
 */

export type RedactReason =
  | "contradicts_best_action"
  | "real_money"
  | "gambling_advice"
  | "site_reference"
  | "claims_solver"
  | "empty";

export interface RedactResult {
  readonly safe: boolean;
  readonly reason: RedactReason | null;
  /** The text to show — the model's, or the template fallback. */
  readonly text: string;
}

const ACTION_WORDS: Record<string, RegExp> = {
  fold: /\bfold(?:ing|s|ed)?\b/i,
  call: /\bcall(?:ing|s|ed)?\b/i,
  check: /\bcheck(?:ing|s|ed)?\b/i,
  raise: /\brais(?:e|ing|es|ed)\b/i,
  bet: /\bbet(?:ting|s)?\b/i,
  allin: /\ball[- ]?in\b/i,
};

/** Phrases that assert an action is the right one. */
const PRESCRIPTIVE = [
  /\byou should\s+(\w+)/i,
  /\bthe (?:correct|right|best) (?:play|action|move) (?:here )?is (?:to )?(\w+)/i,
  /\bthe solver (?:always )?(\w+)s\b/i,
  /\byou must\s+(\w+)/i,
];

const REAL_MONEY = /\$\d|\breal money\b|\bcash game for money\b|\bdeposit\b|\bwithdraw\b/i;
const GAMBLING_ADVICE = /\bbankroll\b|\bgamble\b|\bbet real\b|\bstake your\b/i;
const SITE_REFERENCE = /\bpokerstars\b|\bggpoker\b|\bpartypoker\b|\bacr\b|\bignition\b|\bwsop\b/i;
const CLAIMS_SOLVER = /\bwe (?:are|use) a solver\b|\bthis is a solver\b|\bi solved\b/i;

/**
 * A deterministic explanation built from the solution data alone.
 *
 * Used when the model fails, times out, or trips the guard. It is deliberately
 * plain: a slightly dull explanation that is definitely true beats a fluent one
 * that might be wrong, in a product whose entire claim is accuracy.
 *
 * It obeys the SAME jargon rule as the model. With no Gemini key this template
 * is what every user actually reads, so a fallback that says "highest-EV" to
 * someone who has never studied poker is not a fallback — it is the product,
 * failing at the one thing it promised.
 */
export function templateExplanation(grade: Grade, tier: SkillTier = "never"): string {
  const topPct = Math.round(grade.topFreq * 100);
  const novice = isNoviceTier(tier);
  /** "the highest-EV action" for a studied user, plain English for everyone else. */
  const bestPhrase = novice ? "wins the most in the long run" : "is the highest-EV action";

  if (grade.displayMode === "mixed") {
    const parts = Object.entries(grade.frequencies)
      // A "raise 0%" in the list is noise, and on a mixed spot the list IS the
      // lesson — every entry in it has to be an action the strategy takes.
      .filter(([, freq]) => Math.round(freq * 100) > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([action, freq]) => `${action} ${Math.round(freq * 100)}%`)
      .join(", ");
    return `This spot is a genuine mix: ${parts}. More than one action is correct here, which is why the same hand can be played differently without either line being a mistake.`;
  }

  if (grade.isBalancedAlternative) {
    const chosenPct = Math.round((grade.frequencies[grade.chosenAction] ?? 0) * 100);
    return `${grade.bestAction} is the most common action here at ${topPct}%, but ${grade.chosenAction} is taken ${chosenPct}% of the time — a real part of the strategy in its own right.`;
  }

  // `sharp` is not a band — it is `best` on a node most real players get wrong.
  // That is a specific, true thing to say, and specific praise is the only kind
  // worth giving.
  if (grade.grade === "sharp") {
    return `${grade.bestAction} ${bestPhrase} here, taken ${topPct}% of the time — and most players do not find it. You did.`;
  }

  if (grade.evLoss === 0) {
    return `${grade.bestAction} ${bestPhrase} here, taken ${topPct}% of the time.`;
  }

  const cost = novice
    ? `${grade.chosenAction} costs ${grade.evLoss.toFixed(2)} big blinds against it.`
    : `${grade.chosenAction} gives up ${grade.evLoss.toFixed(2)}bb against it.`;

  // A blunder leads with the strategy, not the criticism. It is the same two
  // facts in the other order, and the order is what stops a beginner quitting.
  if (grade.grade === "blunder") {
    const perHundred = (grade.evLoss * 100).toFixed(0);
    return `The strategy here is heavily one-sided: ${grade.bestAction} ${topPct}% of the time. ${cost} Over a hundred spots like this one, that is ${perHundred} big blinds.`;
  }

  // A mistake gets the number it costs at volume — the concrete thing to carry
  // into the next hand, and arithmetic rather than invention.
  if (grade.grade === "mistake") {
    const perHundred = (grade.evLoss * 100).toFixed(0);
    return `${grade.bestAction} ${bestPhrase} here, taken ${topPct}% of the time. ${cost} Repeated over a hundred spots that is ${perHundred} big blinds.`;
  }

  return `${grade.bestAction} ${bestPhrase} here, taken ${topPct}% of the time. ${cost}`;
}

/**
 * Checks model output against the ground truth and the content rules.
 *
 * The contradiction check is deliberately narrow: it looks for a PRESCRIPTIVE
 * statement naming an action that is not the best one. Merely mentioning
 * another action is fine and often necessary — "folding is close here" is
 * exactly the explanation a mixed spot needs.
 */
export function redact(text: string, grade: Grade, tier: SkillTier = "never"): RedactResult {
  const fallback = templateExplanation(grade, tier);
  const trimmed = text.trim();

  if (trimmed === "") return { safe: false, reason: "empty", text: fallback };

  if (REAL_MONEY.test(trimmed)) return { safe: false, reason: "real_money", text: fallback };
  if (GAMBLING_ADVICE.test(trimmed))
    return { safe: false, reason: "gambling_advice", text: fallback };
  if (SITE_REFERENCE.test(trimmed))
    return { safe: false, reason: "site_reference", text: fallback };
  if (CLAIMS_SOLVER.test(trimmed)) return { safe: false, reason: "claims_solver", text: fallback };

  for (const pattern of PRESCRIPTIVE) {
    const match = pattern.exec(trimmed);
    const claimed = match?.[1]?.toLowerCase();
    if (claimed === undefined) continue;

    // Normalise "raises" -> "raise" and so on by testing the action words.
    for (const [action, word] of Object.entries(ACTION_WORDS)) {
      if (!word.test(claimed)) continue;
      // A mixed spot has more than one correct action, so only a `clear`
      // display can be contradicted at all.
      if (action !== grade.bestAction && grade.displayMode === "clear") {
        return { safe: false, reason: "contradicts_best_action", text: fallback };
      }
    }
  }

  return { safe: true, reason: null, text: trimmed };
}

/**
 * The hint guard. Levels 1 and 2 may not name ANY action — that would give the
 * answer away before the user has acted, which is the whole thing a hint must
 * not do.
 */
export function redactHint(
  text: string,
  level: 1 | 2 | 3,
  legalActions: readonly string[],
): RedactResult {
  const trimmed = text.trim();
  const fallback =
    level === 1
      ? "Think about your position and how the action so far narrows what everyone can have."
      : level === 2
        ? "Focus on whether your hand wants to build a pot, protect what it has, or give up."
        : "Consider the passive line here.";

  if (trimmed === "") return { safe: false, reason: "empty", text: fallback };
  if (REAL_MONEY.test(trimmed)) return { safe: false, reason: "real_money", text: fallback };
  if (GAMBLING_ADVICE.test(trimmed))
    return { safe: false, reason: "gambling_advice", text: fallback };

  if (level < 3) {
    for (const action of legalActions) {
      const word = ACTION_WORDS[action];
      if (word !== undefined && word.test(trimmed)) {
        return { safe: false, reason: "contradicts_best_action", text: fallback };
      }
    }
  }

  return { safe: true, reason: null, text: trimmed };
}
