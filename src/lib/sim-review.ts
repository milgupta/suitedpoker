import type { HandHistory, HandEvent, Street } from "@/poker/gamestate";
import type { Attempt, Leak } from "@/poker/grader";
import type { HandClass } from "@/poker/handclass";
import type { SimDecision } from "@/lib/sim";
import { amountFromChips, evFromBb } from "@/lib/units";

/**
 * The review's arithmetic: session stats, replay steps, and the attempts fed
 * to the leak detector. Pure over stored HandHistory objects, so every number
 * on the review screen is checkable in a unit test against hand-counted
 * values.
 *
 * The stats are computed from the EVENTS, never accumulated during play — a
 * second running tally is a second implementation that drifts, and this one
 * can be re-run over old sessions when a bug is fixed.
 */

export interface StoredHand {
  readonly history: HandHistory;
  readonly heroSeat: number;
  readonly record: {
    readonly handNumber: number;
    readonly netBb: number;
    readonly resultLine: string;
    readonly heroEvLoss: number | null;
    readonly grade: string | null;
    /** Absent on rows written before postflop grading — treated as ungraded. */
    readonly decisions?: readonly SimDecision[];
  };
}

/* ── Session stats ───────────────────────────────────────────────────────── */

export interface SessionStats {
  readonly hands: number;
  readonly netBb: number;
  readonly bb100: number;
  /** % of hands the hero put money in voluntarily preflop (blinds excluded). */
  readonly vpip: number;
  /** % of hands the hero raised preflop. */
  readonly pfr: number;
  readonly biggestPotWonBb: number;
  readonly biggestPotLostBb: number;
  /** How many hero decisions were graded, and how many of those postflop. */
  readonly gradedDecisions: number;
  readonly postflopGraded: number;
}

function heroPreflopActions(hand: StoredHand): HandEvent[] {
  return hand.history.events.filter(
    (e): e is Extract<HandEvent, { kind: "action" }> =>
      e.kind === "action" && e.seat === hand.heroSeat && e.street === "preflop",
  );
}

/** Voluntarily put money in: called, bet or raised preflop. Posts never count. */
export function isVpipHand(hand: StoredHand): boolean {
  return heroPreflopActions(hand).some(
    (e) =>
      e.kind === "action" && (e.action === "call" || e.action === "bet" || e.action === "raise"),
  );
}

export function isPfrHand(hand: StoredHand): boolean {
  return heroPreflopActions(hand).some((e) => e.kind === "action" && e.action === "raise");
}

export function computeSessionStats(hands: readonly StoredHand[]): SessionStats {
  const count = hands.length;
  const netBb = round3(hands.reduce((sum, h) => sum + h.record.netBb, 0));

  const vpipCount = hands.filter(isVpipHand).length;
  const pfrCount = hands.filter(isPfrHand).length;

  let biggestWon = 0;
  let biggestLost = 0;
  let gradedDecisions = 0;
  let postflopGraded = 0;
  for (const hand of hands) {
    if (hand.record.netBb > biggestWon) biggestWon = hand.record.netBb;
    if (hand.record.netBb < biggestLost) biggestLost = hand.record.netBb;

    const decisions = hand.record.decisions;
    if (decisions !== undefined) {
      for (const decision of decisions) {
        if (!decision.graded) continue;
        gradedDecisions += 1;
        if (decision.street !== "preflop") postflopGraded += 1;
      }
    } else if (hand.record.heroEvLoss !== null) {
      // Legacy row: the one preflop grade is all it recorded.
      gradedDecisions += 1;
    }
  }

  return {
    hands: count,
    netBb,
    bb100: count === 0 ? 0 : round1((netBb / count) * 100),
    vpip: count === 0 ? 0 : Math.round((vpipCount / count) * 100),
    pfr: count === 0 ? 0 : Math.round((pfrCount / count) * 100),
    biggestPotWonBb: round1(biggestWon),
    biggestPotLostBb: round1(Math.abs(biggestLost)),
    gradedDecisions,
    postflopGraded,
  };
}

/* ── Attempts for the leak detector ──────────────────────────────────────── */

/**
 * Which preflop situation the hero's first decision was in, from the events
 * BEFORE that decision — the same vocabulary the solution set uses, so these
 * attempts aggregate with drill attempts in detectLeaks.
 */
export function heroActionSeq(hand: StoredHand): string {
  const events = hand.history.events;
  const firstHeroIndex = events.findIndex(
    (e) => e.kind === "action" && e.seat === hand.heroSeat && e.street === "preflop",
  );
  if (firstHeroIndex === -1) return "rfi";

  const raisesBefore = events
    .slice(0, firstHeroIndex)
    .filter((e) => e.kind === "action" && e.action === "raise");

  if (raisesBefore.length === 0) return "rfi";

  const last = raisesBefore[raisesBefore.length - 1];
  const aggressorSeat = last !== undefined && "seat" in last ? last.seat : null;
  const aggressor = aggressorSeat === null ? null : (hand.history.positions[aggressorSeat] ?? null);
  if (aggressor === null) return "rfi";

  if (raisesBefore.length === 1) return `vs_rfi_${aggressor}`;
  if (raisesBefore.length === 2) return `vs_3bet_${aggressor}`;
  return `vs_4bet_${aggressor}`;
}

export interface GradedDecision {
  readonly handNumber: number;
  readonly street: Street;
  readonly evLoss: number;
  readonly grade: string;
  readonly chosenAction: string;
  /** Stored at grade time; null only on rows written before it was stored. */
  readonly bestAction: string | null;
  readonly resultLine: string;
}

/** One Attempt per hand whose first hero decision was graded during play. */
export function heroAttempts(
  hands: readonly StoredHand[],
  handClassOf?: (hand: StoredHand) => HandClass | null,
): Attempt[] {
  const attempts: Attempt[] = [];

  for (const hand of hands) {
    if (hand.record.heroEvLoss === null) continue;

    const first = hand.history.events.find(
      (e): e is Extract<HandEvent, { kind: "action" }> =>
        e.kind === "action" && e.seat === hand.heroSeat && e.street === "preflop",
    );
    if (first === undefined) continue;

    // Rows that stored their decisions carry the REAL best action; the
    // `not_<chosen>` marker survives only for rows from before it was stored,
    // where an imperfect verb beats dropping the sample.
    const storedPreflop = (hand.record.decisions ?? []).find(
      (d) => d.street === "preflop" && d.graded,
    );

    attempts.push({
      street: "preflop",
      position: hand.history.positions[hand.heroSeat] ?? "BTN",
      actionSeq: heroActionSeq(hand),
      handClass: handClassOf?.(hand) ?? null,
      chosenAction: storedPreflop?.chosen ?? (first.action === "check" ? "call" : first.action),
      bestAction:
        storedPreflop?.best ??
        (hand.record.heroEvLoss === 0 ? first.action : `not_${first.action}`),
      evLoss: hand.record.heroEvLoss,
    });
  }

  return attempts;
}

/**
 * The five worst graded decisions, worst first — preflop AND postflop where
 * the hand stored its decisions; the legacy preflop-only fields otherwise, so
 * sessions played before postflop grading still review without crashing.
 */
export function worstDecisions(hands: readonly StoredHand[], limit = 5): GradedDecision[] {
  const graded: GradedDecision[] = [];

  for (const hand of hands) {
    const decisions = hand.record.decisions;
    if (decisions !== undefined) {
      for (const decision of decisions) {
        if (!decision.graded || decision.evLoss === null || decision.evLoss <= 0) continue;
        graded.push({
          handNumber: hand.record.handNumber,
          street: decision.street,
          evLoss: decision.evLoss,
          grade: decision.grade ?? "",
          chosenAction: decision.chosen,
          bestAction: decision.best,
          resultLine: hand.record.resultLine,
        });
      }
      continue;
    }

    // Legacy row: only the first preflop decision was ever graded.
    if (hand.record.heroEvLoss === null || hand.record.heroEvLoss <= 0) continue;
    const first = hand.history.events.find(
      (e): e is Extract<HandEvent, { kind: "action" }> =>
        e.kind === "action" && e.seat === hand.heroSeat && e.street === "preflop",
    );
    graded.push({
      handNumber: hand.record.handNumber,
      street: "preflop",
      evLoss: hand.record.heroEvLoss,
      grade: hand.record.grade ?? "",
      chosenAction: first?.action ?? "",
      bestAction: null,
      resultLine: hand.record.resultLine,
    });
  }

  return graded.sort((a, b) => b.evLoss - a.evLoss).slice(0, limit);
}

/* ── Replay ──────────────────────────────────────────────────────────────── */

export interface ReplaySeat {
  readonly seat: number;
  readonly position: string;
  readonly stackChips: number;
  readonly committedChips: number;
  readonly folded: boolean;
  readonly isHero: boolean;
  /**
   * Card string like "AhKd". Hero always; a villain only FROM the step their
   * showdown event happened — the same rule the live sim's `mayReveal`
   * encodes. A hand that ended in folds had no showdown, so nothing shows.
   */
  readonly cards: string | null;
}

export interface ReplayStep {
  readonly index: number;
  readonly description: string;
  readonly street: Street;
  /** Board card string, cumulative. */
  readonly board: string;
  readonly potChips: number;
  readonly seats: readonly ReplaySeat[];
  /** Hero's EV loss, shown only on the step where the graded decision happened. */
  readonly heroEvLoss: number | null;
  /** The hero decision taken ON this step, graded or honestly not. */
  readonly decision: SimDecision | null;
}

/**
 * The whole hand as a sequence of renderable steps.
 *
 * Derived by folding over the events — the same events the engine emitted, so
 * pot and board at each step are the engine's own numbers, never a renderer's
 * re-implementation of pot arithmetic (the 3.6 lesson).
 */
export function replaySteps(hand: StoredHand): ReplayStep[] {
  const { history, heroSeat, record } = hand;
  const steps: ReplayStep[] = [];

  const stacks = history.startingStacks.map((s) => s);
  const committedTotal = history.positions.map(() => 0);
  const committedStreet = history.positions.map(() => 0);
  const folded = history.positions.map(() => false);
  // A villain's cards flip AT their showdown event and stay up. mayReveal's
  // rule, replayed: a showdown event only exists for a seat that reached it
  // unfolded, so revealing on it can never show a mucked hand.
  const revealed = history.positions.map(() => false);

  let street: Street = "preflop";
  let board = "";
  let pot = 0;
  let heroActed = false;
  let heroActionCount = 0;

  const decisionByIndex = new Map<number, SimDecision>(
    (record.decisions ?? []).map((d) => [d.heroActionIndex, d]),
  );

  const seatLabel = (seat: number): string => history.positions[seat] ?? `Seat ${seat}`;

  const snapshot = (
    description: string,
    heroEvLoss: number | null,
    decision: SimDecision | null = null,
  ): void => {
    steps.push({
      index: steps.length,
      description,
      street,
      board,
      potChips: pot,
      seats: history.positions.map((position, seat) => ({
        seat,
        position,
        stackChips: stacks[seat] ?? 0,
        committedChips: committedStreet[seat] ?? 0,
        folded: folded[seat] ?? false,
        isHero: seat === heroSeat,
        cards:
          seat === heroSeat || revealed[seat] === true ? (history.holeCards[seat] ?? null) : null,
      })),
      heroEvLoss,
      decision,
    });
  };

  snapshot("Cards dealt", null);

  for (const event of history.events) {
    switch (event.kind) {
      case "post": {
        pay(event.seat, event.amount);
        snapshot(`${seatLabel(event.seat)} posts ${event.blind} ${bb(event.amount)}`, null);
        break;
      }
      case "street": {
        street = event.street;
        board = event.board;
        for (let i = 0; i < committedStreet.length; i++) committedStreet[i] = 0;
        snapshot(streetLabel(event.street, event.board), null);
        break;
      }
      case "action": {
        const isHeroFirstPreflop =
          event.seat === heroSeat && event.street === "preflop" && !heroActed;
        if (event.seat === heroSeat && event.street === "preflop") heroActed = true;

        const decision =
          event.seat === heroSeat ? (decisionByIndex.get(heroActionCount) ?? null) : null;
        if (event.seat === heroSeat) heroActionCount += 1;

        if (event.action === "fold") {
          folded[event.seat] = true;
          snapshot(
            `${seatLabel(event.seat)} folds`,
            isHeroFirstPreflop ? record.heroEvLoss : null,
            decision,
          );
        } else if (event.action === "check") {
          snapshot(
            `${seatLabel(event.seat)} checks`,
            isHeroFirstPreflop ? record.heroEvLoss : null,
            decision,
          );
        } else {
          // `amount` is the TO-amount for this street; pay the delta.
          const already = committedStreet[event.seat] ?? 0;
          pay(event.seat, event.amount - already);
          const verb =
            event.action === "call"
              ? `calls ${bb(event.amount)}`
              : event.action === "bet"
                ? `bets ${bb(event.amount)}`
                : `raises to ${bb(event.amount)}`;
          snapshot(
            `${seatLabel(event.seat)} ${verb}`,
            isHeroFirstPreflop ? record.heroEvLoss : null,
            decision,
          );
        }
        break;
      }
      case "showdown": {
        revealed[event.seat] = true;
        snapshot(`${seatLabel(event.seat)} shows ${event.hand} (${event.category})`, null);
        break;
      }
      case "award": {
        stacks[event.seat] = (stacks[event.seat] ?? 0) + event.amount;
        pot -= event.amount;
        snapshot(`${seatLabel(event.seat)} wins ${bb(event.amount)}`, null);
        break;
      }
    }
  }

  return steps;

  function pay(seat: number, amount: number): void {
    stacks[seat] = (stacks[seat] ?? 0) - amount;
    committedStreet[seat] = (committedStreet[seat] ?? 0) + amount;
    committedTotal[seat] = (committedTotal[seat] ?? 0) + amount;
    pot += amount;
  }
}

function streetLabel(street: Street, board: string): string {
  if (street === "showdown") return "Showdown";
  return `${street.charAt(0).toUpperCase()}${street.slice(1)}: ${board}`;
}

/** Replay amounts arrive from the engine already in chips. */
function bb(chips: number): string {
  return amountFromChips(chips);
}

/* ── Plain-English leak lines ────────────────────────────────────────────── */

export function describeLeak(leak: Leak): string {
  // The grader's verbs, exactly: overfolds / overaggressive / overcalls.
  const verb = leak.key.startsWith("overfolds")
    ? "folding too much"
    : leak.key.startsWith("overaggressive")
      ? "raising too much"
      : "calling too much";

  // `leak.position` is the hero seat. For vs_rfi_*, the aggressor is the suffix —
  // saying "facing an open from the CO" when the hero IS the CO was backwards.
  const where =
    leak.actionSeq === "postflop"
      ? `after the flop, on ${leak.street}s`
      : leak.actionSeq === "rfi"
        ? `when it folds to you in the ${leak.position}`
        : leak.actionSeq.startsWith("vs_rfi_")
          ? `in the ${leak.position} facing a ${leak.actionSeq.slice("vs_rfi_".length)} open`
          : leak.actionSeq.startsWith("vs_3bet_")
            ? `in the ${leak.position} facing a ${leak.actionSeq.slice("vs_3bet_".length)} 3-bet`
            : leak.actionSeq.startsWith("vs_4bet_")
              ? `in the ${leak.position} facing a ${leak.actionSeq.slice("vs_4bet_".length)} 4-bet`
              : leak.actionSeq.startsWith("vs_3bet")
                ? `facing a 3-bet in the ${leak.position}`
                : `facing a 4-bet in the ${leak.position}`;

  return `You're ${verb} ${where} — costing about ${evFromBb(leak.meanEvLoss)} each time, over ${leak.sampleSize} samples.`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
