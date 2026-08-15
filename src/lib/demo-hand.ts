import type { SkillTier } from "@/lib/explain-policy";
import type { GradeName } from "@/poker/grader";
import type { HeroPosition } from "@/poker/solutions";
import { evFromBb } from "@/lib/units";

/**
 * The one hand played before the paywall.
 *
 * The competitor asks twelve questions, shows a fake "building your trainer"
 * loader, and asks for money without ever letting anyone touch the product —
 * their hero image is a table playing ITSELF. One real hand beats that
 * outright, and it does something the copy cannot: it makes the diagnosis that
 * follows about something the user actually did, rather than about what they
 * said in a questionnaire.
 *
 * This is NOT a trial. One hand, then the wall.
 *
 * Pure and free of I/O so the selection rules are testable without a database.
 */

export interface DemoSpot {
  readonly id: string;
  readonly heroPos: HeroPosition;
  readonly actionSeq: string;
  readonly difficulty: number;
  /** Why this spot teaches something, for the shortlist to be reviewable. */
  readonly teaches: string;
}

/**
 * The shortlist, calibrated by what the user told us in Q5.
 *
 * A total beginner handed a 4-bet-pot decision learns nothing and feels stupid
 * at the exact moment we are asking for money. Someone who has used a solver
 * handed "is 87o a button open?" concludes the product is beneath them. Same
 * mechanic, different spot.
 *
 * Every entry is a node whose strategy is genuinely MIXED for instructive
 * hands — the whole point is to show the frequency capsules doing something a
 * right/wrong app cannot. `assertMixedOrPreferred` enforces that at runtime;
 * this list is only the candidate pool.
 */
const SHORTLIST: Record<SkillTier, readonly DemoSpot[]> = {
  // Never studied: facing an open is readable on a table (blinds + a raise).
  // First-in RFI looks like "broken buttons" to someone who expects Check/Call.
  never: [
    {
      id: "bb-vs-btn",
      heroPos: "BB",
      actionSeq: "vs_rfi_BTN",
      difficulty: 4,
      teaches: "defending the big blind against a button open — call, fold, or 3-bet",
    },
    {
      id: "bb-vs-co",
      heroPos: "BB",
      actionSeq: "vs_rfi_CO",
      difficulty: 4,
      teaches: "big blind vs cutoff open, still a real mix",
    },
  ],
  // Watched videos: still facing aggression, slightly tougher seats.
  videos: [
    {
      id: "sb-vs-btn-open",
      heroPos: "SB",
      actionSeq: "vs_rfi_BTN",
      difficulty: 5,
      teaches: "small blind vs button — out of position for the whole hand",
    },
    {
      id: "bb-vs-utg",
      heroPos: "BB",
      actionSeq: "vs_rfi_UTG",
      difficulty: 5,
      teaches: "big blind vs the tightest open in the game",
    },
  ],
  // Used charts: facing aggression, where charts usually run out.
  charts: [
    {
      // Was BTN:vs_3bet_BB until that node was quarantined — every vs_3bet
      // file with a blind 3bettor carried one shared strategy, so the button's
      // 48% opening range and the cutoff's 28% got the same answer. This is
      // the same lesson from a pairing the data actually describes, and it is
      // the exact hand the "Facing a 3-bet" lesson opens with.
      id: "co-vs-btn-3bet",
      heroPos: "CO",
      actionSeq: "vs_3bet_BTN",
      difficulty: 6,
      teaches: "a middle pair against a 3-bet is a genuine mix",
    },
    {
      id: "sb-vs-3bet",
      heroPos: "SB",
      actionSeq: "vs_3bet_BB",
      difficulty: 6,
      teaches: "defending the small blind against a 3-bet",
    },
  ],
  // Used a solver: give them something they will not find obvious.
  solver: [
    {
      // Was BB:vs_4bet_BTN. All eight 4bet nodes share one strategy file, so
      // the 4bettor's position changed nothing — indefensible on the largest
      // pot in the preflop tree, and quarantined until it is solved.
      id: "utg-vs-mp-3bet",
      heroPos: "UTG",
      actionSeq: "vs_3bet_MP",
      difficulty: 6,
      teaches: "the tightest opening range in the game still has to fold some of itself",
    },
    {
      id: "co-vs-3bet",
      heroPos: "CO",
      actionSeq: "vs_3bet_BB",
      difficulty: 6,
      teaches: "cutoff facing a blind 3-bet",
    },
  ],
};

/** Every spot in the shortlist, for tests that want to check them all. */
export const ALL_DEMO_SPOTS: readonly DemoSpot[] = Object.values(SHORTLIST).flat();

/** A small stable hash, so the same user always gets the same spot. */
function hashOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Which spot this user gets.
 *
 * Rotated by user id rather than at random so that the diagnosis is not
 * identical for everyone — and so a given user replaying the funnel sees the
 * same hand rather than shopping for an easier one.
 */
export function demoSpotFor(userId: string, skillTier: SkillTier): DemoSpot {
  const spot = demoSpotCandidates(userId, skillTier)[0];
  // The record is exhaustive over SkillTier and every pool is non-empty, but
  // noUncheckedIndexedAccess is right to make this explicit.
  if (spot === undefined) throw new Error(`no demo spot for tier ${skillTier}`);
  return spot;
}

/**
 * Every spot this user could be dealt, best first.
 *
 * Their tier's pool comes first, rotated by user id; the rest of the shortlist
 * follows as a fallback. A node whose data changes to all-pure must degrade to
 * a slightly-off-tier hand, never to an error screen — the alternative is what
 * shipped: "Couldn't deal a hand" as the first thing a beginner sees.
 */
export function demoSpotCandidates(userId: string, skillTier: SkillTier): readonly DemoSpot[] {
  const pool = SHORTLIST[skillTier];
  const start = hashOf(userId) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  const rest = ALL_DEMO_SPOTS.filter((s) => !rotated.some((r) => r.id === s.id));
  return [...rotated, ...rest];
}

/**
 * The seed for this user's spot. Deterministic, so a refresh deals the same
 * hand rather than rerolling for an easier one.
 */
export function demoSeedFor(userId: string, attempt = 0): string {
  return `demo:${userId}:${attempt}`;
}

/**
 * @deprecated The seed walk is gone — see `pickMixedHand`. Kept only so the
 * old signature does not silently change meaning if something still calls it.
 */
export const MAX_SEED_ATTEMPTS = 24;

/**
 * The mixed hands at a node, in a stable order.
 *
 * THIS REPLACED A SEED WALK, AND THAT WAS A REAL OUTAGE. The route used to
 * generate a spot, check whether the sampled hand happened to be mixed, and
 * retry up to 24 times. Mixed hands are 2-4% of an RFI node, so the walk found
 * one roughly half the time and returned 503 the rest — for the `never` tier,
 * every single time. Beginners are the entire audience for this screen.
 *
 * Sampling is the wrong algorithm when the caller already knows which hands
 * qualify. Enumerate, then choose.
 *
 * Sorted, because object key order is not a contract and the choice has to be
 * reproducible across processes.
 */
export function mixedHandsAt(strategy: Record<string, Record<string, number>>): readonly string[] {
  const mixed: string[] = [];
  for (const [handKey, actions] of Object.entries(strategy)) {
    const freqs = Object.values(actions);
    if (freqs.length < 2) continue;
    const top = Math.max(...freqs);
    if (top <= MAX_DEMO_TOP_FREQ) mixed.push(handKey);
  }
  return mixed.sort();
}

/** Which of the mixed hands this user gets. Deterministic in the user id. */
export function pickMixedHand(mixed: readonly string[], userId: string): string | null {
  if (mixed.length === 0) return null;
  return mixed[hashOf(`hand:${userId}`) % mixed.length] ?? null;
}

/**
 * The top action must leave a VISIBLE second bar.
 *
 * Checked on the frequency, not on `displayMode`, and that distinction is the
 * whole point. `displayModeFor` returns "preferred" for a 100%-frequency spot
 * whose EV gap happens to be small — which is right for the grader ("one action
 * is preferred, the other is not costly") and wrong here. The first version of
 * this trusted displayMode and shipped a demo reading "a solver raises it 100%
 * of the time", which is precisely the right/wrong app this screen exists to
 * disprove.
 */
export const MAX_DEMO_TOP_FREQ = 0.8;

export function isDemoWorthy(displayMode: string, topFreq: number): boolean {
  if (topFreq > MAX_DEMO_TOP_FREQ) return false;
  return displayMode === "mixed" || displayMode === "preferred";
}

/* ── the carry-forward ────────────────────────────────────────────────────── */

export interface DemoHandRecord {
  readonly nodeRef: string;
  readonly handKey: string;
  readonly heroPos: string;
  readonly chosenAction: string;
  readonly bestAction: string;
  readonly grade: string;
  readonly evLoss: number;
  readonly topFreq: number;
  readonly displayMode: string;
  readonly timeMs: number;
  readonly playedAt: string;
}

/** Hands per hour at 6-max, for "you will face this N times an hour". */
export const HANDS_PER_HOUR = 30;

/**
 * How often this exact node comes up in an hour of play.
 *
 * Derived from position frequency rather than asserted: every seat is dealt in
 * once per orbit, so a position-specific spot appears about a sixth of the
 * time, and a spot that also requires a villain action appears less often
 * still. Deliberately rounded down — a number a player can sanity-check
 * against their own session is worth more than a precise one they cannot.
 */
export function timesPerHour(actionSeq: string): number {
  const perOrbit = HANDS_PER_HOUR / 6;
  // "rfi" needs only the seat; anything facing a raise needs a villain to act.
  const requiresVillain = actionSeq !== "rfi";
  return Math.max(1, Math.floor(requiresVillain ? perOrbit / 3 : perOrbit));
}

/**
 * The opening line of the diagnosis.
 *
 * Specific, in the user's own terms, about the hand they just played. "You
 * folded AJo from the button" is evidence; "you may be too passive" is a
 * horoscope, and the difference is what the demo hand exists to create.
 *
 * bb/100 and big blinds only — never a dollar figure attached to a result.
 */
export function demoHandHeadline(record: DemoHandRecord): string {
  const verb = pastTenseOf(record.chosenAction);
  return `You ${verb} ${record.handKey} from the ${positionName(record.heroPos)}.`;
}

/**
 * "the button", not "the BTN".
 *
 * The audience is people who know the rules and nothing after them. Position
 * abbreviations are the first piece of jargon a beginner meets, and this
 * sentence is the first thing they read after paying attention for two
 * minutes — it is the wrong place to make them decode anything.
 */
const POSITION_NAMES: Record<string, string> = {
  BTN: "button",
  CO: "cutoff",
  MP: "middle position",
  UTG: "first seat",
  SB: "small blind",
  BB: "big blind",
};

export function positionName(pos: string): string {
  return POSITION_NAMES[pos] ?? pos;
}

/**
 * "once an hour", never "1 times an hour".
 *
 * `timesPerHour` rounds down and legitimately returns 1 for a spot that needs
 * both a seat and a villain action, so the singular is the COMMON case on this
 * screen rather than an edge one — and a grammatical slip in the first
 * personalised sentence the product ever shows costs more than the sentence
 * earns. Exported so the test can enumerate every count rather than trusting
 * the two that happen to be reachable today.
 */
export function frequencyPhrase(times: number): string {
  return times === 1 ? "once an hour" : `roughly ${times} times an hour`;
}

export function demoHandDetail(record: DemoHandRecord): string {
  const percent = Math.round(record.topFreq * 100);
  const bestVerb = presentTenseOf(record.bestAction);
  const howOften = frequencyPhrase(timesPerHour(nodeSeqOf(record.nodeRef)));

  if (record.evLoss <= 0) {
    return `A solver ${bestVerb} it ${percent}% of the time. You found it, and you'll face this exact spot ${howOften}.`;
  }

  return `A solver ${bestVerb} it ${percent}% of the time. That ${nounOf(record.chosenAction)} costs about ${evFromBb(record.evLoss)} every time it happens, and you'll face this exact spot ${howOften}.`;
}

function nodeSeqOf(nodeRef: string): string {
  return nodeRef.split(":")[1] ?? "rfi";
}

const PAST: Record<string, string> = {
  fold: "folded",
  call: "called",
  raise: "raised",
  check: "checked",
  bet: "bet",
  allin: "shoved",
};

const PRESENT: Record<string, string> = {
  fold: "folds",
  call: "calls",
  raise: "raises",
  check: "checks",
  bet: "bets",
  allin: "shoves",
};

export function pastTenseOf(action: string): string {
  return PAST[action] ?? action;
}

export function presentTenseOf(action: string): string {
  return PRESENT[action] ?? action;
}

/** "that fold costs", not "that folded costs". */
const NOUN: Record<string, string> = {
  fold: "fold",
  call: "call",
  raise: "raise",
  check: "check",
  bet: "bet",
  allin: "shove",
};

export function nounOf(action: string): string {
  return NOUN[action] ?? action;
}

/** The framing screen, before the hand. */
export const DEMO_INTRO = {
  heading: "Before we build your plan, one hand.",
  body: "You'll see a real table — who folded, who's still in, and what you can do. No right or wrong. I just want to see how you think.",
  cta: "Deal me in",
  skip: "Skip this",
} as const;

/**
 * The CTA under the graded demo hand, which now leads straight to the paywall.
 *
 * Two labels, not one, because the sentence a player wants to click differs
 * entirely by how the hand went. Someone who found the line is owed a forward
 * step — "here is the plan" — while someone who missed it is owed a repair,
 * and offering "see my plan" to a player who just got it wrong reads as the
 * product ignoring what it had literally just graded.
 *
 * `sharp` counts as right: it is the recognition band, awarded for finding a
 * balanced alternative, and telling that player they need fixing is the fastest
 * way to lose the one who is enjoying themselves most.
 *
 * Deliberately NOT a "well done" banner on top of the Feedback panel. That
 * panel already opens with the grade and a line of why; a second congratulation
 * directly above it is the same information twice, and on a payment funnel the
 * duplicated praise is what makes it read as a sales page rather than a grader.
 */
const RIGHT_MOVE: readonly GradeName[] = ["best", "sharp"];

export function playedItRight(grade: GradeName): boolean {
  return RIGHT_MOVE.includes(grade);
}

export function demoOutroCta(grade: GradeName): string {
  return playedItRight(grade) ? "See my plan →" : "See how to fix it →";
}

/** The funnel budget this screen is allowed to spend. */
export const MAX_ADDED_SECONDS = 45;
