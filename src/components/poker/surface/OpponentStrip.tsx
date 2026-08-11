"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Card } from "@/poker/cards";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../PlayingCard";
import { SeatAvatar } from "../SeatAvatar";
import { formatBb } from "./sizing";

/**
 * The top band of the game surface — DESIGN.md §6.1.
 *
 * A horizontal strip of opponents rather than a ring: bands scale to the
 * desktop this product is mostly used on, where an oval only letterboxes.
 * Each seat carries a bot name (the fixed seeded list), a position tag —
 * the reference app omits positions; a trainer never may — and the stack.
 *
 * The seat currently acting gets a subtle opacity pulse and NEVER a timer:
 * not for bots, not for the hero, not as an option. A countdown teaches
 * beginners to hurry, which is the opposite of the product.
 */

export interface OpponentSeatView {
  /**
   * The sim's bot name. ABSENT in drills — §6.1's names are for the sim's
   * characters; a drill's villains are a solved strategy and are labeled by
   * position only, so the name line is simply not rendered.
   */
  name?: string;
  /** UTG / MP / CO / BTN / SB / BB. Always shown — a trainer never hides positions. */
  position: string;
  stackBb: number;
  /** Wears the small "D" badge on the avatar. */
  isDealer?: boolean;
  /** Dims the whole seat to 40%. */
  folded?: boolean;
  /** Subtle opacity pulse. No timer, ever. */
  isActing?: boolean;
  /** Street bet as a TO-amount in bb. null / undefined = no chip. */
  betBb?: number | null;
  /** Hole cards, shown mini under the avatar — showdown only. */
  revealed?: readonly Card[] | null;
  /** At showdown, the winner's seat carries the strip's `handName` chip. */
  isWinner?: boolean;
}

export interface OpponentStripProps {
  seats: readonly OpponentSeatView[];
  /** Name of the winning hand ("Flush"), rendered as a chip on the winner's seat. */
  handName?: string | null;
  className?: string;
}

function DealerBadge() {
  // White, never amber: a grade-ramp token next to a seat would read as a
  // judgement about that seat.
  return (
    <span
      aria-hidden
      className="bg-text-primary text-canvas text-overline absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full font-bold"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      D
    </span>
  );
}

function OpponentSeatColumn({
  seat,
  handName,
  reduced,
}: {
  seat: OpponentSeatView;
  handName: string | null;
  reduced: boolean;
}) {
  const folded = seat.folded === true;
  const acting = seat.isActing === true && !folded;
  const revealed = seat.revealed ?? null;

  return (
    <motion.div
      className="flex min-w-0 flex-1 flex-col items-center gap-1"
      data-seat
      data-position={seat.position}
      data-folded={folded ? "true" : "false"}
      data-acting={acting ? "true" : "false"}
      data-winner={seat.isWinner === true ? "true" : "false"}
      style={{ opacity: folded ? 0.4 : 1 }}
      animate={acting && !reduced ? { opacity: [1, 0.55, 1] } : undefined}
      transition={
        acting && !reduced ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined
      }
    >
      <span className="relative">
        <SeatAvatar
          seed={seat.name === undefined ? seat.position : `${seat.position}:${seat.name}`}
          folded={folded}
        />
        {seat.isDealer === true && <DealerBadge />}
      </span>

      <span className="flex w-full min-w-0 flex-col items-center">
        {seat.name !== undefined && (
          <span className="text-text-secondary text-caption w-full truncate text-center font-medium">
            {seat.name}
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="text-text-tertiary text-overline font-mono uppercase">
            {seat.position}
          </span>
          <span className="text-text-secondary text-caption font-mono font-semibold tabular-nums">
            {formatBb(seat.stackBb)}
          </span>
        </span>
      </span>

      {seat.betBb !== null && seat.betBb !== undefined && (
        <span
          className="border-border bg-surface-2 text-text-secondary text-caption rounded-full border px-2 py-0.5 font-mono font-semibold whitespace-nowrap tabular-nums"
          data-bet
        >
          {formatBb(seat.betBb)}
        </span>
      )}

      {revealed !== null && revealed.length > 0 && (
        <span className="flex gap-0.5" data-revealed>
          {revealed.map((card, i) => (
            <PlayingCard key={i} card={card} size="sm" index={i} dealCount={revealed.length} />
          ))}
        </span>
      )}

      {seat.isWinner === true && handName !== null && (
        <span
          className="border-accent/40 bg-accent/10 text-accent-bright text-caption rounded-full border px-2 py-0.5 font-medium whitespace-nowrap"
          data-hand-name
        >
          {handName}
        </span>
      )}
    </motion.div>
  );
}

export function OpponentStrip({ seats, handName = null, className }: OpponentStripProps) {
  const reduced = useReducedMotion() ?? false;

  return (
    <div
      className={cn("flex w-full items-start justify-between gap-1 sm:gap-3", className)}
      data-opponent-strip
    >
      {seats.map((seat) => (
        <OpponentSeatColumn
          key={seat.name === undefined ? seat.position : `${seat.position}:${seat.name}`}
          seat={seat}
          handName={handName}
          reduced={reduced}
        />
      ))}
    </div>
  );
}
