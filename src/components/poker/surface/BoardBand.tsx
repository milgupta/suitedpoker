"use client";

import type { Card } from "@/poker/cards";
import { AnimatedNumber } from "@/components/motion";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../PlayingCard";

/**
 * The center band — DESIGN.md §6.2.
 *
 * Five card slots, ALWAYS present: undealt slots render as the deck's
 * patterned backs (PlayingCard's `placeholder`) and cards reveal in place, so
 * zero layout shift is by construction rather than by skeleton-matching.
 *
 * The pot is a bare right-aligned number — no "POT" label — that counts up
 * when a street's bets clear into it.
 */

export interface BoardBandProps {
  board: readonly Card[];
  potBb: number;
  /**
   * The showdown treatment: cards in the set stay at full brightness and
   * every other FACE-UP card dims. Undealt backs are scenery and stay put.
   */
  highlight?: ReadonlySet<Card> | null;
  className?: string;
}

const SLOT_COUNT = 5;

function Slots({
  board,
  highlight,
  size,
}: {
  board: readonly Card[];
  highlight: ReadonlySet<Card> | null;
  size: "md" | "lg";
}) {
  return (
    <>
      {Array.from({ length: SLOT_COUNT }, (_, i) => {
        const card = board[i];
        if (card === undefined) {
          return <PlayingCard key={i} placeholder size={size} />;
        }
        const dimmed = highlight !== null && !highlight.has(card);
        return (
          <span
            key={i}
            data-board-slot={i}
            data-dimmed={dimmed ? "true" : "false"}
            className="block"
            style={{
              opacity: dimmed ? 0.35 : 1,
              transition: "opacity var(--duration-base) var(--ease-standard)",
            }}
          >
            <PlayingCard card={card} size={size} index={i} dealCount={board.length} />
          </span>
        );
      })}
    </>
  );
}

export function BoardBand({ board, potBb, highlight = null, className }: BoardBandProps) {
  return (
    <div className={cn("flex w-full flex-col gap-2", className)} data-board-band>
      {/*
       * Rendered twice, gated by breakpoint classes, because the card size is
       * a NUMBER inside PlayingCard — sizing it from matchMedia state is the
       * exact shape that put 0.07 of CLS on /arena. Five extra spans beat a
       * layout shift.
       */}
      <div className="flex justify-center gap-1.5 sm:hidden">
        <Slots board={board} highlight={highlight} size="md" />
      </div>
      <div className="hidden justify-center gap-2 sm:flex" aria-hidden>
        <Slots board={board} highlight={highlight} size="lg" />
      </div>

      <div className="flex justify-end">
        <AnimatedNumber
          value={potBb}
          decimals={1}
          className="text-text-primary text-heading-md font-mono font-semibold tabular-nums"
        />
      </div>
    </div>
  );
}
