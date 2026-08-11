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
 *
 * Card size is TWO renders (`sm:hidden` / `hidden sm:flex`), never `matchMedia`
 * state — that path changed size one frame after paint and put CLS on /arena
 * once already.
 */
export function BoardRunout({ board, street, className }: BoardRunoutProps) {
  const flop = [0, 1, 2];
  const late = [3, 4];

  const renderSlot = (i: number, size: "md" | "lg") => {
    const card = board[i];
    return (
      <PlayingCard
        key={`${size}-${i}`}
        card={card}
        size={size}
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
      <div className="flex gap-1.5 sm:hidden">{flop.map((i) => renderSlot(i, "md"))}</div>
      <div className="flex gap-1.5 sm:hidden">{late.map((i) => renderSlot(i, "md"))}</div>
      <div className="hidden gap-2 sm:flex">{flop.map((i) => renderSlot(i, "lg"))}</div>
      <div className="hidden gap-2 sm:flex">{late.map((i) => renderSlot(i, "lg"))}</div>
    </div>
  );
}
