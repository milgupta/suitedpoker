"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Card } from "@/poker/cards";
import type { SeatView } from "@/poker/generator";
import type { HeroPosition } from "@/poker/solutions";
import { seatActivity } from "@/lib/spot-seats";
import { SPRING } from "@/lib/motion";
import { PlayingCard } from "./PlayingCard";
import { SeatAvatar } from "./SeatAvatar";
import { TableRing, seatLayout } from "./Table";
import { cn } from "@/lib/utils";

/**
 * A DRILL SPOT, DRAWN AS A TABLE.
 *
 * Every screen that asks for a decision — the arena, the daily challenge, the
 * one demo hand before the paywall — used to render the spot as a stack of
 * text: a row of stats, a sentence of action history, and two small cards in a
 * box. There is no poker product anywhere that shows a hand that way, because
 * it does not work: the reader has to reconstruct six seats, who folded, who
 * raised and where they were sitting, all before they can start on the actual
 * question. That reconstruction is the part a beginner is worst at, and this
 * app's entire audience is beginners.
 *
 * Same visual language as the table simulator (`PokerTable`) on purpose — the
 * glowing ring, the seat pills, the same card faces. A drill and a hand at the
 * table are the same game, so they should not be two different-looking
 * products. `PokerTable` cannot be reused directly because a drill has no
 * `GameState`: the client is deliberately given a spot with no deck, no villain
 * cards and no node reference, and that boundary is not worth widening for a
 * layout.
 */

export interface SpotTableProps {
  seats: readonly SeatView[];
  heroPos: HeroPosition;
  heroCards: readonly Card[];
  board: readonly Card[];
  potBb: number;
  effStackBb: number;
  actionHistory: readonly string[];
  className?: string;
}

export function SpotTable({
  seats,
  heroPos,
  heroCards,
  board,
  potBb,
  effStackBb,
  actionHistory,
  className,
}: SpotTableProps) {
  const reduced = useReducedMotion() ?? false;
  const activity = seatActivity(heroPos, actionHistory);

  const heroIndex = Math.max(
    seats.findIndex((seat) => seat.isHero),
    0,
  );
  const layout = seatLayout(seats.length, heroIndex);

  /*
   * The hero's own arc is lit, because in a drill the hero is always the one to
   * act — that is what a drill IS. On the sim the arc tracks whoever is to act;
   * here it is a constant, and it points at the person being asked.
   */
  const heroAngle = 0;

  return (
    <div className={cn("flex w-full flex-col items-center gap-4", className)}>
      {/*
       * The aspect ratio is a CSS breakpoint, NOT the `narrow` state.
       *
       * Driving it from a matchMedia effect meant the ring was 5/4 on first
       * paint and 1/1 a frame later, which is a layout shift on the busiest
       * screen in the product — CLS on /arena went from 0.0000 to 0.0568 doing
       * it that way. Nothing here is sized from state any more.
       */}
      <div
        className="relative aspect-square w-full sm:aspect-[5/4]"
        role="img"
        aria-label={`Six-handed table. You are in ${heroPos}. Pot ${potBb.toFixed(1)} big blinds, ${effStackBb.toFixed(0)} big blinds effective.`}
      >
        <TableRing activeAngle={heroAngle} />

        {/* The middle of the table: board, then the pot under it. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {board.length > 0 && (
            <>
              {/*
               * The board twice, one shown per breakpoint.
               *
               * Card size is a NUMBER inside PlayingCard, so it cannot come
               * from a Tailwind class — and taking it from a matchMedia effect
               * resizes the board one frame after first paint, which moves
               * every seat anchor on the ring. That was the last 0.043 of CLS
               * on /arena. Five extra spans of pure-SVG card, rendered once, is
               * a cheaper fix than a layout shift on the busiest screen here.
               */}
              <div className="flex flex-wrap justify-center gap-1.5 sm:hidden">
                {board.map((card, i) => (
                  <PlayingCard key={i} card={card} size="md" index={i} dealCount={board.length} />
                ))}
              </div>
              <div className="hidden flex-wrap justify-center gap-1.5 sm:flex" aria-hidden>
                {board.map((card, i) => (
                  <PlayingCard key={i} card={card} size="lg" index={i} dealCount={board.length} />
                ))}
              </div>
            </>
          )}
          <PotChip potBb={potBb} />
        </div>

        {seats.map((seat, i) => {
          const spot = layout[i];
          if (spot === undefined) return null;
          const state = activity[seat.position];

          return (
            <div
              key={seat.seat}
              data-seat-anchor={seat.seat}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
            >
              <SpotSeat
                position={seat.position}
                stackBb={seat.stackBb}
                isHero={seat.isHero}
                action={state.action}
                folded={state.folded}
                reduced={reduced}
              />
            </div>
          );
        })}
      </div>

      {/* The hero's hand, below the ring where a player's own cards actually
          sit, and the largest object on the screen. It is the thing being
          decided about; nothing else should be bigger. */}
      <div className="flex gap-2.5">
        {heroCards.map((card, i) => (
          <PlayingCard key={i} card={card} size="xl" index={i} dealCount={heroCards.length} />
        ))}
      </div>

      <p className="text-text-tertiary text-caption text-center font-mono">
        {effStackBb.toFixed(0)}BB effective
      </p>
    </div>
  );
}

function PotChip({ potBb }: { potBb: number }) {
  return (
    <span className="border-border-strong bg-surface-2/80 text-body-sm rounded-full border px-3 py-1 font-mono font-semibold tabular-nums backdrop-blur-sm">
      {potBb.toFixed(1)}
      <span className="text-text-tertiary ml-1">BB pot</span>
    </span>
  );
}

/**
 * A seat on the ring: position, stack, and what they did.
 *
 * Folded seats stay in place at low opacity rather than disappearing. An empty
 * chair tells you as much as an occupied one — "everybody in front of me passed"
 * is the single most important fact about an unopened pot, and a table that
 * simply omits those seats has hidden it.
 */
function SpotSeat({
  position,
  stackBb,
  isHero,
  action,
  folded,
  reduced,
}: {
  position: HeroPosition;
  stackBb: number;
  isHero: boolean;
  action: string | null;
  folded: boolean;
  reduced: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1"
      data-position={position}
      data-hero={isHero ? "true" : "false"}
      data-folded={folded ? "true" : "false"}
    >
      {/* Above the pill, never inside it. At 390px the side seats sit at the
          very edge of the ring; another 30px of pill width pushes them off the
          screen, and vertical space is the one thing the ring has spare. */}
      <SeatAvatar seed={position} isHero={isHero} folded={folded} />

      <motion.div
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 whitespace-nowrap",
          isHero ? "border-accent bg-surface-2" : "border-border bg-surface-1",
        )}
        style={{ opacity: folded ? 0.35 : 1 }}
        animate={
          reduced || !isHero
            ? { boxShadow: "0 0 0 0 transparent" }
            : {
                boxShadow: [
                  "0 0 0 0 var(--color-accent-glow)",
                  "0 0 0 7px transparent",
                  "0 0 0 0 var(--color-accent-glow)",
                ],
              }
        }
        transition={
          isHero && !reduced
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.18 }
        }
      >
        {/* The position, never the word "you", inside the pill. Position is the
            single most decision-relevant fact about a seat and it is what the
            hint, the explanation and the range grid all refer to — replacing it
            with "You" on the one seat that matters most makes the player look
            elsewhere to find out where they are sitting. */}
        <span
          className={cn(
            "text-overline font-mono uppercase",
            isHero ? "text-accent-bright" : "text-text-tertiary",
          )}
        >
          {position}
        </span>
        <span className="text-caption font-mono font-semibold tabular-nums">
          {stackBb.toFixed(0)}
          <span className="text-text-tertiary ml-0.5">BB</span>
        </span>
      </motion.div>

      {isHero && <span className="text-accent-bright text-overline uppercase">you</span>}

      {action !== null && (
        <motion.span
          className="border-accent/40 bg-accent/10 text-accent-bright text-caption rounded-full border px-2 py-0.5 whitespace-nowrap"
          initial={reduced ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING.snappy}
        >
          {action}
        </motion.span>
      )}
    </div>
  );
}
