"use client";

import type { Card } from "@/poker/cards";
import type { Street } from "@/poker/gamestate";
import { PlayingCard } from "./PlayingCard";
import { cn } from "@/lib/utils";

export interface BoardRunoutProps {
  board: readonly Card[];
  street: Street;
  className?: string;
}

/**
 * The board, laid out 3-OVER-2 rather than as a row of five.
 *
 * On a 390px screen a row of five cards is either too small to read or too wide
 * to fit. Stacking the turn and river beneath the flop keeps every card large
 * and legible on the device most of this audience uses.
 *
 * Undealt cards render as dimmed backs in position, so a runout never shifts
 * the layout under the player's thumb.
 */
export function BoardRunout({ board, street, className }: BoardRunoutProps) {
  const flop = [0, 1, 2];
  const late = [3, 4];

  const renderSlot = (i: number) => {
    const card = board[i];
    return (
      <PlayingCard
        key={i}
        card={card}
        size="lg"
        index={i < 3 ? i : 0}
        dealCount={i < 3 ? 3 : 1}
        placeholder={card === undefined}
      />
    );
  };

  return (
    <div
      className={cn("flex flex-col items-center gap-2", className)}
      role="group"
      aria-label={`Board, ${street}`}
    >
      <div className="flex gap-2">{flop.map(renderSlot)}</div>
      <div className="flex gap-2">{late.map(renderSlot)}</div>
    </div>
  );
}
