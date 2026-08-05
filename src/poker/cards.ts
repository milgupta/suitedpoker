/**
 * Card primitives, seeded RNG, and deck.
 *
 * A card is a packed integer `rank << 2 | suit` in 0..51. The evaluator runs
 * millions of times in the bot simulator, so cards must be comparable, sortable
 * and bit-maskable without touching an object header.
 *
 * The RNG is seeded and explicit because every drill has to be reproducible
 * from its seed alone — a spot the user reports as broken must be recoverable
 * months later from a single integer.
 */

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export type Rank = (typeof RANKS)[number];

export const SUITS = ["c", "d", "h", "s"] as const;
export type Suit = (typeof SUITS)[number];

/** Packed 0..51. Branded so a raw number cannot be passed where a card belongs. */
export type Card = number & { readonly __brand: "Card" };

export const RANK_COUNT = 13;
export const SUIT_COUNT = 4;
export const DECK_SIZE = 52;

const RANK_INDEX = new Map<string, number>(RANKS.map((r, i) => [r, i]));
const SUIT_INDEX = new Map<string, number>(SUITS.map((s, i) => [s, i]));

export function rankChar(rankIndex: number): Rank {
  const r = RANKS[rankIndex];
  if (r === undefined) throw new RangeError(`rank index out of range: ${rankIndex}`);
  return r;
}

export function suitChar(suitIndex: number): Suit {
  const s = SUITS[suitIndex];
  if (s === undefined) throw new RangeError(`suit index out of range: ${suitIndex}`);
  return s;
}

export function makeCard(rankIndex: number, suitIndex: number): Card {
  if (!Number.isInteger(rankIndex) || rankIndex < 0 || rankIndex >= RANK_COUNT) {
    throw new RangeError(`rank index out of range: ${rankIndex}`);
  }
  if (!Number.isInteger(suitIndex) || suitIndex < 0 || suitIndex >= SUIT_COUNT) {
    throw new RangeError(`suit index out of range: ${suitIndex}`);
  }
  return ((rankIndex << 2) | suitIndex) as Card;
}

export function rankOf(card: Card): number {
  return card >> 2;
}

export function suitOf(card: Card): number {
  return card & 3;
}

export function rankCharOf(card: Card): Rank {
  return rankChar(card >> 2);
}

export function suitCharOf(card: Card): Suit {
  return suitChar(card & 3);
}

export function isCard(value: number): value is Card {
  return Number.isInteger(value) && value >= 0 && value < DECK_SIZE;
}

/** Parses `Ah`, `ah`, `AH`. Returns undefined rather than throwing. */
export function tryCardFromString(text: string): Card | undefined {
  if (text.length !== 2) return undefined;
  const rankIndex = RANK_INDEX.get(text[0]!.toUpperCase());
  const suitIndex = SUIT_INDEX.get(text[1]!.toLowerCase());
  if (rankIndex === undefined || suitIndex === undefined) return undefined;
  return ((rankIndex << 2) | suitIndex) as Card;
}

export function cardFromString(text: string): Card {
  const card = tryCardFromString(text);
  if (card === undefined) throw new SyntaxError(`not a card: ${JSON.stringify(text)}`);
  return card;
}

export function cardToString(card: Card): string {
  return `${rankCharOf(card)}${suitCharOf(card)}`;
}

/**
 * Parses `AhKd`, `Ah Kd 7c`, `Ah,Kd`. Rejects duplicates, because every caller
 * that assembles a board or a hand from a string is one typo away from dealing
 * the same card twice and silently corrupting an equity number.
 */
export function cardsFromString(text: string): Card[] {
  const compact = text.replace(/[\s,]+/g, "");
  if (compact.length === 0) return [];
  if (compact.length % 2 !== 0) {
    throw new SyntaxError(`card string has an odd length: ${JSON.stringify(text)}`);
  }
  const cards: Card[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < compact.length; i += 2) {
    const card = cardFromString(compact.slice(i, i + 2));
    if (seen.has(card)) {
      throw new SyntaxError(`duplicate card ${cardToString(card)} in ${JSON.stringify(text)}`);
    }
    seen.add(card);
    cards.push(card);
  }
  return cards;
}

export function cardsToString(cards: readonly Card[]): string {
  return cards.map(cardToString).join(" ");
}

/** Descending by rank, then by suit, so any two equal hands format identically. */
export function sortCardsDescending(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => b - a);
}

export const FULL_DECK: readonly Card[] = Object.freeze(
  Array.from({ length: DECK_SIZE }, (_, i) => i as Card),
);

// ── Seeded RNG ────────────────────────────────────────────────────────────────

/** Returns a float in [0, 1). */
export type Rng = () => number;

function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seedToInt(seed: number | string): number {
  if (typeof seed === "string") return hashString(seed);
  if (!Number.isFinite(seed)) throw new RangeError(`seed must be finite: ${seed}`);
  return seed >>> 0;
}

/**
 * mulberry32. Chosen over Math.random for reproducibility and over a heavier
 * generator because 2^32 states is ample for dealing cards and the whole thing
 * is four operations.
 */
export function createRng(seed: number | string): Rng {
  let state = seedToInt(seed);
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, bound). */
export function randomInt(rng: Rng, bound: number): number {
  if (bound <= 0) throw new RangeError(`bound must be positive: ${bound}`);
  return Math.floor(rng() * bound) % bound;
}

export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const a = items[i]!;
    const b = items[j]!;
    items[i] = b;
    items[j] = a;
  }
  return items;
}

// ── Deck ──────────────────────────────────────────────────────────────────────

export class Deck {
  private cards: Card[];
  private dealt = 0;

  constructor(seed?: number | string) {
    this.cards = [...FULL_DECK];
    if (seed !== undefined) this.shuffle(seed);
  }

  /** Undealt cards, in deal order. */
  get remaining(): number {
    return this.cards.length - this.dealt;
  }

  get dealtCount(): number {
    return this.dealt;
  }

  /** Full 52, undealt, in canonical order. */
  reset(): this {
    this.cards = [...FULL_DECK];
    this.dealt = 0;
    return this;
  }

  /** Shuffles the undealt remainder. Already-dealt and removed cards stay gone. */
  shuffle(seed: number | string): this {
    const rest = this.cards.slice(this.dealt);
    shuffleInPlace(rest, createRng(seed));
    this.cards = [...this.cards.slice(0, this.dealt), ...rest];
    return this;
  }

  /** Takes the named cards out of the undealt remainder. Unknown cards are ignored. */
  removeCards(cards: Iterable<Card>): this {
    const dead = new Set<number>(cards);
    if (dead.size === 0) return this;
    const rest = this.cards.slice(this.dealt).filter((c) => !dead.has(c));
    this.cards = [...this.cards.slice(0, this.dealt), ...rest];
    return this;
  }

  deal(n: number): Card[] {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`cannot deal ${n} cards`);
    if (n > this.remaining) {
      throw new RangeError(`cannot deal ${n} cards, only ${this.remaining} remain`);
    }
    const out = this.cards.slice(this.dealt, this.dealt + n);
    this.dealt += n;
    return out;
  }

  dealOne(): Card {
    const [card] = this.deal(1);
    if (card === undefined) throw new RangeError("deck is empty");
    return card;
  }

  /** Undealt cards without consuming them. */
  peek(n = this.remaining): readonly Card[] {
    return this.cards.slice(this.dealt, this.dealt + n);
  }

  toString(): string {
    return cardsToString(this.peek());
  }
}
