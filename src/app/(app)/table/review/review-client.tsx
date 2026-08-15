"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/motion";
import { GradeBadge } from "@/components/ui/grade-badge";
import { BoardBand, HeroDock, OpponentStrip, type OpponentSeatView } from "@/components/poker";
import { cardsFromString } from "@/poker/cards";
import { handStrength } from "@/poker/hand-strength";
import { actionLabel, actionPhrase } from "@/lib/action-label";
import { evColor } from "@/lib/ev-color";
import type { GradedDecision, ReplayStep, SessionStats } from "@/lib/sim-review";
import type { GradeName } from "@/poker/grader";
import { amountFromBb, RATE_LABEL } from "@/lib/units";

/**
 * The review: the session as a lesson.
 *
 * VPIP and PFR lead because beginners have never seen their own numbers
 * before, the worst decisions expand into replays because "you lost 4bb here"
 * without the hand attached teaches nothing, and every leak carries a button
 * that starts fixing it — insight with no next action is trivia.
 */

interface LeakRow {
  key: string;
  severity: number;
  description: string;
  drillLink: string;
  sampleSize: number;
}

interface ReviewPayload {
  stats: SessionStats;
  /** Seat-indexed bot display names, null at the hero's seat. */
  botNames?: (string | null)[];
  calibration?: { stackBb: number; graded: boolean; notice: string | null };
  worst: GradedDecision[];
  leaks: LeakRow[];
  summary: { text: string; source: string };
  hands: { handNumber: number; netBb: number; resultLine: string }[];
  replays: Record<string, ReplayStep[]>;
}

export function ReviewClient() {
  const params = useSearchParams();
  const sessionId = params.get("session");

  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [openHand, setOpenHand] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (sessionId === null) return;
    setFailed(false);
    try {
      const response = await fetch(`/api/sim/review?sessionId=${sessionId}`);
      if (!response.ok) {
        setFailed(true);
        return;
      }
      setReview((await response.json()) as ReviewPayload);
    } catch {
      setFailed(true);
    }
  }, [sessionId]);

  const retry = useCallback(() => {
    setReview(null);
    void load();
  }, [load]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (sessionId === null || failed) {
    return (
      <div className="flex flex-col items-start gap-4 py-8" role="alert" data-review-error>
        <h1 className="text-heading-lg">
          {sessionId === null ? "No session to review" : "Your session is saved"}
        </h1>
        <p className="text-text-secondary text-body-md max-w-[46ch]">
          {sessionId === null
            ? "Open a finished table session from Practice to see its review."
            : "Detailed review did not load. Your hands are still on the server — retry, or come back from the tables."}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {sessionId !== null && (
            <Button variant="primary" onClick={() => void retry()}>
              Retry review
            </Button>
          )}
          <Button variant="secondary" asChild>
            <Link href="/table">Back to the tables</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/practice">Back to Practice</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (review === null) {
    return (
      <div className="flex flex-col gap-3">
        <Shimmer className="h-24 w-full" />
        <Shimmer className="h-40 w-full" />
      </div>
    );
  }

  const { stats } = review;

  return (
    <div className="flex flex-col gap-8" data-review>
      <header>
        <h1 className="text-display-md">Session review</h1>
      </header>

      {/* Play-mode sessions carry no grades and the review says so up front,
          rather than presenting empty grading sections as a clean bill. */}
      {review.calibration !== undefined && !review.calibration.graded && (
        <p
          className="border-border bg-surface-1 text-text-secondary text-body-md rounded-md border px-3 py-2"
          data-depth-notice
        >
          {review.calibration.notice ?? "Ungraded — the strategy set is calibrated at 100bb."} This{" "}
          {review.calibration.stackBb}bb session was play-mode: results and stats are real, but no
          decision was graded.
        </p>
      )}

      {/* 1 · The numbers */}
      <section className="border-border bg-surface-1 grid grid-cols-3 gap-4 rounded-lg border p-4 sm:grid-cols-6">
        <Stat label="Hands" value={String(stats.hands)} />
        <Stat label="Net" value={amountFromBb(stats.netBb)} />
        {/* bb/100 over a short session is pure variance — a good player
            running bad reads "−180" and concludes the grader is broken. Below
            50 hands the figure is withheld, not dressed up. */}
        <Stat
          label={RATE_LABEL}
          value={stats.hands >= 50 ? stats.bb100.toFixed(1) : "—"}
          hint={stats.hands >= 50 ? undefined : "Needs 50+ hands to mean anything"}
        />
        <Stat
          label="VPIP"
          value={`${stats.vpip}%`}
          hint="How often you voluntarily put money in preflop"
        />
        <Stat label="PFR" value={`${stats.pfr}%`} hint="How often you raised preflop" />
        {/* Both directions. Wins-only quietly flattered the session. */}
        <Stat
          label="Biggest pot"
          value={`+${stats.biggestPotWonBb.toFixed(1)} / −${stats.biggestPotLostBb.toFixed(1)}`}
          hint="Largest pot won / largest pot lost"
        />
      </section>

      {/* 2 · The coach's read */}
      <section className="border-accent bg-surface-1 flex flex-col gap-2 rounded-lg border-l-2 p-4">
        <h2 className="text-overline text-text-tertiary uppercase">The one thing to fix</h2>
        <p className="text-body-lg" data-summary>
          {review.summary.text}
        </p>
      </section>

      {/* 3 · Leaks, each with a next action */}
      {review.leaks.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-heading-lg">Detected leaks</h2>
          {review.leaks.map((leak) => (
            <div
              key={leak.key}
              className="border-border bg-surface-1 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              data-leak={leak.key}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-label={`severity ${leak.severity} of 5`}
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ background: evColor(leak.severity) }}
                />
                <p className="text-body-md">{leak.description}</p>
              </div>
              <Button variant="accent" size="sm" asChild>
                <Link href={leak.drillLink}>Drill this</Link>
              </Button>
            </div>
          ))}
        </section>
      ) : (
        <p className="text-text-tertiary text-caption" data-no-leaks>
          No leak pattern yet — we need about ten similar spots before calling one out. Short
          sessions often look clean for that reason alone.
        </p>
      )}

      {/* 4 · Worst decisions, expandable into replays.
          Grades are vs the GTO chart, not vs the table's exploitative bots —
          the bots play a style; the grade measures a different standard. */}
      {review.worst.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-heading-lg">Your most expensive decisions</h2>
            <p className="text-text-tertiary text-caption mt-1">
              Graded vs chart — not vs how the bots at this table play.
            </p>
          </div>
          {/* One hand can list two decisions now (preflop AND a postflop one),
              so rows are keyed and expanded by hand + street, never hand alone. */}
          {review.worst.map((decision) => {
            const rowId = `${decision.handNumber}:${decision.street ?? "preflop"}`;
            return (
              <div key={rowId} className="border-border bg-surface-1 rounded-lg border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  aria-expanded={openHand === rowId}
                  onClick={() => setOpenHand((current) => (current === rowId ? null : rowId))}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-3">
                      <span className="text-text-tertiary text-caption font-mono">
                        #{decision.handNumber}
                      </span>
                      {decision.grade !== "" && (
                        <span className="flex items-center gap-1.5">
                          <GradeBadge grade={decision.grade as GradeName} size="sm" static />
                          <span className="text-text-tertiary text-caption">vs chart</span>
                        </span>
                      )}
                      <span className="text-body-sm">{decision.resultLine}</span>
                    </span>
                    <span className="text-text-tertiary text-caption" data-decision-detail>
                      {capitalize(decision.street ?? "preflop")}: you chose{" "}
                      {actionPhrase(decision.chosenAction)}
                      {decision.bestAction !== null &&
                        decision.bestAction !== decision.chosenAction && (
                          <> — best is {actionPhrase(decision.bestAction)}</>
                        )}
                    </span>
                  </span>
                  <span
                    className="text-body-sm font-mono tabular-nums"
                    style={{ color: evColor(decision.evLoss) }}
                  >
                    −{decision.evLoss.toFixed(2)}bb
                  </span>
                </button>

                {openHand === rowId && (
                  <Replay
                    steps={review.replays[String(decision.handNumber)] ?? []}
                    botNames={review.botNames ?? []}
                  />
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="flex gap-3">
        <Button variant="primary" size="lg" asChild>
          <Link href="/table">Play another session</Link>
        </Button>
      </div>
    </div>
  );
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <span className="flex flex-col" title={hint}>
      <span className="text-overline text-text-tertiary uppercase">{label}</span>
      <span className="text-body-lg font-mono font-semibold tabular-nums">{value}</span>
    </span>
  );
}

/**
 * Prev/next through a stored hand, drawn with the same surface bands as the
 * live table — a replayed hand and a live hand are the same game and must not
 * look like two products. Arrow keys work; the pot is the engine's.
 */
function Replay({ steps, botNames }: { steps: ReplayStep[]; botNames: (string | null)[] }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  if (step === undefined) return null;

  const hero = step.seats.find((s) => s.isHero);
  const heroCards = hero?.cards == null ? [] : cardsFromString(hero.cards);
  const board = cardsFromString(step.board);
  const heroStrength =
    heroCards.length === 2 ? handStrength(heroCards, board) : { label: "", bestFive: [] };

  const opponents: OpponentSeatView[] = step.seats
    .filter((seat) => !seat.isHero)
    .map((seat) => ({
      name: botNames[seat.seat] ?? seat.position,
      position: seat.position,
      stackBb: seat.stackChips / 2,
      isDealer: seat.position === "BTN",
      folded: seat.folded,
      betBb: seat.committedChips > 0 ? seat.committedChips / 2 : null,
      // Mucked cards never appear here because the payload never contains them.
      revealed: seat.cards === null ? null : cardsFromString(seat.cards),
    }));

  return (
    <div className="border-border flex flex-col gap-3 border-t px-4 py-3" data-replay-step={index}>
      <div className="flex items-center justify-between">
        <p className="text-body-md" data-replay-description>
          {step.description}
        </p>
        <p className="text-text-secondary text-caption font-mono tabular-nums" data-replay-pot>
          pot {(step.potChips / 2).toFixed(1)}bb
        </p>
      </div>

      <OpponentStrip seats={opponents} />

      <div data-replay-board>
        <BoardBand board={board} potBb={step.potChips / 2} />
      </div>

      {heroCards.length === 2 && (
        <div data-replay-hero>
          <HeroDock
            cards={heroCards}
            folded={hero?.folded === true}
            strengthLabel={heroStrength.label}
            bestFive={heroStrength.bestFive}
            stackBb={(hero?.stackChips ?? 0) / 2}
            betBb={hero !== undefined && hero.committedChips > 0 ? hero.committedChips / 2 : null}
          />
        </div>
      )}

      {step.decision !== null && step.decision.graded && (
        <p className="text-body-sm" data-replay-decision>
          Best here: {actionLabel(step.decision.best ?? "")}.
          {step.decision.evLoss !== null && step.decision.evLoss > 0 ? (
            <span style={{ color: evColor(step.decision.evLoss) }}>
              {" "}
              Your {actionPhrase(step.decision.chosen)} gave up {step.decision.evLoss.toFixed(2)}bb.
            </span>
          ) : (
            <span className="text-text-secondary"> You took it.</span>
          )}
        </p>
      )}
      {step.decision !== null && !step.decision.graded && step.decision.reason !== null && (
        <p className="text-text-tertiary text-caption" data-replay-ungraded>
          Not graded — {step.decision.reason.charAt(0).toLowerCase()}
          {step.decision.reason.slice(1)}
        </p>
      )}
      {step.decision === null && step.heroEvLoss !== null && step.heroEvLoss > 0 && (
        <p className="text-body-sm" style={{ color: evColor(step.heroEvLoss) }}>
          This decision gave up {step.heroEvLoss.toFixed(2)}bb.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          ← Prev
        </Button>
        <span className="text-text-tertiary text-caption font-mono tabular-nums">
          {index + 1}/{steps.length}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={index >= steps.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
