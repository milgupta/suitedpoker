"use client";

import { motion, useReducedMotion } from "motion/react";
import { rankCharOf, suitCharOf, type Card, type Suit } from "@/poker/cards";
import { SPRING, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { SUIT_NAME, SUIT_PATH, SUIT_TOKEN } from "./suit-path";

export type CardSize = "sm" | "md" | "lg" | "xl";

/**
 * Width in px per size. Height follows the standard 1:1.4 card ratio.
 *
 * `xl` is the hero's own two cards. `lg` is the board. `md` is a card shown
 * inside prose or a choice tile. `sm` is a villain's mini-cards on the ring,
 * where the card is a marker rather than something to read.
 */
const WIDTH: Record<CardSize, number> = { sm: 26, md: 52, lg: 72, xl: 96 };

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
 * The face: the rank over its suit, both centred.
 *
 * This replaced a corner index with a full English pip layout — ten pips for a
 * ten, a drawn court figure for a king. That version was more faithful to a
 * physical card and worse to actually use: at the sizes this product renders
 * cards, a centred rank is read at a glance and a pip field has to be counted.
 * The reference this now follows is a poker app, not a deck of cards, and every
 * one of them lands on the same answer.
 *
 * One layout at every size, so a board card and a hero card are recognisably
 * the same object.
 */
function Face({ card, width }: { card: Card; width: number }) {
  const rank = rankCharOf(card);
  const suit = suitCharOf(card);
  const colour = SUIT_TOKEN[suit];

  return (
    <span
      className="flex h-full w-full flex-col items-center justify-center"
      style={{
        background: `linear-gradient(160deg, var(--color-card-face) 0%, var(--color-card-face) 55%, var(--color-card-face-edge) 100%)`,
        gap: width * 0.04,
      }}
    >
      <span
        className="font-mono leading-none font-bold tabular-nums"
        style={{ color: colour, fontSize: width * 0.5 }}
      >
        {rank}
      </span>
      <Pip suit={suit} colour={colour} size={width * 0.32} />
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
        // Visible scenery: at 0.25 the empty board read as a hole in the page
        // rather than five waiting slots. Half opacity keeps a dealt face
        // unmistakably brighter while the table's shape stays apparent.
        opacity: placeholder ? 0.55 : 1,
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
