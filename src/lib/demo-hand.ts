import type { SkillTier } from "@/lib/explain-policy";
import type { HeroPosition } from "@/poker/solutions";

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
  // Never studied: open-or-fold, the simplest real decision in poker.
  never: [
    {
      id: "btn-rfi",
      heroPos: "BTN",
      actionSeq: "rfi",
      difficulty: 4,
      teaches: "the button opens far wider than instinct says",
    },
    {
      id: "co-rfi",
      heroPos: "CO",
      actionSeq: "rfi",
      difficulty: 4,
      teaches: "cutoff is wide too, but not button-wide",
    },
  ],
  // Watched videos: the first spot where position stops being the whole answer.
  videos: [
    {
      id: "sb-rfi",
      heroPos: "SB",
      actionSeq: "rfi",
      difficulty: 5,
      teaches: "the small blind is out of position for the whole hand",
    },
    {
      id: "mp-rfi",
      heroPos: "MP",
      actionSeq: "rfi",
      difficulty: 5,
      teaches: "middle position with players still to act",
    },
  ],
  // Used charts: facing aggression, where charts usually run out.
  charts: [
    {
      id: "btn-vs-3bet",
      heroPos: "BTN",
      actionSeq: "vs_3bet_BB",
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
      id: "bb-vs-4bet",
      heroPos: "BB",
      actionSeq: "vs_4bet_BTN",
      difficulty: 6,
      teaches: "stacking off or folding in a 4-bet pot",
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
  const pool = SHORTLIST[skillTier];
  const spot = pool[hashOf(userId) % pool.length];
  // The record is exhaustive over SkillTier and every pool is non-empty, but
  // noUncheckedIndexedAccess is right to make this explicit.
  if (spot === undefined) throw new Error(`no demo spot for tier ${skillTier}`);
  return spot;
}

/**
 * The seed for attempt `attempt` at this user's spot.
 *
 * Deterministic in the user id, so a refresh deals the same hand — but walkable,
 * because the node's sampler may land on a hand whose strategy is pure, and a
 * pure spot is exactly the demo that does not work.
 */
export function demoSeedFor(userId: string, attempt: number): string {
  return `demo:${userId}:${attempt}`;
}

/** How many seeds to try before giving up on finding a mixed hand. */
export const MAX_SEED_ATTEMPTS = 24;

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

export function demoHandDetail(record: DemoHandRecord): string {
  const percent = Math.round(record.topFreq * 100);
  const bestVerb = presentTenseOf(record.bestAction);
  const times = timesPerHour(nodeSeqOf(record.nodeRef));

  if (record.evLoss <= 0) {
    return `A solver ${bestVerb} it ${percent}% of the time — you found it, and you'll face this exact spot roughly ${times} times an hour.`;
  }

  return `A solver ${bestVerb} it ${percent}% of the time — that ${nounOf(record.chosenAction)} costs about ${record.evLoss.toFixed(1)}bb every time it happens, and you'll face this exact spot roughly ${times} times an hour.`;
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
  heading: "Before we build your plan — one hand.",
  body: "No right or wrong. I just want to see how you think.",
  cta: "Deal me in",
} as const;

/** The single way out, after the hand. */
export const DEMO_OUTRO_CTA = "See what this says about your game";

/** The funnel budget this screen is allowed to spend. */
export const MAX_ADDED_SECONDS = 45;
