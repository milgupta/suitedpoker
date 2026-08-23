"use client";

import type { ReactNode } from "react";
import { PlayingCard } from "@/components/poker/PlayingCard";
import { cardFromString } from "@/poker/cards";

/**
 * Hub art for /practice — real product cards and a soft azure ground, not the
 * geometric placeholders in `/brand/hub`. Decorative only (`aria-hidden` on
 * the HubCard slot).
 */

const DAILY_HAND = ["As", "Kd", "Qc", "Jh", "Ts"].map(cardFromString);
const ARENA_HAND = ["Ah", "Kd"].map(cardFromString);
/** The open-ender from the quiz's own scenario list. */
const QUIZ_HAND = ["Jh", "Th"].map(cardFromString);

function PreviewWell({ children }: { children: ReactNode }) {
  return (
    <div className="from-accent/20 via-surface-2 to-surface-3 absolute inset-0 flex items-center justify-center bg-gradient-to-br">
      {children}
    </div>
  );
}

/** Five real faces in the same arc the old placeholder used. */
export function DailyPreview() {
  return (
    <PreviewWell>
      <div className="relative h-28 w-52 sm:h-32 sm:w-60">
        {DAILY_HAND.map((card, i) => {
          const offset = i - 2;
          return (
            <div
              key={i}
              className="absolute top-1/2 left-1/2"
              // The independent `translate`/`rotate` properties, NOT `transform`.
              // The sweep's reduced-motion check reads computed `transform` to
              // catch entrance animations stuck mid-translate; static layout in
              // that channel is indistinguishable from a stuck animation. These
              // properties are a channel motion libraries never write.
              style={{
                translate: `calc(-50% + ${offset * 28}px) calc(-50% + ${Math.abs(offset) * 8}px)`,
                rotate: `${offset * 8}deg`,
                zIndex: i + 1,
              }}
            >
              <PlayingCard card={card} size="md" index={i} dealCount={DAILY_HAND.length} />
            </div>
          );
        })}
      </div>
    </PreviewWell>
  );
}

/** Hole cards + a decorative frequency strip — arena's signature pair. */
export function ArenaPreview() {
  return (
    <PreviewWell>
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          {ARENA_HAND.map((card, i) => (
            <PlayingCard key={i} card={card} size="md" index={i} dealCount={ARENA_HAND.length} />
          ))}
        </div>
        <div className="border-border flex h-2.5 w-40 overflow-hidden rounded-full border sm:w-48">
          <span className="bg-accent h-full w-[55%]" />
          <span className="bg-accent/30 h-full flex-1" />
        </div>
      </div>
    </PreviewWell>
  );
}

/**
 * Two cards and the answer, because the answer is the point.
 *
 * A percentage is the one thing this mode shows that no other card can: every
 * other surface in the product hedges its numbers, and 31% here is exact. The
 * chip carries `--accent`, NOT the grade ramp — blue is interface, and a green
 * figure would read as a verdict on a hand nobody has played.
 */
export function QuizPreview() {
  return (
    <PreviewWell>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {QUIZ_HAND.map((card, i) => (
            <PlayingCard key={i} card={card} size="md" index={i} dealCount={QUIZ_HAND.length} />
          ))}
        </div>
        <span className="bg-accent text-on-accent text-heading-md rounded-full px-3 py-1 tabular-nums">
          31%
        </span>
      </div>
    </PreviewWell>
  );
}
