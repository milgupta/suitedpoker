"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Card } from "@/poker/cards";
import type { SeatView } from "@/poker/generator";
import type { HeroPosition } from "@/poker/solutions";
import { seatActivity } from "@/lib/spot-seats";
import { SPRING } from "@/lib/motion";
import { PlayingCard } from "./PlayingCard";
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

  /*
   * At 390px a 72px board is 231px of cards across a 390px ring, and the flop
   * lands on top of the seat pills at the sides — the first version did exactly
   * that. A narrow table gets a smaller board and a taller ellipse, which buys
   * the room back on both axes. The hero's own cards stay `xl` at every width;
   * they are the thing being decided about.
   */
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = (): void => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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
      <div
        className="relative w-full"
        style={{ aspectRatio: narrow ? "1 / 1" : "5 / 4" }}
        role="img"
        aria-label={`Six-handed table. You are in ${heroPos}. Pot ${potBb.toFixed(1)} big blinds, ${effStackBb.toFixed(0)} big blinds effective.`}
      >
        <TableRing activeAngle={heroAngle} />

        {/* The middle of the table: board, then the pot under it. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {board.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {board.map((card, i) => (
                <PlayingCard
                  key={i}
                  card={card}
                  size={narrow ? "md" : "lg"}
                  index={i}
                  dealCount={board.length}
                />
              ))}
            </div>
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
