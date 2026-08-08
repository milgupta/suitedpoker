"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/motion";
import { GradeBadge } from "@/components/ui/grade-badge";
import { PlayingCard } from "@/components/poker";
import { cardsFromString } from "@/poker/cards";
import { evColor } from "@/lib/ev-color";
import type { GradedDecision, ReplayStep, SessionStats } from "@/lib/sim-review";
import { cn } from "@/lib/utils";
import type { GradeName } from "@/poker/grader";

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
  const [openHand, setOpenHand] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (sessionId === null) return;
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

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (sessionId === null || failed) {
    return (
      <p className="text-text-secondary text-body-lg">
        Could not load the review.{" "}
        <Link className="text-accent-bright underline" href="/table">
          Back to the tables
        </Link>
        .
      </p>
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

      {/* 1 · The numbers */}
      <section className="border-border bg-surface-1 grid grid-cols-3 gap-4 rounded-lg border p-4 sm:grid-cols-6">
        <Stat label="Hands" value={String(stats.hands)} />
        <Stat label="Net bb" value={stats.netBb.toFixed(1)} />
        <Stat label="bb/100" value={stats.bb100.toFixed(1)} />
        <Stat
          label="VPIP"
          value={`${stats.vpip}%`}
          hint="How often you voluntarily put money in preflop"
        />
        <Stat label="PFR" value={`${stats.pfr}%`} hint="How often you raised preflop" />
        <Stat label="Biggest pot" value={`+${stats.biggestPotWonBb.toFixed(1)}`} />
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
          {review.worst.map((decision) => (
            <div key={decision.handNumber} className="border-border bg-surface-1 rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                aria-expanded={openHand === decision.handNumber}
                onClick={() =>
                  setOpenHand((current) =>
                    current === decision.handNumber ? null : decision.handNumber,
                  )
                }
              >
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
                <span
                  className="text-body-sm font-mono tabular-nums"
                  style={{ color: evColor(decision.evLoss) }}
                >
                  −{decision.evLoss.toFixed(2)}bb
                </span>
              </button>

              {openHand === decision.handNumber && (
                <Replay steps={review.replays[String(decision.handNumber)] ?? []} />
              )}
            </div>
          ))}
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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <span className="flex flex-col" title={hint}>
      <span className="text-overline text-text-tertiary uppercase">{label}</span>
      <span className="text-body-lg font-mono font-semibold tabular-nums">{value}</span>
    </span>
  );
}

/** Prev/next through a stored hand. Arrow keys work; the pot is the engine's. */
function Replay({ steps }: { steps: ReplayStep[] }) {
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

      {step.board !== "" && (
        <div className="flex gap-1.5" data-replay-board>
          {cardsFromString(step.board).map((card, i) => (
            <PlayingCard key={i} card={card} size="sm" />
          ))}
        </div>
      )}

      {(() => {
        const hero = step.seats.find((s) => s.cards !== null);
        if (hero?.cards == null) return null;
        return (
          <div className="flex items-center gap-2" data-replay-hero>
            <span className="text-text-tertiary text-caption">Your hand</span>
            <div className="flex gap-1">
              {cardsFromString(hero.cards).map((card, i) => (
                <PlayingCard key={i} card={card} size="sm" />
              ))}
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap gap-2">
        {step.seats.map((seat) => (
          <span
            key={seat.seat}
            className={cn(
              "border-border rounded-full border px-2.5 py-1 font-mono text-xs tabular-nums",
              seat.folded && "opacity-40",
            )}
          >
            {seat.position} {(seat.stackChips / 2).toFixed(0)}
            {seat.committedChips > 0 && (
              <span className="text-accent-bright"> +{(seat.committedChips / 2).toFixed(1)}</span>
            )}
          </span>
        ))}
      </div>

      {step.heroEvLoss !== null && step.heroEvLoss > 0 && (
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
