/**
 * The hero's current made hand, in beginner vocabulary.
 *
 * The evaluator speaks in packed integers and category identifiers; the hero
 * dock speaks to somebody who may be reading "Two pair" for the first time.
 * This module is the translation, and it is PURE — the surface components
 * render whatever it returns, so the label and the ghosted best-five can be
 * asserted in a node test rather than eyeballed in a screenshot.
 *
 * Computed only from what the hero can see: their own two cards and the board.
 */

import { sortCardsDescending, type Card } from "./cards";
import { bestFive, describeHand, evaluateHand, type HandCategory } from "./evaluator";

export interface HandStrength {
  label: string;
  /**
   * The cards that make the label, best first. With five or more cards dealt
   * this is a full five (the flush's five, the two pair plus its kicker);
   * before the flop it is only the cards the label is actually about — the
   * pocket pair, or the single high card.
   */
  bestFive: Card[];
}

/** Beginner vocabulary, not the evaluator's identifiers. */
const CATEGORY_LABEL: Record<HandCategory, string> = {
  high_card: "High card",
  pair: "Pair",
  two_pair: "Two pair",
  trips: "Three of a kind",
  straight: "Straight",
  flush: "Flush",
  full_house: "Full house",
  quads: "Four of a kind",
  straight_flush: "Straight flush",
};

/**
 * Groups by rank, count descending then rank descending — the same comparison
 * order the evaluator packs, so the strongest group is always first.
 */
function rankGroups(cards: readonly Card[]): Array<{ rank: number; cards: Card[] }> {
  const byRank = new Map<number, Card[]>();
  for (const card of sortCardsDescending(cards)) {
    const rank = card >> 2;
    const group = byRank.get(rank);
    if (group === undefined) byRank.set(rank, [card]);
    else group.push(card);
  }
  return [...byRank.entries()]
    .map(([rank, group]) => ({ rank, cards: group }))
    .sort((a, b) => b.cards.length - a.cards.length || b.rank - a.rank);
}

/**
 * Fewer than five cards: straights and flushes cannot exist yet, so the only
 * question is how the ranks pair up. Written here rather than bent out of the
 * evaluator, which correctly refuses anything under five cards.
 */
function partialStrength(cards: readonly Card[]): HandStrength {
  const groups = rankGroups(cards);
  const top = groups[0];
  if (top === undefined) throw new RangeError("handStrength needs at least the hero's two cards");

  switch (top.cards.length) {
    case 4:
      return { label: CATEGORY_LABEL.quads, bestFive: top.cards };
    case 3:
      return { label: CATEGORY_LABEL.trips, bestFive: top.cards };
    case 2: {
      const second = groups[1];
      if (second !== undefined && second.cards.length === 2) {
        return { label: CATEGORY_LABEL.two_pair, bestFive: [...top.cards, ...second.cards] };
      }
      return { label: CATEGORY_LABEL.pair, bestFive: top.cards };
    }
    default: {
      const high = top.cards[0];
      return { label: CATEGORY_LABEL.high_card, bestFive: high === undefined ? [] : [high] };
    }
  }
}

/**
 * `hole` is the hero's two cards; `board` is 0–5 community cards. With five or
 * more total the evaluator is the single source of truth; below five the
 * partial path reads what exists.
 */
export function handStrength(hole: readonly Card[], board: readonly Card[]): HandStrength {
  if (hole.length !== 2) {
    throw new RangeError(`handStrength needs exactly 2 hole cards, got ${hole.length}`);
  }
  if (board.length > 5) {
    throw new RangeError(`handStrength needs 0-5 board cards, got ${board.length}`);
  }

  const all = [...hole, ...board];
  if (all.length < 5) return partialStrength(all);

  const value = evaluateHand(all);
  const { category, ranks } = describeHand(value);
  const five = sortCardsDescending(all.length === 5 ? all : bestFive(all));

  // An ace-high straight flush has its own name, and it is the one label a
  // beginner is guaranteed to know. `ranks[0]` for a straight flush is the
  // straight's high card, so the wheel (5-high) can never trip this.
  const label =
    category === "straight_flush" && ranks[0] === "A" ? "Royal flush" : CATEGORY_LABEL[category];

  return { label, bestFive: five };
}

export { CATEGORY_LABEL as HAND_STRENGTH_LABELS };
