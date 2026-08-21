import { cardsFromString, type Card } from "@/poker/cards";
import { committedBbOf, seatActivity, PREFLOP_ORDER } from "@/poker/seat-activity";
import type { SeatView } from "@/poker/generator";
import type { HeroPosition } from "@/poker/solutions";
import type { DrillSpotView } from "@/components/poker/DrillSurface";
import { capsuleSegments, type CapsuleSegment } from "@/lib/action-grid";

/**
 * The scripted example hand: the last step of the /start quiz, played before
 * an account exists.
 *
 * This is NOT the demo hand (7.2b). That one deals a real spot through the
 * real drill API and grades it server-side, which requires a user. This one is
 * a fixed, authored hand whose whole job is to be OBVIOUS — ace-king suited on
 * the button, folded to you — so an anonymous visitor can feel the product
 * grade them once before being asked for an email.
 *
 * Authored, not dealt, and that is deliberate:
 *   - No server call, so nothing here needs auth, rate limiting or an abuse
 *     surface. There is nothing to farm — the answer is printed below.
 *   - The verdict copy is written by hand against a spot fixed at build time,
 *     so the screen can never contradict itself the way a scripted surface
 *     over dealt data can (the forceFacingChips lesson).
 *   - It leaks no solution data: the copy states what every beginner chart on
 *     the internet states about ace-king. There are no frequencies and no EVs.
 *
 * The seat map is built with the same pure helpers the real generator uses,
 * so the table renders exactly as a real BTN open-raise spot does.
 */

const HERO_POS: HeroPosition = "BTN";
const EFF_STACK_BB = 100;

/** The real generator's phrase for an unopened pot; the surface rewrites it. */
const ACTION_HISTORY: readonly string[] = ["folded to hero"];

function exampleSeats(): SeatView[] {
  const activity = seatActivity(HERO_POS, ACTION_HISTORY);
  return PREFLOP_ORDER.map((position, seat) => {
    const state = activity[position]!;
    return {
      seat,
      position,
      stackBb: EFF_STACK_BB,
      isHero: position === HERO_POS,
      folded: state.folded,
      toAct: state.toAct,
      action: state.action,
      committedBb: committedBbOf(position, state, 0),
    };
  });
}

const HERO_CARDS: readonly Card[] = cardsFromString("As Ks");

export const EXAMPLE_SPOT: DrillSpotView = {
  seats: exampleSeats(),
  heroPos: HERO_POS,
  heroCards: HERO_CARDS,
  board: [],
  // The blinds and nothing else: 0.5 + 1.
  potBb: 1.5,
  effStackBb: EFF_STACK_BB,
  actionHistory: ACTION_HISTORY,
  legalActions: ["fold", "call", "raise"],
};

export const EXAMPLE_CORRECT_ACTION = "raise";

/**
 * The chart's frequencies for A♠K♠ at this node, shown as capsules over the
 * buttons after answering — the same reveal the real drill does.
 *
 * HAND-WRITTEN HERE, PINNED TO THE DATA BY TEST. This screen is scripted, so
 * these numbers cannot be looked up at runtime without shipping strategy data
 * to an unauthenticated client. `tests/unit/example-hand.test.ts` asserts they
 * equal `BTN.rfi.json`'s strategy for AKs, so a future repair of that node
 * fails the build here instead of letting the demo contradict the product.
 */
export const EXAMPLE_FREQUENCIES: Readonly<Record<string, number>> = {
  fold: 0,
  call: 0,
  raise: 1,
};

export const EXAMPLE_SEGMENTS: readonly CapsuleSegment[] = capsuleSegments(
  EXAMPLE_SPOT.legalActions,
  { frequencies: EXAMPLE_FREQUENCIES, alternativeActions: [] },
);

// The situation line on the table already states the spot ("Everyone folded
// to you in the button…"), so this must not restate it — three copies of the
// same sentence reads as filler on the one screen that has to feel effortless.
export const EXAMPLE_INTRO = {
  heading: "Try one hand.",
  sub: "One decision, graded instantly. Tap what you'd do.",
};

export interface ExampleVerdict {
  /** True when they picked the raise. Drives the panel's colour. */
  readonly correct: boolean;
  readonly title: string;
  readonly body: string;
}

/**
 * Preset verdicts, one per button. Plain English, no jargon the quiz has not
 * already used, and no results language — this copy sits one screen before
 * the account form and two before checkout.
 */
export function exampleVerdict(action: string): ExampleVerdict {
  if (action === EXAMPLE_CORRECT_ACTION) {
    return {
      correct: true,
      title: "Raise. Exactly right.",
      body: "Ace-king suited is one of the strongest hands you can be dealt. With everyone folded, raising puts you in control of the pot with the best hand at the table.",
    };
  }
  if (action === "call") {
    return {
      correct: false,
      title: "The play is a raise.",
      // Speaks to the reason people tap Call: the disguise myth. Slow-playing
      // to hide a monster is the most common wrong instinct in this spot, and
      // naming it here is the first thing the product teaches.
      body: "Trying to hide your strength by just calling wins you a tiny pot with a monster hand. Real disguise comes from raising your weak hands and your strong ones the same way — which is exactly what the charts teach.",
    };
  }
  return {
    correct: false,
    title: "The play is a raise.",
    body: "Ace-king suited is one of the strongest hands you can be dealt — folding it gives up the best spot at the table. Raise and take control of the pot.",
  };
}

/** The bridge line under the verdict, and the CTA into the account screen. */
export const EXAMPLE_OUTRO = {
  // "100–0" must stay true to EXAMPLE_FREQUENCIES above — the capsules print
  // those numbers directly over the buttons this sentence refers to.
  bridge: "This one is 100–0. Most spots are a mix — the trainer teaches you which is which.",
  cta: "Continue",
};
