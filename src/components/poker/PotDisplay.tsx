"use client";

import { AnimatedNumber } from "@/components/motion";
import type { SidePot } from "@/poker/gamestate";
import { cn } from "@/lib/utils";

export interface PotDisplayProps {
  amountBb: number;
  sidePots?: readonly SidePot[];
  className?: string;
}

/**
 * The pot, in big blinds. Never dollars — anywhere in the app.
 *
 * Beginners have to learn to think in bb, and showing every number that way is
 * the cheapest possible way to teach it.
 */
export function PotDisplay({ amountBb, sidePots, className }: PotDisplayProps) {
  const extraPots = (sidePots ?? []).slice(1);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <p className="text-display-md font-mono tabular-nums">
        <span className="text-text-tertiary text-body-md mr-2 font-sans">Pot</span>
        <AnimatedNumber value={amountBb} decimals={1} suffix="BB" />
      </p>

      {extraPots.length > 0 && (
        <ul className="mt-2 flex flex-col items-center gap-0.5">
          {extraPots.map((pot, i) => (
            <li key={i} className="text-text-tertiary text-caption font-mono tabular-nums">
              Side pot {i + 1}: {pot.amount.toFixed(1)}BB
              <span className="sr-only"> for seats {pot.eligibleSeats.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
