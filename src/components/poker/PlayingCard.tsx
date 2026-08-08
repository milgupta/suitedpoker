"use client";

import { motion, useReducedMotion } from "motion/react";
import { rankCharOf, suitCharOf, type Card, type Suit } from "@/poker/cards";
import { SPRING, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type CardSize = "sm" | "md" | "lg" | "xl";

/**
 * Width in px per size. Height follows the standard 1:1.4 card ratio.
 *
 * These roughly doubled. The old lg was 52px — smaller than a postage stamp,
 * on the one object in the entire product the player is being asked to read
 * and make a decision about. Everything else on the drill screen was fighting
 * the hand for attention and winning.
 *
 * `xl` is the hero's own two cards. `lg` is the board. `md` is a card shown
 * inside prose or a choice tile. `sm` is a villain's mini-cards on the ring,
 * where the card is a marker rather than something to read.
 */
const WIDTH: Record<CardSize, number> = { sm: 26, md: 52, lg: 72, xl: 96 };

const SUIT_TOKEN: Record<Suit, string> = {
  h: "var(--color-suit-hearts)",
  d: "var(--color-suit-diamonds)",
  c: "var(--color-suit-clubs)",
  s: "var(--color-suit-spades)",
};

const SUIT_NAME: Record<Suit, string> = {
  h: "hearts",
  d: "diamonds",
  c: "clubs",
  s: "spades",
};

/**
 * Suit pips as paths rather than unicode glyphs.
 *
 * ♠♥♦♣ render differently on every platform and are frequently emoji-fied on
 * Android — a card that renders as a colour-emoji heart is unreadable at 24px.
 * Drawn on a 24x24 grid.
 */
const SUIT_PATH: Record<Suit, string> = {
  h: "M12 21c-1-1-8-5.6-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.4-7 10-8 11Z",
  d: "M12 2 21 12 12 22 3 12 12 2Z",
  c: "M12 3a4 4 0 0 1 3.2 6.4A4 4 0 1 1 16 17a5.6 5.6 0 0 1-3-1.2V19h3v2H8v-2h3v-3.2A5.6 5.6 0 0 1 8 17a4 4 0 1 1 .8-7.6A4 4 0 0 1 12 3Z",
  s: "M12 2c1 2.4 8 6.6 8 11a4 4 0 0 1-7 2.7V19h3v2H8v-2h3v-3.3A4 4 0 0 1 4 13c0-4.4 7-8.6 8-11Z",
};

/** Below this the corner index is smaller than 10px type and stops being read. */
const INDEXED_FROM = 56;

export interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  size?: CardSize;
  /** Position in a deal sequence, for the stagger. */
  index?: number;
  /** Total cards being dealt together, so the stagger stays inside its budget. */
  dealCount?: number;
  /** Renders an empty slot: keeps the space so a runout never shifts layout. */
  placeholder?: boolean;
  className?: string;
}

function Pip({ suit, colour, size }: { suit: Suit; colour: string; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="block">
      <path d={SUIT_PATH[suit]} fill={colour} />
    </svg>
  );
}

/**
 * The face: corner index top-left, one large pip in the middle.
 *
 * That arrangement is doing real work rather than decoration — it is how every
 * card the audience has ever held is laid out, so the hand is recognised
 * instead of decoded. Below `INDEXED_FROM` there is no room for it and the card
 * falls back to one big rank over one big pip, which stays legible.
 *
 * ONE index, not the mirrored pair a physical card has. The first version had
 * both, and the rotated 9 in the bottom corner reads as a 6 — on a real card
 * that never bites because you hold it and only ever see one corner, but on
 * screen both are visible at once. A beginner misreading their own hand is the
 * worst failure this component has, and the second index bought nothing but
 * authenticity.
 */
function Face({ card, width }: { card: Card; width: number }) {
  const rank = rankCharOf(card);
  const suit = suitCharOf(card);
  const colour = SUIT_TOKEN[suit];

  const background = `linear-gradient(160deg, var(--color-card-face) 0%, var(--color-card-face) 55%, var(--color-card-face-edge) 100%)`;

  if (width < INDEXED_FROM) {
    return (
      <span
        className="flex h-full w-full flex-col items-center justify-center"
        style={{ background }}
      >
        <span
          className="font-mono leading-none font-bold tabular-nums"
          style={{ color: colour, fontSize: width * 0.5 }}
        >
          {rank}
        </span>
        <Pip suit={suit} colour={colour} size={width * 0.34} />
      </span>
    );
  }

  const cornerIndex = (
    <span className="flex flex-col items-center" style={{ gap: width * 0.015 }}>
      <span
        className="font-mono leading-none font-bold tabular-nums"
        style={{ color: colour, fontSize: width * 0.29 }}
      >
        {rank}
      </span>
      <Pip suit={suit} colour={colour} size={width * 0.17} />
    </span>
  );

  return (
    <span className="relative block h-full w-full" style={{ background }}>
      <span className="absolute" style={{ top: width * 0.07, left: width * 0.09 }}>
        {cornerIndex}
      </span>
      {/* Nudged down and right of true centre so it sits in the space the index
          leaves rather than crowding it. */}
      <span
        className="absolute inset-0 flex items-center justify-center"
        style={{ paddingTop: width * 0.16, paddingLeft: width * 0.12 }}
      >
        <Pip suit={suit} colour={colour} size={width * 0.44} />
      </span>
    </span>
  );
}

function Back({ width }: { width: number }) {
  // A geometric lattice rather than a solid fill — at 26px a solid block is
  // indistinguishable from a gap in the layout.
  const id = `cardback-${width}`;
  return (
    <span className="block h-full w-full" style={{ background: "var(--color-card-back)" }}>
      <svg width="100%" height="100%" aria-hidden="true">
        <defs>
          <pattern
            id={id}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="transparent" />
            <path d="M0 3h6" stroke="var(--color-card-back-pattern)" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </span>
  );
}

export function PlayingCard({
  card,
  faceDown = false,
  size = "md",
  index = 0,
  dealCount = 1,
  placeholder = false,
  className,
}: PlayingCardProps) {
  const reduced = useReducedMotion() ?? false;
  const width = WIDTH[size];
  const height = Math.round(width * 1.4);
  const showBack = placeholder || faceDown || card === undefined;

  const label = placeholder
    ? "Undealt card"
    : faceDown || card === undefined
      ? "Face-down card"
      : `${rankCharOf(card)} of ${SUIT_NAME[suitCharOf(card)]}`;

  const box = (
    <span
      className={cn("block overflow-hidden", className)}
      style={{
        width,
        height,
        // Radius scales with the card. A fixed 10px on a 96px card looks like a
        // cut corner; on a 26px one it eats the whole rank.
        borderRadius: Math.max(5, Math.round(width * 0.09)),
        /*
         * The face carries no border. A dark hairline around a white card looks
         * printed on rather than lying on the table — the shadow is what puts
         * it there. The back keeps one, because dark-on-dark needs an edge.
         */
        border: showBack ? "1px solid var(--color-border-strong)" : "none",
        boxShadow: placeholder
          ? "none"
          : size === "xl"
            ? "var(--shadow-card-hero)"
            : "var(--shadow-card)",
        opacity: placeholder ? 0.25 : 1,
      }}
      role="img"
      aria-label={label}
    >
      {showBack ? <Back width={width} /> : <Face card={card} width={width} />}
    </span>
  );

  // A placeholder holds space and must not animate — it is scenery, and
  // animating it would draw the eye to a card that has not been dealt.
  if (placeholder || reduced) return box;

  return (
    <motion.span
      className="inline-block"
      initial={{ opacity: 0, y: -28, rotate: -12, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ ...SPRING.bouncy, delay: index * staggerDelay(Math.max(dealCount, 1)) }}
    >
      {box}
    </motion.span>
  );
}
