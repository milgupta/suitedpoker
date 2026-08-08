import type { HandHistory, HandEvent, Street } from "@/poker/gamestate";
import type { Attempt, Leak } from "@/poker/grader";
import type { HandClass } from "@/poker/handclass";

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
  for (const hand of hands) {
    if (hand.record.netBb > biggestWon) biggestWon = hand.record.netBb;
    if (hand.record.netBb < biggestLost) biggestLost = hand.record.netBb;
  }

  return {
    hands: count,
    netBb,
    bb100: count === 0 ? 0 : round1((netBb / count) * 100),
    vpip: count === 0 ? 0 : Math.round((vpipCount / count) * 100),
    pfr: count === 0 ? 0 : Math.round((pfrCount / count) * 100),
    biggestPotWonBb: round1(biggestWon),
    biggestPotLostBb: round1(Math.abs(biggestLost)),
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
  readonly evLoss: number;
  readonly grade: string;
  readonly chosenAction: string;
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

    attempts.push({
      street: "preflop",
      position: hand.history.positions[hand.heroSeat] ?? "BTN",
      actionSeq: heroActionSeq(hand),
      handClass: handClassOf?.(hand) ?? null,
      chosenAction: first.action === "check" ? "call" : first.action,
      // The grader recorded the loss; the best action is not stored per hand,
      // so the verb heuristic in detectLeaks works off chosen vs best. Absent
      // a stored best, an imperfect marker beats dropping the sample.
      bestAction: hand.record.heroEvLoss === 0 ? first.action : `not_${first.action}`,
      evLoss: hand.record.heroEvLoss,
    });
  }

  return attempts;
}

/** The five worst graded decisions, worst first. */
export function worstDecisions(hands: readonly StoredHand[], limit = 5): GradedDecision[] {
  return hands
    .filter((h) => h.record.heroEvLoss !== null && h.record.heroEvLoss > 0)
    .map((h) => {
      const first = h.history.events.find(
        (e): e is Extract<HandEvent, { kind: "action" }> =>
          e.kind === "action" && e.seat === h.heroSeat && e.street === "preflop",
      );
      return {
        handNumber: h.record.handNumber,
        evLoss: h.record.heroEvLoss ?? 0,
        grade: h.record.grade ?? "",
        chosenAction: first?.action ?? "",
        bestAction: null,
        resultLine: h.record.resultLine,
      };
    })
    .sort((a, b) => b.evLoss - a.evLoss)
    .slice(0, limit);
}

/* ── Replay ──────────────────────────────────────────────────────────────── */

export interface ReplaySeat {
  readonly seat: number;
  readonly position: string;
  readonly stackChips: number;
  readonly committedChips: number;
  readonly folded: boolean;
  /** Card string like "AhKd"; hero always, villains only if history has them. */
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

  let street: Street = "preflop";
  let board = "";
  let pot = 0;
  let heroActed = false;

  const seatLabel = (seat: number): string => history.positions[seat] ?? `Seat ${seat}`;

  const snapshot = (description: string, heroEvLoss: number | null): void => {
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
        cards: seat === heroSeat ? (history.holeCards[seat] ?? null) : null,
      })),
      heroEvLoss,
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

        if (event.action === "fold") {
          folded[event.seat] = true;
          snapshot(`${seatLabel(event.seat)} folds`, isHeroFirstPreflop ? record.heroEvLoss : null);
        } else if (event.action === "check") {
          snapshot(
            `${seatLabel(event.seat)} checks`,
            isHeroFirstPreflop ? record.heroEvLoss : null,
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
          );
        }
        break;
      }
      case "showdown": {
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

function bb(chips: number): string {
  return `${chips / 2}bb`;
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
    leak.actionSeq === "rfi"
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

  return `You're ${verb} ${where} — costing about ${leak.meanEvLoss.toFixed(1)}bb each time, over ${leak.sampleSize} samples.`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
