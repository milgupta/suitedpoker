"use client";

import type { ReactNode } from "react";
import type { Card } from "@/poker/cards";
import type { SeatView } from "@/poker/generator";
import type { HeroPosition } from "@/poker/solutions";
import { handStrength } from "@/poker/hand-strength";
import { actionLabel } from "@/lib/action-label";
import { amountFromBb } from "@/lib/units";
import {
  formatActionHistory,
  missingActionTip,
  situationLine,
  spotCoachTip,
  TRAINER_ACTIONS_CAPTION,
} from "@/lib/spot-situation";
import { cn } from "@/lib/utils";
import {
  ActionDock,
  BoardBand,
  GameSurface,
  HeroDock,
  OpponentStrip,
  type DockAction,
  type OpponentSeatView,
} from "./surface";

/**
 * A DRILL SPOT ON THE GAME SURFACE — DESIGN.md §6, drill flavour.
 *
 * One composition shared by the arena, the daily and the demo hand, so the
 * three cannot drift apart: same opponents strip, same board band, same hero
 * dock, same fixed action buttons. The drill-specific rules live here rather
 * than in three clients:
 *
 * - Villains are labeled by POSITION ONLY. §6.1's bot names are for the sim,
 *   where the villains are characters with sessions; a drill's villains are a
 *   solved strategy, and naming them would claim a personality the chart does
 *   not have.
 * - The action dock is FIXED LABELED BUTTONS, never a slider. Graded actions
 *   must stay exactly the chart's actions — `sizing` is deliberately absent.
 * - The situation line, history and coach tip survive from the ring era: a
 *   surface without them asks a beginner to reconstruct the hand from chips
 *   and opacity, which is the exact thing a beginner is worst at.
 *
 * Seat fold / waiting / chip state arrives on `SeatView` from `generateSpot`.
 * The client must not re-infer who folded from history strings for display —
 * that is how a legal chart decision looked like broken poker.
 */

/** The slice of a ClientSpot the surface needs. `ClientSpot` satisfies it. */
export interface DrillSpotView {
  readonly seats: readonly SeatView[];
  readonly heroPos: HeroPosition;
  readonly heroCards: readonly Card[];
  readonly board: readonly Card[];
  readonly potBb: number;
  readonly effStackBb: number;
  readonly actionHistory: readonly string[];
  readonly legalActions: readonly string[];
}

export interface DrillSurfaceProps {
  spot: DrillSpotView;
  onAction: (action: string) => void;
  /**
   * Grading is in: buttons disable, the hero glow drops, the chart's action
   * gets its outline, and the missing-action tip appears.
   */
  answered?: boolean;
  /** Extra disable while a grade is in flight (the daily's double-tap guard). */
  actionsDisabled?: boolean;
  /** The chart's most-played action, outlined on its button after grading. */
  topAction?: string | null;
  /**
   * The FrequencyCapsules row. Rendered directly above the dock — capsule
   * order and button order share `actionGridClass`, so each percentage sits
   * over the button it describes.
   */
  capsules?: ReactNode;
  /** Below the dock while the spot is open (the arena's hint button). */
  belowActions?: ReactNode;
  /** The feedback flow, docked under the hero zone after grading. */
  feedback?: ReactNode;
  /** Extra pre-decision line. Defaults to the shared coach tip for the spot. */
  coachTip?: string | null;
  /** Hide the auto coach tip (Arena veterans). Situation line still shows. */
  hideCoachTip?: boolean;
  className?: string;
}

/**
 * SeatView → the opponents strip, hero excluded. Pure and exported so the
 * mapping — who dims, who pulses, whose chips show — is an assertion in a node
 * test rather than a thing somebody notices in a screenshot.
 *
 * `toAct` (still to speak behind the hero) maps to the strip's pulse: those
 * seats are the live ones the decision has to get through. `committedBb` is
 * the chips already in front (blind or bet) and becomes the bet badge.
 */
export function drillOpponentSeats(seats: readonly SeatView[]): OpponentSeatView[] {
  return seats
    .filter((seat) => !seat.isHero)
    .map((seat) => ({
      position: seat.position,
      stackBb: seat.stackBb,
      folded: seat.folded,
      isDealer: seat.position === "BTN",
      isActing: seat.toAct && !seat.folded,
      betBb: seat.committedBb,
    }));
}

export function DrillSurface({
  spot,
  onAction,
  answered = false,
  actionsDisabled = false,
  topAction = null,
  capsules,
  belowActions,
  feedback,
  coachTip,
  hideCoachTip = false,
  className,
}: DrillSurfaceProps) {
  const situation = situationLine(spot.heroPos, spot.actionHistory, spot.board.length);
  const history = formatActionHistory(spot.actionHistory, spot.heroPos);
  const tip =
    coachTip !== undefined
      ? coachTip
      : hideCoachTip
        ? null
        : spotCoachTip(spot.heroPos, spot.actionHistory, spot.board.length);
  const strength = handStrength(spot.heroCards, spot.board);
  const heroSeat = spot.seats.find((seat) => seat.isHero);
  const opponents = drillOpponentSeats(spot.seats);
  const gapTip = answered ? missingActionTip(spot.legalActions) : null;

  const dockActions: DockAction[] = spot.legalActions.map((action) => ({
    id: action,
    label: actionLabel(action),
    disabled: answered || actionsDisabled,
    highlight: answered && action === topAction,
  }));

  return (
    <div className={cn("flex w-full flex-col", className)} data-drill-surface>
      <GameSurface
        // The (app) shell already owns the horizontal gutters; GameSurface's
        // own px-4 would double them on the one screen that is tightest.
        className="px-0"
        opponents={
          <div className="flex flex-col gap-3">
            <p
              className="text-text-primary text-body-md mx-auto max-w-md text-center font-medium text-balance"
              data-situation
            >
              {situation}
            </p>
            {/* The ring's role="img" summary, kept as prose for screen readers
                now that the seats themselves are readable text. */}
            <p className="sr-only" data-surface-summary>
              {`Six-handed table. You are in ${spot.heroPos}. ${situation} Pot ${amountFromBb(spot.potBb)} chips, ${amountFromBb(spot.effStackBb)} chips effective.`}
            </p>
            <OpponentStrip seats={opponents} />
          </div>
        }
        board={
          <div className="flex flex-col gap-2">
            <BoardBand board={spot.board} potBb={spot.potBb} />
            <p
              className="text-text-secondary text-body-sm mx-auto max-w-md text-center"
              data-history
            >
              {history}
            </p>
          </div>
        }
        hero={
          <>
            <HeroDock
              cards={spot.heroCards}
              strengthLabel={strength.label}
              bestFive={strength.bestFive}
              stackBb={spot.effStackBb}
              betBb={heroSeat?.committedBb ?? null}
              toAct={!answered}
            />
            {tip !== null && tip !== "" && (
              <p
                className="border-border bg-surface-2 text-text-secondary text-body-sm mx-auto w-full max-w-md rounded-md border px-3 py-2 text-center text-balance"
                data-coach-tip
              >
                {tip}
              </p>
            )}
          </>
        }
        actions={
          <>
            {capsules}
            <p className="text-text-tertiary text-caption text-center text-balance">
              {TRAINER_ACTIONS_CAPTION}
            </p>
            {/* No `sizing`, ever: its absence IS the drill contract. */}
            <ActionDock kind="actions" actions={dockActions} onAction={onAction} />
            {gapTip !== null && (
              <p className="text-text-tertiary text-caption text-center" data-missing-action-tip>
                {gapTip}
              </p>
            )}
            {belowActions}
            {feedback}
          </>
        }
      />
    </div>
  );
}
