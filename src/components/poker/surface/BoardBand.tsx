"use client";

import type { Card } from "@/poker/cards";
import { AnimatedNumber } from "@/components/motion";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../PlayingCard";
import { chipsFromBb } from "@/lib/units";

/**
 * The center band — DESIGN.md §6.2.
 *
 * Five card slots, ALWAYS present: undealt slots render as the deck's
 * patterned backs (PlayingCard's `placeholder`) and cards reveal in place, so
 * zero layout shift is by construction rather than by skeleton-matching.
 *
 * The pot sits right-aligned under the slots — a tertiary "Pot" label, then the
 * figure in `bb` — and counts up when a street's bets clear into it. It was
 * specified as a bare unlabelled number; see the reasoning at the render site
 * for why a preflop drill cannot carry that.
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

      {/*
       * THE LABEL LEADS THE FIGURE.
       *
       * DESIGN.md §6.2 specified a bare right-aligned number with no "POT"
       * label, and mid-hand that reads fine: there are cards out, bets have
       * cleared into it, and the number is obviously the pot because you
       * watched it grow. A PREFLOP DRILL has none of that — five card backs,
       * nobody has acted, and a lone "1.5" floating to the right of them with
       * nothing on screen saying what it counts. That is the state most drills
       * OPEN in, which makes it the first thing a beginner sees and the worst
       * possible place to be unlabelled.
       *
       * Lowercase `bb`, matching `sizing.ts` and every other quantity on the
       * surface. An uppercase `BB` beside a lowercase `100bb` reads as a
       * different unit.
       */}
      <div className="flex items-baseline justify-end gap-1.5">
        <span className="text-overline text-text-tertiary uppercase">Pot</span>
        <AnimatedNumber
          value={chipsFromBb(potBb)}
          decimals={0}
          className="text-text-primary text-heading-md font-mono font-semibold tabular-nums"
        />
      </div>
    </div>
  );
}
