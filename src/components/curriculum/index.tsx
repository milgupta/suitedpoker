import type { ReactNode } from "react";
import { PlayingCard } from "@/components/poker";
import { cardsFromString } from "@/poker/cards";
import { amountFromBb } from "@/lib/units";

/**
 * The lesson vocabulary: every custom component MDX may use.
 *
 * SERVER components by default. Only `Checkpoint` and `RangeGridEmbed` need
 * state, and they live in their own `"use client"` files — a page whose job is
 * reading should not ship a bundle to render a card.
 *
 * Every prop is optional with a sane default. These are authored in MDX, and a
 * typo in one card string must degrade that one figure rather than blank the
 * whole lesson behind an error boundary.
 */

export { Checkpoint } from "./checkpoint";
export { RangeGridEmbed } from "./range-grid-embed";

function safeCards(text: string) {
  try {
    return cardsFromString(text);
  } catch {
    return [];
  }
}

/** Real cards inline. `hole` and optional `board` are strings like "Ah Kd". */
export function HandExample({
  hole = "",
  board,
  label,
}: {
  hole?: string;
  board?: string;
  label?: string;
}) {
  const holeCards = safeCards(hole);
  const boardCards = board === undefined ? [] : safeCards(board);

  return (
    <figure className="my-5 flex flex-col items-center gap-3" data-hand-example>
      <div className="flex items-center gap-4">
        <div className="flex gap-1.5">
          {holeCards.map((card, i) => (
            <PlayingCard key={i} card={card} size="md" />
          ))}
        </div>
        {boardCards.length > 0 && (
          <>
            <span aria-hidden className="text-text-tertiary">
              on
            </span>
            <div className="flex gap-1.5">
              {boardCards.map((card, i) => (
                <PlayingCard key={i} card={card} size="sm" />
              ))}
            </div>
          </>
        )}
      </div>
      {label !== undefined && (
        <figcaption className="text-text-tertiary text-caption">{label}</figcaption>
      )}
    </figure>
  );
}

/** A static table snapshot: positions, the pot, and what has happened. */
export function TableExample({
  hero = "",
  pot = 0,
  lines = [],
}: {
  hero?: string;
  /** In big blinds. */
  pot?: number;
  lines?: readonly string[];
}) {
  return (
    <figure
      className="border-border bg-surface-1 my-5 flex flex-col gap-2 rounded-lg border px-4 py-3"
      data-table-example
    >
      <div className="text-text-tertiary text-caption flex justify-between font-mono">
        <span>You are {hero}</span>
        <span>pot {amountFromBb(pot)}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line} className="text-body-sm text-text-secondary">
            {line}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The takeaway box. One per lesson, at the end — the rule of thumb to keep. */
export function KeyIdea({ children }: { children?: ReactNode }) {
  return (
    <aside
      className="border-accent bg-surface-1 my-6 rounded-lg border-l-2 px-4 py-3"
      data-key-idea
    >
      <p className="text-overline text-accent-bright mb-1 uppercase">Key idea</p>
      <div className="text-body-lg font-medium">{children}</div>
    </aside>
  );
}
