"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientSpot } from "@/poker/generator";
import type { Grade, GradeName } from "@/poker/grader";
import { Button } from "@/components/ui/button";
import { GradeBadge } from "@/components/ui/grade-badge";
import { Streak } from "@/components/ui/streak";
import { SegmentedMeter } from "@/components/ui/segmented-meter";
import { AnimatedNumber, Shimmer } from "@/components/motion";
import { Feedback, PlayingCard } from "@/components/poker";
import { buildShareText, MAX_DAILY_SCORE, type DailySpotResult } from "@/lib/daily";
import { capture } from "@/lib/analytics-client";
import { cardsFromString } from "@/poker/cards";

/**
 * Module scope: the React Compiler treats a Date.now() inside a component as an
 * impure read during render even when it only runs from an event handler.
 */
function nowMs(): number {
  return Date.now();
}

interface TodayResponse {
  date: string;
  dayNumber: number;
  spots: ClientSpot[];
  answered: { spotIndex: number; grade: string | null }[];
  completed: boolean;
  streak: number;
}

interface AnswerResponse extends Grade {
  spotIndex: number;
  score: number;
  answeredCount: number;
  finished: boolean;
  streak: { count: number; freezeApplied: boolean; milestone: number | null } | null;
}

export function DailyClient() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<AnswerResponse | null>(null);
  const [results, setResults] = useState<DailySpotResult[]>([]);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/daily/today");
    if (!response.ok) {
      setError("Could not load today's challenge.");
      return;
    }
    const data = (await response.json()) as TodayResponse;
    setToday(data);
    setIndex(data.answered.length);
    setStartedAt(nowMs());
  }, []);

  useEffect(() => {
    capture("daily_started", {});
    void Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function answer(action: string): Promise<void> {
    if (today === null || result !== null) return;

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
  }

  function next(): void {
    setResult(null);
    setIndex((i) => i + 1);
    setStartedAt(nowMs());
  }

  if (today === null) {
    return <Shimmer className="h-96 w-full" />;
  }

  const finished = result?.finished === true || today.completed;
  const spot = today.spots[index];

  if (finished) {
    return (
      <Summary
        dayNumber={today.dayNumber}
        results={results}
        score={result?.score ?? 0}
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

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-display-md">Daily #{today.dayNumber}</h1>
          <p className="text-text-secondary text-body-md mt-1">
            Five spots. One attempt each. No takebacks.
          </p>
        </div>
        <Streak days={today.streak} />
      </header>

      <SegmentedMeter
        value={index}
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
          <div className="border-border bg-surface-1 flex flex-col items-center gap-4 rounded-lg border p-5">
            <div className="text-text-tertiary text-caption flex gap-4 font-mono">
              <span>{spot.heroPos}</span>
              <span>{spot.potBb.toFixed(1)}BB pot</span>
            </div>
            {spot.actionHistory.length > 0 && (
              <p className="text-text-secondary text-body-sm text-center">
                {spot.actionHistory.join(" · ")}
              </p>
            )}
            <div className="flex gap-2">
              {cardsFromString(spot.heroCards.map(String).join(" ")).map((card, i) => (
                <PlayingCard key={i} card={card} size="lg" index={i} dealCount={2} />
              ))}
            </div>
          </div>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${spot.legalActions.length}, minmax(0, 1fr))` }}
          >
            {spot.legalActions.map((action) => (
              <Button
                key={action}
                variant="action"
                size="action"
                disabled={result !== null}
                onClick={() => void answer(action)}
                className="w-full"
              >
                {action}
              </Button>
            ))}
          </div>
        </>
      )}

      {result !== null && !result.finished && <Feedback result={result} onNext={next} />}
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
    <section className="flex flex-col gap-6">
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
    </section>
  );
}
