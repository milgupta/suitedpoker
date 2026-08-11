import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The layout shell for the game surface — DESIGN.md §6: three horizontal
 * bands on the canvas, no oval, no felt, no ring, at any viewport size.
 *
 * Opponents on top, board in the middle, hero dock and action dock at the
 * bottom. The board band flexes to absorb whatever height the viewport
 * region offers, so the whole surface fills its region without scrolling at
 * 390×844 and without stretching the seats or the controls.
 *
 * Slot-based on purpose: this component knows nothing about spots, sims or
 * game state, so the drill and the sim can share it without the client
 * boundary widening.
 */

export interface GameSurfaceProps {
  opponents: ReactNode;
  board: ReactNode;
  hero: ReactNode;
  actions: ReactNode;
  className?: string;
}

export function GameSurface({ opponents, board, hero, actions, className }: GameSurfaceProps) {
  return (
    <div
      // 16px gutters full-bleed on mobile (DESIGN.md §3 containers); a
      // centred column on desktop so the bands do not stretch to a stripe.
      className={cn("mx-auto flex h-full w-full max-w-2xl flex-col px-4", className)}
      data-game-surface
    >
      <div className="shrink-0 pt-2" data-band="opponents">
        {opponents}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center py-3" data-band="board">
        {board}
      </div>

      <div className="flex shrink-0 flex-col gap-3 pb-2" data-band="hero">
        {hero}
        {actions}
      </div>
    </div>
  );
}
