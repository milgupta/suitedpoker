"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Player } from "@/poker/gamestate";
import { DURATION, SPRING } from "@/lib/motion";
import { PlayingCard } from "./PlayingCard";
import { SeatAvatar } from "./SeatAvatar";
import { cn } from "@/lib/utils";

export interface SeatProps {
  player: Player;
  isHero?: boolean;
  isActive?: boolean;
  /** Big blind size in chips, so stacks can be shown in bb. */
  bigBlind: number;
  /** Show the hole cards face up. Hero only, or at showdown. */
  revealCards?: boolean;
  className?: string;
}

/**
 * A seat pill sitting ON the table ring.
 *
 * Deliberately small and dark: the board cards are the brightest objects on
 * screen and the seats must not compete with them. Position label in mono,
 * stack in tabular-nums so a changing stack does not jitter the pill's width.
 */
export function Seat({
  player,
  isHero = false,
  isActive = false,
  bigBlind,
  revealCards = false,
  className,
}: SeatProps) {
  const reduced = useReducedMotion() ?? false;
  const folded = player.status === "folded";
  const stackBb = bigBlind > 0 ? player.stack / bigBlind : 0;
  const betBb = bigBlind > 0 ? player.committedThisStreet / bigBlind : 0;

  return (
    <div
      className={cn("flex flex-col items-center gap-1.5", className)}
      data-seat={player.seat}
      data-position={player.position}
      data-folded={folded ? "true" : "false"}
      data-status={player.status}
    >
      {/* Same face the drill table uses, so a spot and a played hand are
          populated by the same six people. */}
      <SeatAvatar seed={player.position} sizeClass="size-[26px]" isHero={isHero} folded={folded} />

      {/* Hole cards sit above the pill, so the pill stays the anchor point. */}
      <div className={cn("flex gap-1", folded && "opacity-0")} aria-hidden={folded}>
        {player.holeCards !== null &&
          player.holeCards.map((card, i) => (
            <PlayingCard
              key={i}
              card={card}
              faceDown={!revealCards}
              size="sm"
              index={i}
              dealCount={2}
            />
          ))}
      </div>

      <motion.div
        className="border-border bg-surface-1 flex items-center gap-2 rounded-full border px-2.5 py-1"
        style={{
          // The hero is marked with the grade-best border because it is the
          // only seat whose decisions are being judged.
          borderColor: isHero ? "var(--color-grade-best)" : undefined,
          opacity: folded ? 0.4 : 1,
        }}
        animate={
          reduced || !isActive
            ? { boxShadow: "0 0 0 0 transparent" }
            : {
                boxShadow: [
                  "0 0 0 0 var(--color-accent-glow)",
                  "0 0 0 6px transparent",
                  "0 0 0 0 var(--color-accent-glow)",
                ],
              }
        }
        transition={
          isActive && !reduced
            ? { duration: DURATION.slow * 2, repeat: Infinity, ease: "easeInOut" }
            : { duration: DURATION.fast }
        }
      >
        <span className="text-overline text-text-tertiary font-mono uppercase">
          {player.position}
        </span>
        <span className="text-body-sm font-mono font-semibold tabular-nums">
          {stackBb.toFixed(stackBb < 10 ? 1 : 0)}
          <span className="text-text-tertiary ml-0.5">BB</span>
        </span>
        {player.status === "allin" && (
          <span className="text-overline text-grade-inaccuracy uppercase">All in</span>
        )}
      </motion.div>

      {/* Chips committed this street, animating toward the pot. */}
      {betBb > 0 && (
        <motion.span
          className="border-border-strong bg-surface-2 text-caption rounded-full border px-2 py-0.5 font-mono tabular-nums"
          initial={reduced ? false : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING.snappy}
        >
          {betBb.toFixed(betBb < 10 ? 1 : 0)}BB
        </motion.span>
      )}
    </div>
  );
}
