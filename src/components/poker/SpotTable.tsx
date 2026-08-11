"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Card } from "@/poker/cards";
import type { SeatView } from "@/poker/generator";
import type { HeroPosition } from "@/poker/solutions";
import { actionVerb } from "@/lib/bet-chip";
import {
  formatActionHistory,
  formatCommittedBb,
  situationLine,
  spotCoachTip,
} from "@/lib/spot-situation";
import { SPRING } from "@/lib/motion";
import { PlayingCard } from "./PlayingCard";
import { SeatAvatar } from "./SeatAvatar";
import { TableRing, seatLayout } from "./Table";
import { cn } from "@/lib/utils";

/**
 * A DRILL SPOT, DRAWN AS A TABLE.
 *
 * Seat fold / waiting / chip state arrives on `SeatView` from `generateSpot`.
 * The client must not re-infer who folded from history strings for display —
 * that is how a legal chart decision looked like broken poker.
 */

export interface SpotTableProps {
  seats: readonly SeatView[];
  heroPos: HeroPosition;
  heroCards: readonly Card[];
  board: readonly Card[];
  potBb: number;
  effStackBb: number;
  actionHistory: readonly string[];
  /** Extra pre-decision line. Defaults to the shared coach tip for the spot. */
  coachTip?: string | null;
  /** Hide the auto coach tip (Arena veterans). Situation line still shows. */
  hideCoachTip?: boolean;
  className?: string;
}

export function SpotTable({
  seats,
  heroPos,
  heroCards,
  board,
  potBb,
  effStackBb,
  actionHistory,
  coachTip,
  hideCoachTip = false,
  className,
}: SpotTableProps) {
  const reduced = useReducedMotion() ?? false;
  const situation = situationLine(heroPos, actionHistory, board.length);
  const history = formatActionHistory(actionHistory, heroPos);
  const tip =
    coachTip !== undefined
      ? coachTip
      : hideCoachTip
        ? null
        : spotCoachTip(heroPos, actionHistory, board.length);

  const heroIndex = Math.max(
    seats.findIndex((seat) => seat.isHero),
    0,
  );
  const layout = seatLayout(seats.length, heroIndex);
  const heroAngle = 0;

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)} data-spot-table>
      <p
        className="text-text-primary text-body-md max-w-md text-center font-medium text-balance"
        data-situation
      >
        {situation}
      </p>

      <div
        className="relative mx-auto aspect-square w-full max-w-[min(100%,52dvh)] sm:aspect-[5/4] sm:max-w-[min(100%,calc(55dvh*1.25))]"
        role="img"
        aria-label={`Six-handed table. You are in ${heroPos}. ${situation} Pot ${potBb.toFixed(1)} big blinds, ${effStackBb.toFixed(0)} big blinds effective.`}
      >
        <TableRing activeAngle={heroAngle} />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {board.length > 0 && (
            <>
              <div className="flex flex-wrap justify-center gap-1.5 sm:hidden">
                {board.map((card, i) => (
                  <PlayingCard key={i} card={card} size="md" index={i} dealCount={board.length} />
                ))}
              </div>
              <div className="hidden flex-wrap justify-center gap-1.5 sm:flex" aria-hidden>
                {board.map((card, i) => (
                  <PlayingCard key={i} card={card} size="lg" index={i} dealCount={board.length} />
                ))}
              </div>
            </>
          )}
          <PotChip potBb={potBb} effStackBb={effStackBb} />
        </div>

        {seats.map((seat, i) => {
          const spot = layout[i];
          if (spot === undefined) return null;
          if (seat.committedBb === null) return null;

          return (
            <div
              key={`bet-${seat.seat}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${50 + (spot.left - 50) * 0.58}%`,
                top: `${50 + (spot.top - 50) * 0.58}%`,
              }}
            >
              <BetChip amount={formatCommittedBb(seat.committedBb)} />
            </div>
          );
        })}

        {seats.map((seat, i) => {
          const spot = layout[i];
          if (spot === undefined) return null;

          return (
            <div
              key={seat.seat}
              data-seat-anchor={seat.seat}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
            >
              <SpotSeat
                position={seat.position}
                stackBb={seat.stackBb}
                isHero={seat.isHero}
                action={seat.action}
                folded={seat.folded}
                toAct={seat.toAct}
                reduced={reduced}
              />
            </div>
          );
        })}
      </div>

      <p className="text-text-secondary text-body-sm max-w-md text-center" data-history>
        {history}
      </p>

      <div className="flex gap-2.5">
        {heroCards.map((card, i) => (
          <PlayingCard key={i} card={card} size="xl" index={i} dealCount={heroCards.length} />
        ))}
      </div>

      {tip !== null && tip !== "" && (
        <p
          className="border-border bg-surface-2 text-text-secondary text-body-sm max-w-md rounded-md border px-3 py-2 text-center text-balance"
          data-coach-tip
        >
          {tip}
        </p>
      )}
    </div>
  );
}

function BetChip({ amount }: { amount: string }) {
  return (
    <span className="border-border-strong bg-surface-2/90 text-body-md flex items-center gap-2 rounded-full border py-1 pr-2.5 pl-1.5 font-mono font-semibold whitespace-nowrap tabular-nums backdrop-blur-sm">
      <svg viewBox="0 0 24 24" className="block size-5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="var(--color-accent)" />
        <circle
          cx="12"
          cy="12"
          r="6.5"
          fill="none"
          stroke="var(--color-on-accent)"
          strokeOpacity="0.85"
          strokeWidth="2.4"
          strokeDasharray="4 3.2"
        />
      </svg>
      {amount}
    </span>
  );
}

function DealerButton() {
  return (
    <span
      aria-hidden
      className="bg-text-primary text-canvas text-overline flex size-4 items-center justify-center rounded-full font-bold"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      D
    </span>
  );
}

function PotChip({ potBb, effStackBb }: { potBb: number; effStackBb: number }) {
  return (
    <span className="border-border-strong bg-surface-2/80 text-body-md flex max-w-[90%] flex-col items-center rounded-full border px-3.5 py-1.5 font-mono font-semibold tabular-nums backdrop-blur-sm sm:flex-row sm:gap-2">
      <span>
        {potBb.toFixed(1)}
        <span className="text-text-tertiary ml-1">BB pot</span>
      </span>
      <span className="text-text-tertiary hidden sm:inline" aria-hidden>
        ·
      </span>
      <span className="text-text-secondary text-caption font-medium">
        {effStackBb.toFixed(0)}BB eff
      </span>
    </span>
  );
}

function SpotSeat({
  position,
  stackBb,
  isHero,
  action,
  folded,
  toAct,
  reduced,
}: {
  position: HeroPosition;
  stackBb: number;
  isHero: boolean;
  action: string | null;
  folded: boolean;
  toAct: boolean;
  reduced: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1"
      data-position={position}
      data-hero={isHero ? "true" : "false"}
      data-folded={folded ? "true" : "false"}
      data-to-act={toAct ? "true" : "false"}
    >
      <SeatAvatar seed={position} isHero={isHero} folded={folded} />

      <motion.div
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 whitespace-nowrap",
          isHero ? "border-accent bg-surface-2" : "border-border bg-surface-1",
          folded && "border-border-subtle",
        )}
        style={{ opacity: folded ? 0.45 : 1 }}
        animate={
          reduced || !isHero
            ? { boxShadow: "0 0 0 0 transparent" }
            : {
                boxShadow: [
                  "0 0 0 0 var(--color-accent-glow)",
                  "0 0 0 7px transparent",
                  "0 0 0 0 var(--color-accent-glow)",
                ],
              }
        }
        transition={
          isHero && !reduced
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.18 }
        }
      >
        <span
          className={cn(
            "text-overline font-mono uppercase",
            isHero ? "text-accent-bright" : folded ? "text-text-tertiary" : "text-text-secondary",
          )}
        >
          {position}
        </span>
        <span
          className={cn(
            "text-body-sm font-mono font-semibold tabular-nums",
            folded && "text-text-tertiary",
          )}
        >
          {stackBb.toFixed(0)}
          <span className="text-text-tertiary ml-0.5">BB</span>
        </span>
        {position === "BTN" && <DealerButton />}
      </motion.div>

      {isHero && <span className="text-accent-bright text-overline uppercase">you</span>}

      {folded && !isHero && (
        <span
          className="border-border bg-surface-1 text-text-tertiary text-caption rounded-full border px-2 py-0.5 font-medium tracking-wide uppercase"
          data-seat-status="folded"
        >
          Fold
        </span>
      )}

      {!folded && toAct && !isHero && action === null && (
        <span
          className="border-border-subtle bg-surface-1 text-text-tertiary text-caption rounded-full border px-2 py-0.5 font-medium tracking-wide uppercase"
          data-seat-status="waiting"
        >
          Waiting
        </span>
      )}

      {action !== null && !folded && (
        <motion.span
          className="border-accent/40 bg-accent/10 text-accent-bright text-body-sm rounded-full border px-2.5 py-1 whitespace-nowrap"
          data-seat-status="acted"
          initial={reduced ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={SPRING.snappy}
        >
          {actionVerb(action)}
        </motion.span>
      )}
    </div>
  );
}
