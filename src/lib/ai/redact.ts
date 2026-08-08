import type { Grade } from "@/poker/grader";
import { isNoviceTier, type SkillTier } from "@/lib/explain-policy";
import { actionLabel, actionPhrase } from "@/lib/action-label";

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
  | "invents_board"
  | "real_money"
  | "gambling_advice"
  | "site_reference"
  | "claims_solver"
  | "empty";

/**
 * References to a board that does not exist.
 *
 * The observed failure: a preflop button-versus-UTG spot explained in terms of
 * "the straight and flush draws you pick up on this board". Every other guard
 * passed it — nothing was prescriptive, nothing named money, nothing claimed a
 * solver. It was simply false, and false in a way a beginner cannot detect,
 * which is the only kind of wrong that matters in a teaching product.
 *
 * These match DEFINITE and POSSESSIVE references only — a board that is being
 * asserted to exist. Preflop reasoning legitimately talks about what a hand can
 * BECOME ("small pairs call to flop a set", "suited connectors make straights"),
 * and a guard that blocked that would remove the actual reason those hands are
 * in the range. Future tense stays; present tense goes.
 */
const BOARD_CLAIMS: readonly RegExp[] = [
  // "after the flop" and "before the flop" name a STREET, not a card that has
  // been dealt — "ace-five suited plays well after the flop" is one of the true
  // reasons it is in the range, and blocking it would remove the explanation.
  /(?<!\b(?:after|before)\s)\b(?:the|this) (?:board|flop|turn|river)\b/i,
  /\b(?:board|flop) texture\b/i,
  /\byou(?:'ve| have)? (?:flopped|turned|rivered|hit)\b/i,
  /\byou (?:have|hold|are holding|'ve got|got) (?:a |an |the )?(?:flush draw|straight draw|gutshot|open[- ]ender|backdoor|top pair|second pair|middle pair|overpair|set|two pair|trips|nut flush)\b/i,
  /\byour (?:flush draw|straight draw|gutshot|open[- ]ender|top pair|second pair|middle pair|overpair|set|two pair|trips)\b/i,
  /\bwith (?:a |your )(?:flush draw|straight draw|gutshot|open[- ]ender)\b/i,
  // "on an ace-high board", "on a two-tone flop" — any number of adjectives.
  /\bon (?:a|an|this|the)(?: [\w-]+){0,3} (?:board|flop|turn|river)\b/i,
];

/**
 * Only called when the spot has NO community cards. On a real flop every one of
 * these phrases is the right thing to say.
 */
export function inventsBoard(text: string): boolean {
  return BOARD_CLAIMS.some((pattern) => pattern.test(text));
}

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
      .map(([action, freq]) => `${actionPhrase(action)} ${Math.round(freq * 100)}%`)
      .join(", ");
    return `This spot is a genuine mix: ${parts}. More than one action is correct here, which is why the same hand can be played differently without either line being a mistake.`;
  }

  if (grade.isBalancedAlternative) {
    const chosenPct = Math.round((grade.frequencies[grade.chosenAction] ?? 0) * 100);
    return `${actionLabel(grade.bestAction)} is the most common action here at ${topPct}%, but ${actionPhrase(grade.chosenAction)} is taken ${chosenPct}% of the time — a real part of the strategy in its own right.`;
  }

  // `sharp` is not a band — it is `best` on a node most real players get wrong.
  // That is a specific, true thing to say, and specific praise is the only kind
  // worth giving.
  if (grade.grade === "sharp") {
    return `${actionLabel(grade.bestAction)} ${bestPhrase} here, taken ${topPct}% of the time — and most players do not find it. You did.`;
  }

  if (grade.evLoss === 0) {
    return `${actionLabel(grade.bestAction)} ${bestPhrase} here, taken ${topPct}% of the time.`;
  }

  const cost = novice
    ? `${actionLabel(grade.chosenAction)} costs ${grade.evLoss.toFixed(2)} big blinds against it.`
    : `${actionLabel(grade.chosenAction)} gives up ${grade.evLoss.toFixed(2)}bb against it.`;

  // A blunder leads with the strategy, not the criticism. It is the same two
  // facts in the other order, and the order is what stops a beginner quitting.
  if (grade.grade === "blunder") {
    const perHundred = (grade.evLoss * 100).toFixed(0);
    return `The strategy here is heavily one-sided: ${actionPhrase(grade.bestAction)} ${topPct}% of the time. ${cost} Over a hundred spots like this one, that is ${perHundred} big blinds.`;
  }

  // A mistake gets the number it costs at volume — the concrete thing to carry
  // into the next hand, and arithmetic rather than invention.
  if (grade.grade === "mistake") {
    const perHundred = (grade.evLoss * 100).toFixed(0);
    return `${actionLabel(grade.bestAction)} ${bestPhrase} here, taken ${topPct}% of the time. ${cost} Repeated over a hundred spots that is ${perHundred} big blinds.`;
  }

  return `${actionLabel(grade.bestAction)} ${bestPhrase} here, taken ${topPct}% of the time. ${cost}`;
}

/**
 * The content rules alone — for AI surfaces whose ground truth is not a single
 * graded decision (the 6.3 session summary grounds in aggregate stats, so the
 * contradiction check does not apply, but the money/site/solver rules do).
 */
export function contentViolation(text: string): RedactReason | null {
  const trimmed = text.trim();
  if (trimmed === "") return "empty";
  if (REAL_MONEY.test(trimmed)) return "real_money";
  if (GAMBLING_ADVICE.test(trimmed)) return "gambling_advice";
  if (SITE_REFERENCE.test(trimmed)) return "site_reference";
  if (CLAIMS_SOLVER.test(trimmed)) return "claims_solver";
  return null;
}

/**
 * Checks model output against the ground truth and the content rules.
 *
 * The contradiction check is deliberately narrow: it looks for a PRESCRIPTIVE
 * statement naming an action that is not the best one. Merely mentioning
 * another action is fine and often necessary — "folding is close here" is
 * exactly the explanation a mixed spot needs.
 */
export interface RedactOptions {
  /**
   * True when the spot has community cards. Board language is then the correct
   * thing to say and is left alone; when false, it is fiction and is rejected.
   */
  readonly hasBoard: boolean;
}

export function redact(
  text: string,
  grade: Grade,
  tier: SkillTier = "never",
  options: RedactOptions = { hasBoard: false },
): RedactResult {
  const fallback = templateExplanation(grade, tier);
  const trimmed = text.trim();

  if (trimmed === "") return { safe: false, reason: "empty", text: fallback };

  if (!options.hasBoard && inventsBoard(trimmed))
    return { safe: false, reason: "invents_board", text: fallback };

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
  options: RedactOptions = { hasBoard: false },
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
  if (!options.hasBoard && inventsBoard(trimmed))
    return { safe: false, reason: "invents_board", text: fallback };

  if (level < 3) {
    /*
     * EVERY action word, not just the ones legal in this spot.
     *
     * This used to iterate `legalActions`, which left a hole exactly the size
     * of the words that were not legal: a level-1 hint shipped reading "when
     * your opponent makes a massive four-bet, look at the strength required to
     * play back against them". "bet" was not among the hero's legal actions, so
     * nothing tested for it — and a beginner reading "four-bet … play back" has
     * been pointed straight at aggression before acting, which is the one thing
     * a pre-decision hint must never do.
     *
     * The stated guarantee was always "levels 1 and 2 may not name ANY action".
     * The implementation was narrower than the promise; this closes it.
     *
     * `legalActions` is still taken so the signature and the call sites stay
     * put, and so level 3 can use it if it ever needs to.
     */
    void legalActions;
    for (const word of Object.values(ACTION_WORDS)) {
      if (word.test(trimmed)) {
        return { safe: false, reason: "contradicts_best_action", text: fallback };
      }
    }
  }

  return { safe: true, reason: null, text: trimmed };
}
