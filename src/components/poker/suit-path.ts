import type { Suit } from "@/poker/cards";

/**
 * Suit pips as paths rather than unicode glyphs, on a 24x24 grid.
 *
 * ♠♥♦♣ render differently on every platform and are frequently emoji-fied on
 * Android — a card that renders as a colour-emoji heart is unreadable at 24px.
 *
 * Its own module because both the card face and the court figure draw it, and
 * a second copy of a heart is a second heart to get wrong.
 */
export const SUIT_PATH: Record<Suit, string> = {
  h: "M12 21c-1-1-8-5.6-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.4-7 10-8 11Z",
  d: "M12 2 21 12 12 22 3 12 12 2Z",
  c: "M12 3a4 4 0 0 1 3.2 6.4A4 4 0 1 1 16 17a5.6 5.6 0 0 1-3-1.2V19h3v2H8v-2h3v-3.2A5.6 5.6 0 0 1 8 17a4 4 0 1 1 .8-7.6A4 4 0 0 1 12 3Z",
  s: "M12 2c1 2.4 8 6.6 8 11a4 4 0 0 1-7 2.7V19h3v2H8v-2h3v-3.3A4 4 0 0 1 4 13c0-4.4 7-8.6 8-11Z",
};

export const SUIT_NAME: Record<Suit, string> = {
  h: "hearts",
  d: "diamonds",
  c: "clubs",
  s: "spades",
};

export const SUIT_TOKEN: Record<Suit, string> = {
  h: "var(--color-suit-hearts)",
  d: "var(--color-suit-diamonds)",
  c: "var(--color-suit-clubs)",
  s: "var(--color-suit-spades)",
};
