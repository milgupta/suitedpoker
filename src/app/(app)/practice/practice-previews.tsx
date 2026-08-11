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
              style={{
                transform: `translate(-50%, -50%) translateX(${offset * 28}px) translateY(${Math.abs(offset) * 8}px) rotate(${offset * 8}deg)`,
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
