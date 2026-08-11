"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ClientSpot } from "@/poker/generator";
import type { Grade, GradeName } from "@/poker/grader";
import { Button } from "@/components/ui/button";
import { GradeBadge } from "@/components/ui/grade-badge";
import { Streak } from "@/components/ui/streak";
import { SegmentedMeter } from "@/components/ui/segmented-meter";
import { AnimatedNumber, Shimmer } from "@/components/motion";
import { Feedback, SpotTable } from "@/components/poker";
import { buildShareText, MAX_DAILY_SCORE, type DailySpotResult } from "@/lib/daily";
import { capture } from "@/lib/analytics-client";
import { cn } from "@/lib/utils";
import { actionLabel } from "@/lib/action-label";
import { actionGridClass } from "@/lib/action-grid";
import { missingActionTip, TRAINER_ACTIONS_CAPTION } from "@/lib/spot-situation";
import { APP_HOME } from "@/lib/app-chrome";

/**
 * Module scope: the React Compiler treats a Date.now() inside a component as an
 * impure read during render even when it only runs from an event handler.
 */
function nowMs(): number {
  return Date.now();
}

interface TodayAnswered {
  spotIndex: number;
  grade: string | null;
  evLoss: number;
}

interface TodayResponse {
  date: string;
  dayNumber: number;
  spots: ClientSpot[];
  answered: TodayAnswered[];
  completed: boolean;
  score: number | null;
  streak: number;
}

interface AnswerResponse extends Grade {
  spotIndex: number;
  score: number;
  answeredCount: number;
  finished: boolean;
  streak: { count: number; freezeApplied: boolean; milestone: number | null } | null;
  source?: { provenance: string; evConfidence: string } | null;
}

function hydrateResults(answered: TodayAnswered[]): DailySpotResult[] {
  return answered
    .filter((a): a is TodayAnswered & { grade: GradeName } => a.grade !== null)
    .map((a) => ({
      spotIndex: a.spotIndex,
      grade: a.grade,
      evLoss: a.evLoss,
      timeMs: 0,
    }));
}

export function DailyClient() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<AnswerResponse | null>(null);
  const [results, setResults] = useState<DailySpotResult[]>([]);
  const [score, setScore] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [answering, setAnswering] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/daily/today");
    if (!response.ok) {
      setError("Could not load today's challenge.");
      return;
    }
    const data = (await response.json()) as TodayResponse;
    const hydrated = hydrateResults(data.answered);
    setToday(data);
    setResults(hydrated);
    setScore(data.score ?? 0);
    setIndex(data.answered.length);
    setShowSummary(data.completed);
    setResult(null);
    setStartedAt(nowMs());
  }, []);

  useEffect(() => {
    capture("daily_started", {});
    void Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function answer(action: string): Promise<void> {
    if (today === null || result !== null || answering) return;
    setAnswering(true);
    setError("");

    try {
      const response = await fetch("/api/daily/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spotIndex: index, action, timeMs: nowMs() - startedAt }),
      });

      if (response.status === 409) {
        setError("You've already answered that one — no takebacks.");
        return;
      }
      if (!response.ok) {
        setError("That answer could not be graded.");
        return;
      }

      const graded = (await response.json()) as AnswerResponse;
      setResult(graded);
      setScore(graded.score);
      setResults((r) => [
        ...r,
        {
          spotIndex: graded.spotIndex,
          grade: graded.grade,
          evLoss: graded.evLoss,
          timeMs: nowMs() - startedAt,
        },
      ]);

      if (graded.finished) {
        capture("daily_completed", {
          score: graded.score,
          rank: 0,
          streak: graded.streak?.count ?? 0,
        });
        if (graded.streak?.milestone != null) {
          capture("streak_milestone", { days: graded.streak.milestone });
        }
      }
    } finally {
      setAnswering(false);
    }
  }

  function next(): void {
    if (result?.finished === true) {
      setShowSummary(true);
      setResult(null);
      return;
    }
    setResult(null);
    setIndex((i) => i + 1);
    setStartedAt(nowMs());
  }

  if (today === null) {
    /*
     * ERROR BEFORE SKELETON. With these the other way round a failed load
     * rendered a grey box forever: `setError` fires, `today` stays null, and
     * the early return means the message below is never reached. An eternal
     * skeleton is worse than an error — it gives the user nothing to do.
     */
    if (error !== "") {
      return (
        <div className="flex flex-col items-start gap-4 py-10" role="status">
          <h1 className="text-heading-lg">Today&apos;s challenge isn&apos;t ready</h1>
          <p className="text-text-secondary text-body-md max-w-[46ch]">{error}</p>
          <Button variant="primary" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      );
    }
    return <Shimmer className="h-96 w-full" />;
  }

  if (showSummary) {
    return (
      <Summary
        dayNumber={today.dayNumber}
        results={results}
        score={score}
        streak={result?.streak?.count ?? today.streak}
        freezeApplied={result?.streak?.freezeApplied ?? false}
        milestone={result?.streak?.milestone ?? null}
        copied={copied}
        onCopy={(text) => {
          void navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      />
    );
  }

  const spot = today.spots[index];
  const progressValue = result !== null ? index + 1 : index;
  const actionGapTip =
    result !== null && spot !== undefined ? missingActionTip(spot.legalActions) : null;

  return (
    <div className="flex flex-col gap-5" data-daily>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display-md">
            Daily #{today.dayNumber}
            <span className="text-text-secondary text-body-md ml-2 font-sans font-normal">
              · Decision {Math.min(index + 1, today.spots.length)} of {today.spots.length}
            </span>
          </h1>
          <p className="text-text-secondary text-body-md mt-1">
            Five spots. One attempt each. No takebacks.
          </p>
        </div>
        <Streak days={today.streak} />
      </header>

      <SegmentedMeter
        value={progressValue}
        max={today.spots.length}
        segments={today.spots.length}
        label="Daily progress"
      />

      {error !== "" && (
        <p
          role="alert"
          className="border-danger-border bg-danger-fill text-danger-bright text-body-md rounded-md border px-3 py-2"
        >
          {error}
        </p>
      )}

      {spot !== undefined && (
        <>
          {/*
            Drawn as a table, the same as the arena — a daily spot is a drill
            spot and there is no reason for the two to look like two products.

            `Card` is a BRANDED NUMBER and already the right type on the wire.
            Stringifying each one and feeding it back through cardsFromString
            threw `not a card: "43"` and blanked the whole daily behind the
            error boundary. 7.1 fixed exactly this in the arena; the same line
            survived here. SpotTable takes the cards as they arrive.
          */}
          <SpotTable
            seats={spot.seats}
            heroPos={spot.heroPos}
            heroCards={spot.heroCards}
            board={spot.board}
            potBb={spot.potBb}
            effStackBb={spot.effStackBb}
            actionHistory={spot.actionHistory}
          />

          <div className={cn("grid gap-2.5", actionGridClass(spot.legalActions.length))}>
            <p className="text-text-tertiary text-caption col-span-full text-center text-balance">
              {TRAINER_ACTIONS_CAPTION}
            </p>
            {spot.legalActions.map((action) => (
              <Button
                key={action}
                variant="action"
                size="action"
                disabled={result !== null || answering}
                data-action={action}
                onClick={() => void answer(action)}
                className="w-full"
              >
                {actionLabel(action)}
              </Button>
            ))}
          </div>

          {actionGapTip !== null && (
            <p className="text-text-tertiary text-caption text-center" data-missing-action-tip>
              {actionGapTip}
            </p>
          )}
        </>
      )}

      {/*
        Always show Feedback after an answer — including the fifth hand.
        Summary opens only when the player taps Done on that last grade.
      */}
      {result !== null && (
        <Feedback
          source={result.source}
          result={result}
          explanation={null}
          onNext={next}
          nextLabel={result.finished ? "Done" : "Next hand"}
        />
      )}
    </div>
  );
}

function Summary({
  dayNumber,
  results,
  score,
  streak,
  freezeApplied,
  milestone,
  copied,
  onCopy,
}: {
  dayNumber: number;
  results: DailySpotResult[];
  score: number;
  streak: number;
  freezeApplied: boolean;
  milestone: number | null;
  copied: boolean;
  onCopy: (text: string) => void;
}) {
  const shareText = buildShareText({ dayNumber, results, streak });

  return (
    <section className="flex flex-col gap-6" data-daily-summary>
      <header>
        <h1 className="text-display-md">Daily #{dayNumber} complete</h1>
        <p className="text-display-lg mt-2 font-mono tabular-nums">
          <AnimatedNumber value={score} suffix={`/${MAX_DAILY_SCORE}`} />
        </p>
      </header>

      {/* An announced save creates loyalty; an unannounced one teaches nothing. */}
      {freezeApplied && (
        <p className="border-grade-inaccuracy-border bg-grade-inaccuracy-fill text-body-md rounded-lg border px-4 py-3">
          You missed a day — we used your monthly streak freeze to save it. One per month.
        </p>
      )}

      {milestone !== null && (
        <p className="border-grade-best-border bg-grade-best-fill text-body-md rounded-lg border px-4 py-3">
          {milestone} days in a row. That is the habit forming.
        </p>
      )}

      <div className="flex items-center gap-4">
        <Streak days={streak} />
      </div>

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {[...results]
            .sort((a, b) => a.spotIndex - b.spotIndex)
            .map((r) => (
              <li key={r.spotIndex} className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-mono">Spot {r.spotIndex + 1}</span>
                <GradeBadge grade={r.grade as GradeName} size="sm" static />
              </li>
            ))}
        </ul>
      )}

      <div className="border-border bg-surface-1 rounded-lg border p-4">
        <p className="text-overline text-text-tertiary uppercase">Share</p>
        <pre className="text-body-md mt-2 font-mono whitespace-pre-wrap">{shareText}</pre>
        <Button
          variant="primary"
          size="lg"
          className="mt-4 w-full"
          onClick={() => onCopy(shareText)}
        >
          {copied ? "Copied" : "Copy result"}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="accent" size="lg" className="w-full" asChild>
          <Link href={APP_HOME}>Back to Practice</Link>
        </Button>
      </div>
    </section>
  );
}
