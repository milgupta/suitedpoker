"use client";

import { useEffect, useState } from "react";
import type { Action, GameState, LegalAction } from "@/poker/gamestate";
import { legalActions } from "@/poker/gamestate";
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
  className?: string;
}

/**
 * The table is a GLOWING ELLIPTICAL RING, not a felt surface.
 *
 * A filled green oval is what every casino skin does and it fights every piece
 * of data placed on top of it. A stroke on near-black keeps the board cards the
 * brightest objects on screen, which is where the eye should go.
 *
 * The glow brightens on the arc nearest whoever is to act — the table itself
 * indicates action, so no extra chrome is needed for it.
 */
function TableRing({ activeAngle }: { activeAngle: number | null }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="table-interior" cx="50%" cy="50%" r="60%">
          {/* No more than 4% lighter at the centre — any more and the ring
              stops reading as a ring. */}
          <stop offset="0%" stopColor="var(--color-surface-1)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--color-canvas)" stopOpacity="0" />
        </radialGradient>
        <filter id="table-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="50" cy="50" rx="46" ry="38" fill="url(#table-interior)" />

      <ellipse
        cx="50"
        cy="50"
        rx="46"
        ry="38"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="0.7"
        opacity="0.55"
        filter="url(#table-glow)"
        vectorEffect="non-scaling-stroke"
      />

      {activeAngle !== null && (
        // A short bright arc centred on the player to act. Rotated rather than
        // recomputed so it animates cheaply.
        <ellipse
          cx="50"
          cy="50"
          rx="46"
          ry="38"
          fill="none"
          stroke="var(--color-accent-bright)"
          strokeWidth="1.1"
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
function seatLayout(count: number, heroIndex: number): { left: number; top: number }[] {
  const positions: { left: number; top: number }[] = [];
  for (let i = 0; i < count; i++) {
    // Rotate so the hero sits at the bottom (90deg in screen terms).
    const offset = (i - heroIndex + count) % count;
    const angle = (Math.PI / 2) * 2 + (offset / count) * Math.PI * 2;
    positions.push({
      left: 50 + Math.cos(angle - Math.PI / 2) * 44,
      top: 50 + Math.sin(angle - Math.PI / 2) * 37,
    });
  }
  return positions;
}

export function PokerTable({
  state,
  heroSeat,
  onAction,
  sizedOptions,
  actionsOverride,
  context,
  className,
}: PokerTableProps) {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = (): void => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      {/* The table. Compresses to a taller ellipse on narrow screens so the
          hero's cards and the action bar keep the bottom third. */}
      <div
        className="relative w-full"
        style={{ aspectRatio: narrow ? "3 / 4" : "16 / 10" }}
        role="img"
        aria-label={`Poker table, ${state.street}, pot ${potBb.toFixed(1)} big blinds`}
      >
        <TableRing activeAngle={activeAngle} />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <BoardRunout board={state.board} street={state.street} />
          <PotDisplay amountBb={potBb} sidePots={state.sidePots} />
        </div>

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
                revealCards={i === heroSeat || state.street === "showdown"}
              />
            </div>
          );
        })}
      </div>

      {/* Bottom third: hero cards, context, then the action bar — everything
          the player touches is within one-handed reach. */}
      <div className="flex flex-col items-center gap-3">
        {hero?.holeCards != null && (
          <div className="flex gap-2">
            {hero.holeCards.map((card, i) => (
              <PlayingCard key={i} card={card} size="lg" index={i} dealCount={2} />
            ))}
          </div>
        )}

        {context !== undefined && <HandContextChip context={context} />}

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
