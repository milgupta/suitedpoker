"use client";

import { AnimatedNumber } from "@/components/motion";
import type { SidePot } from "@/poker/gamestate";
import { cn } from "@/lib/utils";

export interface PotDisplayProps {
  amountBb: number;
  /**
   * Engine side pots are in CHIPS. Pass the big blind so extras convert to bb —
   * printing chip counts with a "BB" suffix was how "Side 1 0.0BB" appeared on
   * a 4bb pot.
   */
  bigBlind?: number;
  sidePots?: readonly SidePot[];
  /**
   * Side pots only matter once someone is all-in. During a normal pot the
   * engine still partitions by commitment level (blinds alone make two rows),
   * and listing them under the main pot is noise on a phone.
   */
  showSidePots?: boolean;
  className?: string;
}

/**
 * The pot, in big blinds. Never dollars — anywhere in the app.
 *
 * Compact on purpose: `text-display-md` (34px) under a 3-over-2 board buried
 * the hero seat on 390px. A heading-sized chip reads clearly and leaves the
 * board the brightest thing on the felt.
 */
export function PotDisplay({
  amountBb,
  bigBlind = 0,
  sidePots,
  showSidePots = false,
  className,
}: PotDisplayProps) {
  const extras =
    showSidePots && bigBlind > 0
      ? (sidePots ?? [])
          .slice(1)
          .map((pot, i) => ({
            index: i + 1,
            amountBb: pot.amount / bigBlind,
            seats: pot.eligibleSeats,
          }))
          .filter((pot) => pot.amountBb >= 0.05)
      : [];

  return (
    <div className={cn("flex flex-col items-center gap-1", className)} data-pot>
      <p className="border-border-strong bg-surface-2/80 text-heading-md rounded-full border px-3.5 py-1 font-mono font-semibold tabular-nums backdrop-blur-sm">
        <span className="text-text-tertiary text-caption mr-1.5 font-sans font-medium">Pot</span>
        <AnimatedNumber value={amountBb} decimals={1} suffix="BB" />
      </p>

      {extras.length > 0 && (
        <ul className="flex flex-col items-center gap-0.5">
          {extras.map((pot) => (
            <li key={pot.index} className="text-text-tertiary text-caption font-mono tabular-nums">
              Side {pot.index}: {pot.amountBb.toFixed(1)}BB
              <span className="sr-only"> for seats {pot.seats.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
