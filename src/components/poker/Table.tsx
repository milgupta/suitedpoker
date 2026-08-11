"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Action, GameState, LegalAction } from "@/poker/gamestate";
import { legalActions } from "@/poker/gamestate";
import { SPRING } from "@/lib/motion";
import { ActionBar, type SizedOption } from "./ActionBar";
import { BoardRunout } from "./BoardRunout";
import { HandContextChip, type HandContext } from "./HandContextChip";
import { PlayingCard } from "./PlayingCard";
import { PotDisplay } from "./PotDisplay";
import { Seat } from "./Seat";
import { cn } from "@/lib/utils";

export interface PokerTableProps {
  state: GameState;
  /** Seat index the player occupies. */
  heroSeat: number;
  onAction?: (action: Action) => void;
  sizedOptions?: readonly SizedOption[];
  /**
   * Server-supplied legal actions, for callers whose `state` is a client VIEW
   * rather than the authoritative game — the table sim, whose client never
   * holds enough state to compute legality (that is the point of the view).
   * When absent, computed locally as before.
   */
  actionsOverride?: readonly LegalAction[];
  context?: HandContext;
  /** Optional seat → archetype label (Station / Nit / TAG) for the sim. */
  seatTags?: Readonly<Record<number, string>>;
  className?: string;
}

/**
 * The table: a FILLED oval with a lit double rim.
 *
 * It was a bare stroke on near-black, on the argument that a felt surface
 * fights the data placed on it. That argument is about GREEN felt — a big
 * saturated field under a range grid genuinely does destroy it. A deep indigo
 * well, two shades off the canvas, does the opposite: it gives the ring an
 * inside and an outside, so the seats read as sitting AROUND something and the
 * board reads as sitting ON something. Every poker product does this, and the
 * bare stroke read as a diagram of a table rather than a table.
 *
 * The rim is doubled — a bright hairline with a soft outer bloom and a dimmer
 * inner line — because a single stroke at this scale reads as an outline and
 * two read as an edge with depth.
 *
 * The glow brightens on the arc nearest whoever is to act, so the table itself
 * indicates action and no extra chrome is needed for it.
 */
export function TableRing({ activeAngle }: { activeAngle: number | null }) {
  const RX = 46;
  const RY = 38;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/*
         * Lit from above, like a lamp over a table. Both stops come from the
         * accent ladder rather than a new colour: the well is the brand's own
         * blue at its darkest, which keeps it out of the grade ramp's range.
         */}
        <radialGradient id="table-felt" cx="50%" cy="38%" r="72%">
          <stop offset="0%" stopColor="var(--color-accent-950)" stopOpacity="0.95" />
          <stop offset="62%" stopColor="var(--color-accent-950)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-canvas-deep)" stopOpacity="0.9" />
        </radialGradient>
        <filter id="table-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="table-rim-bloom" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <ellipse cx="50" cy="50" rx={RX} ry={RY} fill="url(#table-felt)" />

      {/* Outer bloom, then the hairline that sits inside it. */}
      <ellipse
        cx="50"
        cy="50"
        rx={RX}
        ry={RY}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.4"
        opacity="0.45"
        filter="url(#table-rim-bloom)"
        vectorEffect="non-scaling-stroke"
      />
      <ellipse
        cx="50"
        cy="50"
        rx={RX}
        ry={RY}
        fill="none"
        stroke="var(--color-accent-bright)"
        strokeWidth="1"
        opacity="0.8"
        vectorEffect="non-scaling-stroke"
      />
      {/* The inner line. Its inset is a fraction of each radius, so the gap
          stays even all the way round however the container is stretched. */}
      <ellipse
        cx="50"
        cy="50"
        rx={RX * 0.94}
        ry={RY * 0.93}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="0.6"
        opacity="0.4"
        vectorEffect="non-scaling-stroke"
      />

      {activeAngle !== null && (
        // A short bright arc centred on the player to act. Rotated rather than
        // recomputed so it animates cheaply.
        <ellipse
          cx="50"
          cy="50"
          rx={RX}
          ry={RY}
          fill="none"
          stroke="var(--color-accent-bright)"
          strokeWidth="1.8"
          strokeLinecap="round"
          filter="url(#table-glow)"
          vectorEffect="non-scaling-stroke"
          pathLength={100}
          strokeDasharray="12 88"
          strokeDashoffset={100 - activeAngle}
          style={{ transition: "stroke-dashoffset 260ms var(--ease-standard)" }}
        />
      )}
    </svg>
  );
}

/** Seat positions around the ellipse, as percentages. Hero is always bottom. */
export function seatLayout(count: number, heroIndex: number): { left: number; top: number }[] {
  const positions: { left: number; top: number }[] = [];
  for (let i = 0; i < count; i++) {
    // Rotate so the hero sits at the bottom (90deg in screen terms).
    // Radii kept inside ~40/34 so side pills do not collide on short viewports.
    const offset = (i - heroIndex + count) % count;
    const angle = (Math.PI / 2) * 2 + (offset / count) * Math.PI * 2;
    positions.push({
      left: 50 + Math.cos(angle - Math.PI / 2) * 40,
      top: 50 + Math.sin(angle - Math.PI / 2) * 34,
    });
  }
  return positions;
}

/**
 * How far bet chips sit toward the pot from their seat.
 *
 * Same factor the drill table uses. Chips that lived under the seat pill shared
 * its percentage and covered the flop on a phone; pulling them in keeps amount
 * next to the seat without painting over the board.
 */
const BET_CHIP_INSET = 0.58;

/** One sentence above the buttons: whose turn, and how much to call. */
export function heroActionLine(
  state: GameState,
  heroSeat: number,
  actions: readonly LegalAction[],
): string | null {
  if (state.complete || state.actionOn !== heroSeat) return null;
  const bb = state.config.bigBlind;
  const call = actions.find((a) => a.type === "call");
  if (call?.amount !== undefined && bb > 0) {
    return `Your turn — ${(call.amount / bb).toFixed(1)} BB to call.`;
  }
  if (actions.some((a) => a.type === "check")) {
    return "Your turn — check or bet.";
  }
  return "Your turn.";
}

export function PokerTable({
  state,
  heroSeat,
  onAction,
  sizedOptions,
  actionsOverride,
  context,
  seatTags,
  className,
}: PokerTableProps) {
  const reduced = useReducedMotion() ?? false;
  const bigBlind = state.config.bigBlind;
  const layout = seatLayout(state.players.length, heroSeat);
  const heroTurn = state.actionOn === heroSeat && !state.complete;
  const actions = actionsOverride ?? (state.complete ? [] : legalActions(state));

  const activeAngle =
    state.actionOn === null
      ? null
      : (((state.actionOn - heroSeat + state.players.length) % state.players.length) /
          state.players.length) *
        100;

  const potBb = bigBlind > 0 ? state.pot / bigBlind : 0;
  const hero = state.players[heroSeat];
  const prompt = heroActionLine(state, heroSeat, actions);
  const showSidePots =
    state.street === "showdown" || state.players.some((p) => p.status === "allin");

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {/*
       * Pot sits ABOVE the ring, never inside it. Inside the oval it fought
       * the BB seat (above the board) or the hero seat (below) — there is no
       * safe band between those two on a phone. Outside, it stays readable.
       */}
      <div className="mx-auto flex w-full max-w-[min(100%,48dvh)] flex-col items-center gap-2 sm:max-w-[min(100%,calc(52dvh*1.6))]">
        <PotDisplay
          amountBb={potBb}
          bigBlind={bigBlind}
          sidePots={state.sidePots}
          showSidePots={showSidePots}
        />

        {/* Cap height so the decision dock stays above the fold on short laptops. */}
        <div
          className="relative aspect-[3/4] w-full sm:aspect-[16/10]"
          role="img"
          aria-label={`Poker table, ${state.street}, pot ${potBb.toFixed(1)} big blinds`}
        >
          <TableRing activeAngle={activeAngle} />

          <div className="absolute inset-0 flex items-center justify-center">
            <BoardRunout board={state.board} street={state.street} />
          </div>

          {/* Bet chips, radially inset — same geometry as SpotTable. */}
          {state.players.map((player, i) => {
            const pos = layout[i];
            if (pos === undefined || bigBlind <= 0) return null;
            const betBb = player.committedThisStreet / bigBlind;
            if (betBb <= 0) return null;
            return (
              <div
                key={`bet-${player.seat}`}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${50 + (pos.left - 50) * BET_CHIP_INSET}%`,
                  top: `${50 + (pos.top - 50) * BET_CHIP_INSET}%`,
                }}
                data-bet-chip={player.seat}
              >
                <SimBetChip amountBb={betBb} reduced={reduced} />
              </div>
            );
          })}

          {state.players.map((player, i) => {
            const pos = layout[i];
            if (pos === undefined) return null;
            return (
              <div
                key={player.seat}
                data-seat-anchor={player.seat}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              >
                <Seat
                  player={player}
                  isHero={i === heroSeat}
                  isActive={state.actionOn === i}
                  bigBlind={bigBlind}
                  // Hero cards are the large pair below the ring — not a second
                  // pair on the seat. Villains reveal only at showdown.
                  revealCards={i !== heroSeat && state.street === "showdown"}
                  showHoleCards={i !== heroSeat}
                  tag={seatTags?.[player.seat] ?? null}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom third: hero cards, context, then the action bar — everything
          the player touches is within one-handed reach. */}
      <div className="flex flex-col items-center gap-3">
        {hero?.holeCards != null && (
          <div className="flex gap-2">
            {hero.holeCards.map((card, i) => (
              <PlayingCard key={i} card={card} size="xl" index={i} dealCount={2} />
            ))}
          </div>
        )}

        {context !== undefined && <HandContextChip context={context} />}

        {prompt !== null && (
          <p className="text-text-primary text-body-md text-center font-medium" data-action-prompt>
            {prompt}
          </p>
        )}

        <ActionBar
          legalActions={actions}
          sizedOptions={sizedOptions}
          potBb={potBb}
          bigBlind={bigBlind}
          disabled={!heroTurn}
          onAction={(action) => onAction?.(action)}
          className="w-full"
        />
      </div>
    </div>
  );
}

function SimBetChip({ amountBb, reduced }: { amountBb: number; reduced: boolean }) {
  const label = `${amountBb.toFixed(amountBb < 10 ? 1 : 0)}BB`;
  return (
    <motion.span
      className="border-border-strong bg-surface-2/90 text-body-md flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1.5 font-mono font-semibold whitespace-nowrap tabular-nums backdrop-blur-sm"
      initial={reduced ? false : { opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={SPRING.snappy}
    >
      <svg viewBox="0 0 24 24" className="block size-5 shrink-0" aria-hidden="true">
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
      {label}
    </motion.span>
  );
}
