/**
 * The grading engine — the conceptual heart of the product.
 *
 * Poker strategy is a DISTRIBUTION, not a right answer. A solver may play AJo
 * as 62% raise / 38% fold. Marking the 38% action "wrong" teaches beginners a
 * lie, so nothing here grades on right/wrong: it grades on EV loss.
 *
 * The second rule matters as much as the first. GRADING AND DISPLAY MUST NEVER
 * DISAGREE. A panel that prints a confident "Fold." while scoring the user's
 * raise as a mistake worth 0.1bb is the exact thing an experienced player
 * notices, and once they decide the grader is dumb they leave. That is why
 * `displayMode` branches on frequency AND EV gap rather than frequency alone,
 * and why a defensible alternative is explicitly flagged as one.
 */

import { type Card } from "./cards";
import { type HandClass } from "./handclass";
import { type HandKey } from "./range";
import { refineEntry } from "./refine";
import {
  evOf,
  getPostflopStrategy,
  getStrategy,
  type PostflopActionName,
  type PostflopTemplate,
  type PreflopActionName,
  type PreflopNode,
} from "./solutions";

export const GRADE_NAMES = ["sharp", "best", "solid", "inaccuracy", "mistake", "blunder"] as const;
export type GradeName = (typeof GRADE_NAMES)[number];

export type DisplayMode = "clear" | "preferred" | "mixed";

/** Real user data for this node. Absent means `sharp` can never fire. */
export interface NodeStats {
  attempts: number;
  bestActionCount: number;
}

export interface AlternativeAction {
  action: string;
  freq: number;
  ev: number;
  evLoss: number;
}

export interface Grade {
  grade: GradeName;
  /** In big blinds. Always >= 0. */
  evLoss: number;
  chosenEv: number;
  bestEv: number;
  bestAction: string;
  chosenAction: string;
  /** The full mix, for the frequency bar. */
  frequencies: Record<string, number>;
  displayMode: DisplayMode;
  topAction: string;
  topFreq: number;
  /** bestEv - secondBestEv. */
  evGap: number;
  alternativeActions: AlternativeAction[];
  /**
   * True when the chosen action is a real part of a mixed strategy. The
   * feedback copy MUST say so — this is what stops grading and display
   * contradicting each other.
   */
  isBalancedAlternative: boolean;
}

// Boundaries are LOWER-INCLUSIVE, upper-exclusive, so every value lands in
// exactly one band.
const SOLID_FROM = 0.05;
const INACCURACY_FROM = 0.5;
const MISTAKE_FROM = 2;
const BLUNDER_FROM = 5;

const CLEAR_FREQ = 0.65;
/**
 * Derived from INACCURACY_FROM, never set independently.
 *
 * `clear` licenses the panel to print one word in display type. If the gap
 * needed for that were SMALLER than the gap at which a second action stops
 * grading as `solid`, the panel would say "Fold." definitively while the badge
 * called the user's call Solid — a contradiction a beginner cannot reconcile,
 * and the fastest way to make the product feel arbitrary.
 *
 * Tying them together makes that state unreachable by construction rather than
 * by two constants happening to agree.
 */
const CLEAR_GAP = INACCURACY_FROM;

const SHARP_MIN_ATTEMPTS = 30;
/**
 * RETUNE THIS AGAINST REAL DATA once there is traffic.
 *
 * The target is 1-3% of decisions earning `sharp`. The test suite's observed
 * rate (~3.4%) comes from a SIMULATED population and is a placeholder — the
 * band was written for real user behaviour, and since `sharp` cannot fire
 * below SHARP_MIN_ATTEMPTS recorded attempts, production nodeStats govern the
 * real rate regardless of what the simulation says. Do not tune this dial to
 * make the simulation land in band.
 */
const SHARP_MAX_SUCCESS_RATE = 0.35;

const BALANCED_MIN_FREQ = 0.15;

/**
 * Capsules round to a whole percent. A line that would print 0% is not in the
 * mix, even if a tiny authored frequency survived rounding.
 */
export function isPlayedFrequency(frequency: number): boolean {
  return Math.round(frequency * 100) > 0;
}

export interface GradeInput {
  actions: readonly string[];
  frequencies: Record<string, number>;
  evs: Record<string, number>;
}

/**
 * The band an EV loss falls in.
 *
 * Exported so the landing page can label the cost of a real alternative line
 * with the same thresholds the product grades against. A second table on the
 * marketing page would eventually promise a "solid" the app calls an
 * inaccuracy, which is a trust problem rather than a copy one.
 */
export function bandFor(evLoss: number): GradeName {
  if (evLoss < SOLID_FROM) return "best";
  if (evLoss < INACCURACY_FROM) return "solid";
  if (evLoss < MISTAKE_FROM) return "inaccuracy";
  if (evLoss < BLUNDER_FROM) return "mistake";
  return "blunder";
}

export function displayModeFor(topFreq: number, evGap: number): DisplayMode {
  if (topFreq < CLEAR_FREQ) return "mixed";
  return evGap >= CLEAR_GAP ? "clear" : "preferred";
}

/**
 * Grades one decision against a distribution. Deterministic: the same inputs
 * always produce the same output, with no clock, no randomness and no state.
 */
export function gradeDecision(
  input: GradeInput,
  chosenAction: string,
  nodeStats?: NodeStats,
): Grade {
  const actions = [...input.actions];
  if (!actions.includes(chosenAction)) {
    throw new RangeError(`${chosenAction} is not one of ${actions.join(", ")}`);
  }

  const freqOf = (action: string) => input.frequencies[action] ?? 0;
  const evFor = (action: string) => {
    const ev = input.evs[action];
    if (ev === undefined) throw new RangeError(`no EV recorded for ${action}`);
    return ev;
  };

  let bestAction = actions[0]!;
  let bestEv = -Infinity;
  for (const action of actions) {
    const ev = evFor(action);
    if (ev > bestEv || (ev === bestEv && freqOf(action) > freqOf(bestAction))) {
      bestAction = action;
      bestEv = ev;
    }
  }

  const sortedEvs = actions.map(evFor).sort((a, b) => b - a);
  const evGap = (sortedEvs[0] ?? 0) - (sortedEvs[1] ?? 0);

  let topAction = actions[0]!;
  for (const action of actions) if (freqOf(action) > freqOf(topAction)) topAction = action;
  const topFreq = freqOf(topAction);

  const chosenEv = evFor(chosenAction);
  const evLoss = Math.max(0, bestEv - chosenEv);
  const displayMode = displayModeFor(topFreq, evGap);

  let grade: GradeName = chosenAction === bestAction ? "best" : bandFor(evLoss);

  // A defensible part of a mixed strategy is never worse than `solid`, and the
  // UI is told to say so. Without this, a 38%-frequency action worth 0.1bb
  // would read as an error next to a panel showing it at 38%.
  const chosenFreq = freqOf(chosenAction);
  const isBalancedAlternative =
    displayMode !== "clear" &&
    chosenFreq > BALANCED_MIN_FREQ &&
    evLoss < INACCURACY_FROM &&
    chosenAction !== bestAction;
  if (isBalancedAlternative && grade !== "best") grade = "solid";

  /*
   * A MINORITY LINE IS `solid`, NEVER `best`.
   *
   * Under the indifference rule every action in a mix is worth exactly the
   * same, so `evLoss` is 0 for all of them and `bandFor(0)` returns "best".
   * That put a green "✓ Best" on a 20% fold while the panel directly above it
   * printed "Call." — the same grading-versus-display contradiction this
   * module was written to prevent, just mirrored. The `isBalancedAlternative`
   * rule above was meant to catch it and cannot: it only ever UPGRADES to
   * solid, and the grade is already "best" by the time it runs.
   *
   * It is NOT an inaccuracy, and must never be coloured as one. Folding T9o one
   * time in five is what the strategy does; marking it amber would teach that a
   * real mixed line is a mistake, which is precisely the lie the EV-loss design
   * exists to avoid. `solid` is the honest word — correct poker, but not the
   * headline answer.
   *
   * The `freqOf(topAction) > chosenFreq` guard is what keeps a genuine 50/50
   * out of this: with equal frequencies `topAction` is decided by the order of
   * `actions`, and demoting one side of a coin flip on a tie-break would be
   * arbitrary rather than true.
   */
  const isMinorityLine =
    displayMode !== "clear" && isPlayedFrequency(chosenFreq) && freqOf(topAction) > chosenFreq;
  if (isMinorityLine && grade === "best") grade = "solid";

  // The pedagogical override. Folding a hand the solution always raises is a
  // large conceptual error even when the chip cost is small, and letting it
  // score `solid` because the EV table happens to be flat would teach exactly
  // the wrong lesson.
  const isPureRaise = freqOf("raise") >= 1 || freqOf("bet_33") >= 1 || freqOf("allin") >= 1;
  if (chosenAction === "fold" && isPureRaise) {
    const order = GRADE_NAMES.indexOf(grade);
    if (order < GRADE_NAMES.indexOf("mistake")) grade = "mistake";
  }

  // Frequency is the strategy. Authored EVs are indifference-modelled, so a
  // size the chart never takes can sit 0.4bb off the peak and grade Solid —
  // then the capsules print 0% above a green badge. The mix copy already
  // omits unplayed lines; the grade has to agree.
  if (!isPlayedFrequency(chosenFreq)) {
    const floor = GRADE_NAMES.indexOf("inaccuracy");
    if (GRADE_NAMES.indexOf(grade) < floor) grade = "inaccuracy";
  }

  // `sharp` is an upgrade of `best`, not a band. It is computed from real user
  // data, so it cannot be farmed: with no nodeStats it can never fire.
  if (
    grade === "best" &&
    nodeStats !== undefined &&
    nodeStats.attempts >= SHARP_MIN_ATTEMPTS &&
    nodeStats.bestActionCount / nodeStats.attempts < SHARP_MAX_SUCCESS_RATE
  ) {
    grade = "sharp";
  }

  const alternativeActions: AlternativeAction[] = actions
    .filter((action) => action !== chosenAction)
    .map((action) => ({
      action,
      freq: freqOf(action),
      ev: evFor(action),
      evLoss: Math.max(0, bestEv - evFor(action)),
    }))
    .sort((a, b) => a.evLoss - b.evLoss);

  const frequencies: Record<string, number> = {};
  for (const action of actions) frequencies[action] = freqOf(action);

  return {
    grade,
    evLoss,
    chosenEv,
    bestEv,
    bestAction,
    chosenAction,
    frequencies,
    displayMode,
    topAction,
    topFreq,
    evGap,
    alternativeActions,
    isBalancedAlternative,
  };
}

/** The signature §2.7 specifies. */
export function grade(
  node: PreflopNode,
  handKey: HandKey,
  chosenAction: PreflopActionName,
  nodeStats?: NodeStats,
): Grade {
  const strategy = getStrategy(node, handKey);
  return gradeDecision(
    {
      actions: node.actions,
      frequencies: Object.fromEntries(node.actions.map((a) => [a, strategy[a] ?? 0])),
      evs: Object.fromEntries(node.actions.map((a) => [a, evOf(node, handKey, a)])),
    },
    chosenAction,
    nodeStats,
  );
}

/**
 * Grades a postflop decision.
 *
 * `combo` is the ACTUAL holding and board. Supplying it re-keys the decision on
 * `(template, handClass, comboFeatures)` — without it the whole postflop
 * product is 130 cells and two different aces on two different boards grade
 * identically. Every path that grades a real user decision must pass it; the
 * class-level call remains for surfaces that have no combo to speak of (the
 * range grid, the methodology counts).
 *
 * The EV column is derived from the frequencies either way — see `refineEntry`.
 */
export function gradePostflop(
  template: PostflopTemplate,
  handClass: HandClass,
  chosenAction: PostflopActionName,
  nodeStats?: NodeStats,
  combo?: { hole: readonly [Card, Card]; board: readonly Card[] },
): Grade {
  const entry = getPostflopStrategy(template, handClass);
  if (entry === undefined) {
    throw new RangeError(`${template.id} has no strategy for ${handClass}`);
  }
  const refined = refineEntry(entry, template.actions, combo);
  return gradeDecision(
    {
      actions: template.actions,
      frequencies: Object.fromEntries(template.actions.map((a) => [a, refined.strategy[a] ?? 0])),
      evs: Object.fromEntries(template.actions.map((a) => [a, refined.ev[a] ?? 0])),
    },
    chosenAction,
    nodeStats,
  );
}

// ── Accuracy ──────────────────────────────────────────────────────────────────

/**
 * chess.com's signature number, adapted. Computed from mean EV loss rather
 * than a right/wrong count, because under mixed strategies a right/wrong count
 * is meaningless.
 *
 * The 0.30 constant was checked against the three targets in §2.7 and left
 * alone — it already lands all three. See the curve printed by the tests.
 */
export const ACCURACY_DECAY = 0.3;

export function accuracy(grades: readonly { evLoss: number }[]): number {
  if (grades.length === 0) return 100;
  const meanEvLoss = grades.reduce((sum, g) => sum + g.evLoss, 0) / grades.length;
  return Math.max(0, Math.min(100, 100 * Math.exp(-ACCURACY_DECAY * meanEvLoss)));
}

export interface SessionScore {
  accuracy: number;
  totalEvLost: number;
  evLostPer100: number;
  handsPlayed: number;
  distribution: Record<GradeName, number>;
  sharpCount: number;
}

export function scoreSession(grades: readonly Grade[]): SessionScore {
  const distribution = Object.fromEntries(GRADE_NAMES.map((name) => [name, 0])) as Record<
    GradeName,
    number
  >;
  let totalEvLost = 0;
  for (const g of grades) {
    distribution[g.grade] += 1;
    totalEvLost += g.evLoss;
  }
  return {
    accuracy: accuracy(grades),
    totalEvLost,
    evLostPer100: grades.length === 0 ? 0 : (totalEvLost / grades.length) * 100,
    handsPlayed: grades.length,
    distribution,
    sharpCount: distribution.sharp,
  };
}

// ── Leak detection ────────────────────────────────────────────────────────────

export type Street = "preflop" | "flop" | "turn" | "river";

export interface Attempt {
  street: Street;
  position: string;
  actionSeq: string;
  handClass: HandClass | null;
  chosenAction: string;
  bestAction: string;
  evLoss: number;
}

export interface Leak {
  key: string;
  street: Street;
  position: string;
  actionSeq: string;
  handClass: HandClass | null;
  sampleSize: number;
  meanEvLoss: number;
  severity: 1 | 2 | 3 | 4 | 5;
}

const LEAK_MIN_SAMPLE = 10;
const LEAK_MIN_MEAN_EV_LOSS = 0.5;

const AGGRESSIVE = new Set([
  "raise",
  "allin",
  "bet_33",
  "bet_66",
  "bet_100",
  "raise_small",
  "raise_pot",
]);

function leakVerb(attempts: readonly Attempt[]): string {
  let overFold = 0;
  let overAggression = 0;
  let overCall = 0;
  for (const attempt of attempts) {
    if (attempt.chosenAction === attempt.bestAction) continue;
    if (attempt.chosenAction === "fold") overFold++;
    else if (AGGRESSIVE.has(attempt.chosenAction)) overAggression++;
    else overCall++;
  }
  if (overFold >= overAggression && overFold >= overCall) return "overfolds";
  if (overAggression >= overCall) return "overaggressive";
  return "overcalls";
}

/** `vs_rfi_BTN` → `vs_btn`, `rfi` → `rfi`, `vs_3bet_SB` → `vs_3bet_sb`. */
function actionSeqSlug(actionSeq: string): string {
  return actionSeq.replace(/^vs_rfi_/, "vs_").toLowerCase();
}

function severityFor(meanEvLoss: number): 1 | 2 | 3 | 4 | 5 {
  if (meanEvLoss < 0.75) return 1;
  if (meanEvLoss < 1.25) return 2;
  if (meanEvLoss < 2) return 3;
  if (meanEvLoss < 3.5) return 4;
  return 5;
}

/**
 * Aggregates a user's attempts and surfaces the buckets they are losing money
 * in. STREET is part of the key deliberately: "you leak on turns" is the most
 * actionable single sentence you can give a beginner, and it is what the
 * dashboard's street row shows.
 */
export function detectLeaks(attempts: readonly Attempt[]): Leak[] {
  const buckets = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const key = `${attempt.street}|${attempt.position}|${attempt.actionSeq}|${attempt.handClass ?? "-"}`;
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [attempt]);
    else bucket.push(attempt);
  }

  const leaks: Leak[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < LEAK_MIN_SAMPLE) continue;
    const meanEvLoss = bucket.reduce((sum, a) => sum + a.evLoss, 0) / bucket.length;
    if (meanEvLoss <= LEAK_MIN_MEAN_EV_LOSS) continue;

    const first = bucket[0]!;
    leaks.push({
      key: `${leakVerb(bucket)}_${first.position.toLowerCase()}_${actionSeqSlug(first.actionSeq)}`,
      street: first.street,
      position: first.position,
      actionSeq: first.actionSeq,
      handClass: first.handClass,
      sampleSize: bucket.length,
      meanEvLoss,
      severity: severityFor(meanEvLoss),
    });
  }

  return leaks.sort((a, b) => b.severity - a.severity || b.meanEvLoss - a.meanEvLoss);
}
