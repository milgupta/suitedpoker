"use client";

import type { Card } from "@/poker/cards";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../PlayingCard";
import { formatAmount } from "./sizing";

/**
 * The bottom band's left half — DESIGN.md §6.3.
 *
 * Two large fanned cards, and beside them the hand-strength card: the current
 * made hand in lesson vocabulary with the best five ghosted small beneath it.
 * Computed only from what the hero can see — the label comes in as a prop so
 * this stays presentational and the arithmetic stays in src/poker.
 *
 * Hero to act is an ACCENT glow (`.halo` — the one-per-screen border halo).
 * Blue, because it is interface state; the green ring the reference app uses
 * would read as a grade.
 */

export interface HeroDockProps {
  /** The hero's two hole cards. */
  cards: readonly Card[];
  /** Renders the cards as dim outlines rather than faces. */
  folded?: boolean;
  /** Made-hand label in beginner vocabulary ("Pair", "Flush"). */
  strengthLabel: string;
  /** The cards that make the label, ghosted mini beneath it. */
  bestFive?: readonly Card[];
  stackBb: number;
  /** Hero's live street bet as a TO-amount in bb. null / undefined = none. */
  betBb?: number | null;
  /** Accent glow border — interface state, never the grade green. */
  toAct?: boolean;
  className?: string;
}

/**
 * Mirrors PlayingCard's `xl` geometry (96 wide, 1:1.4, radius ~9% of width).
 * An outline is what remains of a folded hand — the shape without the card.
 */
const OUTLINE_WIDTH = 96;

function CardOutline() {
  return (
    <span
      aria-hidden
      className="border-border-strong block border"
      style={{
        width: OUTLINE_WIDTH,
        height: Math.round(OUTLINE_WIDTH * 1.4),
        borderRadius: Math.max(5, Math.round(OUTLINE_WIDTH * 0.09)),
        opacity: 0.5,
      }}
    />
  );
}

function FannedCards({ cards, folded }: { cards: readonly Card[]; folded: boolean }) {
  // Side by side with a slight lean, never overlapping — a covered corner
  // index is a covered piece of the one object the player decides with.
  return (
    <div
      className="flex items-end gap-1.5 pt-1"
      data-hero-cards
      data-folded={folded ? "true" : "false"}
    >
      {cards.map((card, i) => (
        <span key={i} className={cn("block", i === 0 ? "-rotate-2" : "rotate-2")}>
          {folded ? (
            <CardOutline />
          ) : (
            <PlayingCard card={card} size="xl" index={i} dealCount={cards.length} />
          )}
        </span>
      ))}
    </div>
  );
}

export function HeroDock({
  cards,
  folded = false,
  strengthLabel,
  bestFive = [],
  stackBb,
  betBb = null,
  toAct = false,
  className,
}: HeroDockProps) {
  return (
    <div
      className={cn(
        // Content-hugging and centred, not full-width: at desktop widths the
        // full surface span left a dead gulf between the cards and the
        // strength card, which read as an empty tray rather than a hand.
        "border-border bg-surface-1 mx-auto flex w-fit max-w-full items-center gap-5 rounded-lg border p-3",
        toAct && !folded && "halo",
        className,
      )}
      data-hero-dock
      data-to-act={toAct ? "true" : "false"}
      data-folded={folded ? "true" : "false"}
    >
      <FannedCards cards={cards} folded={folded} />

      <div
        className="border-border bg-surface-2 flex min-w-0 flex-col gap-1.5 rounded-md border px-3 py-2"
        data-strength-card
        style={{ opacity: folded ? 0.4 : 1 }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-text-primary text-body-md font-semibold" data-strength-label>
            {strengthLabel}
          </span>
          {betBb !== null && betBb !== undefined && (
            <span
              className="border-border bg-surface-3 text-text-secondary text-caption rounded-full border px-2 py-0.5 font-mono font-semibold whitespace-nowrap tabular-nums"
              data-hero-bet
            >
              {formatAmount(betBb)}
            </span>
          )}
        </div>

        {bestFive.length > 0 && (
          <div className="flex gap-0.5" data-best-five style={{ opacity: 0.55 }}>
            {bestFive.map((card, i) => (
              <PlayingCard key={i} card={card} size="sm" />
            ))}
          </div>
        )}

        <div className="flex items-baseline gap-1.5">
          <span className="text-text-tertiary text-overline uppercase">Stack</span>
          <span
            className="text-text-secondary text-body-sm font-mono font-semibold tabular-nums"
            data-hero-stack
          >
            {formatAmount(stackBb)}
          </span>
        </div>
      </div>
    </div>
  );
}
