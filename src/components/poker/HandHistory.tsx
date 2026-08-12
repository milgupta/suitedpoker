"use client";

import { cardsFromString, rankCharOf, suitCharOf, type Card, type Suit } from "@/poker/cards";
import type { HandHistory as HandHistoryData, Street } from "@/poker/gamestate";
import { cn } from "@/lib/utils";

export interface HandHistoryProps {
  hand: HandHistoryData;
  /** Seat the reader is playing. Its actions render in primary text. */
  heroSeat: number;
  /** Trails off with "Hero…" instead of showing this street's hero action. */
  trailOff?: boolean;
  className?: string;
}

const SUIT_TOKEN: Record<Suit, string> = {
  h: "var(--color-suit-hearts)",
  d: "var(--color-suit-diamonds)",
  c: "var(--color-suit-clubs)",
  s: "var(--color-suit-spades)",
};

const SUIT_GLYPH: Record<Suit, string> = { h: "♥", d: "♦", c: "♣", s: "♠" };

const STREET_LABEL: Record<Street, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
};

/** Board cards inline, in the same deck the table uses. */
function BoardCards({ cards }: { cards: readonly Card[] }) {
  return (
    <span className="ml-3 inline-flex gap-1.5 font-mono">
      {cards.map((card, i) => (
        <span key={i} style={{ color: SUIT_TOKEN[suitCharOf(card)] }}>
          {rankCharOf(card)}
          {SUIT_GLYPH[suitCharOf(card)]}
        </span>
      ))}
    </span>
  );
}

interface Line {
  street: Street;
  text: string;
  isHero: boolean;
}

/**
 * Turns the serialized history into lines.
 *
 * Reads ONLY from the 2.3 serializer's output — never from hand-written
 * strings. That is what keeps the text and the game state from drifting: a
 * mutation to the state has to change what is rendered, and there is a test
 * that mutates one and asserts exactly that.
 */
export function historyLines(hand: HandHistoryData, heroSeat: number): Line[] {
  const lines: Line[] = [];
  const bb = hand.bigBlind;
  const name = (seat: number): string =>
    seat === heroSeat ? "Hero" : (hand.positions[seat] ?? `Seat ${seat}`);

  for (const event of hand.events) {
    if (event.kind !== "action") continue;

    const who = name(event.seat);
    const amountBb = (event.amount / bb).toFixed(event.amount % bb === 0 ? 0 : 1);

    const text =
      event.action === "fold"
        ? `${who} folds.`
        : event.action === "check"
          ? `${who} checks.`
          : event.action === "call"
            ? `${who} calls ${amountBb}bb.`
            : event.action === "bet"
              ? `${who} bets ${amountBb}bb.`
              : `${who} raises to ${amountBb}bb.`;

    lines.push({ street: event.street, text, isHero: event.seat === heroSeat });
  }

  return lines;
}

/**
 * Pot at the start of each street.
 *
 * An action's `amount` is the TO-amount — the total that seat has in for the
 * street — not the increment. Summing posts and actions naively double-counts
 * the small blind's post when they call, overstating every preflop pot by half
 * a blind. So this tracks per-seat commitment and adds only the delta.
 */
export function potByStreet(hand: HandHistoryData): Record<Street, number> {
  const bb = hand.bigBlind;
  const pots: Record<Street, number> = {
    preflop: 0,
    flop: 0,
    turn: 0,
    river: 0,
    showdown: 0,
  };

  let running = 0;
  let committed = new Map<number, number>();

  for (const event of hand.events) {
    if (event.kind === "post") {
      running += event.amount;
      committed.set(event.seat, (committed.get(event.seat) ?? 0) + event.amount);
    } else if (event.kind === "action") {
      const already = committed.get(event.seat) ?? 0;
      const delta = Math.max(0, event.amount - already);
      running += delta;
      committed.set(event.seat, already + delta);
    } else if (event.kind === "street") {
      pots[event.street] = running / bb;
      // Commitments reset each street; the chips are already in the pot.
      committed = new Map();
    }
  }

  pots.showdown = running / bb;
  return pots;
}

/**
 * A whole hand as text.
 *
 * Denser than the graphical table and it fits four streets on a phone, which the
 * table cannot. Leading is tightened rather than the font shrunk — a 10px hand
 * history is unreadable, a tight 13px one is not.
 */
export function HandHistory({ hand, heroSeat, trailOff = false, className }: HandHistoryProps) {
  const lines = historyLines(hand, heroSeat);
  const pots = potByStreet(hand);
  const board = cardsFromString(hand.board);

  const streets: Street[] = ["flop", "turn", "river"];
  const boardFor = (street: Street): Card[] =>
    street === "flop"
      ? board.slice(0, 3)
      : street === "turn"
        ? board.slice(3, 4)
        : board.slice(4, 5);

  const preflop = lines.filter((l) => l.street === "preflop");
  const heroPosition = hand.positions[heroSeat] ?? "Hero";

  return (
    <article
      className={cn("text-body-sm flex flex-col gap-3 leading-[1.35]", className)}
      aria-label="Hand history"
    >
      <p className="text-text-tertiary font-mono tabular-nums">
        {(hand.smallBlind / hand.bigBlind).toFixed(1)} / 1.0 bb ·{" "}
        {(Math.max(...hand.startingStacks) / hand.bigBlind).toFixed(0)}bb effective
      </p>

      <div>
        <p className="text-text-primary">Hero is in the {heroPosition}.</p>
        {preflop.map((line, i) => (
          <p key={i} className={line.isHero ? "text-text-primary" : "text-text-secondary"}>
            {line.text}
          </p>
        ))}
      </div>

      {streets.map((street) => {
        const streetLines = lines.filter((l) => l.street === street);
        const cards = boardFor(street);
        if (cards.length === 0) return null;

        return (
          <div key={street}>
            <p className="text-text-tertiary font-mono tabular-nums">
              {STREET_LABEL[street]} ({pots[street].toFixed(1)}bb)
              <BoardCards cards={cards} />
            </p>
            {streetLines.map((line, i) => (
              <p key={i} className={line.isHero ? "text-text-primary" : "text-text-secondary"}>
                {line.text}
              </p>
            ))}
          </div>
        );
      })}

      {trailOff && <p className="text-text-primary">Hero…</p>}
    </article>
  );
}
