"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClientSpot } from "@/poker/generator";
import type { Grade } from "@/poker/grader";
import { Button } from "@/components/ui/button";
import { GradeBadge } from "@/components/ui/grade-badge";
import { Shimmer } from "@/components/motion";
import { AnimatedNumber } from "@/components/motion";
import {
  Explanation,
  Feedback,
  FrequencyCapsules,
  HintButton,
  PlayingCard,
} from "@/components/poker";
import type { HintLine } from "@/components/poker";
import type { HintLevel } from "@/lib/hints";
import { parseArenaPreset, type ArenaPreset } from "@/lib/arena-preset";
import { capture } from "@/lib/analytics-client";
import { GRADES } from "@/lib/grade";
import { cardsFromString } from "@/poker/cards";
import { evColor } from "@/lib/ev-color";

interface Answered {
  spot: ClientSpot;
  result: Grade;
  action: string;
}

const DEFAULT_PRESET: ArenaPreset = { config: { type: "preflop" } };

/**
 * Module scope on purpose. The React Compiler treats a Date.now() call inside a
 * component as an impure read during render, even when it only ever runs from
 * an event handler — hoisting it out is the honest fix rather than a suppression.
 */
function nowMs(): number {
  return Date.now();
}

export function ArenaClient() {
  const router = useRouter();
  const params = useSearchParams();

  // An invalid preset falls back to the endless session rather than erroring —
  // this value arrives in a shared URL and gets mangled.
  const preset = useMemo(() => parseArenaPreset(params.get("preset")) ?? DEFAULT_PRESET, [params]);

  const [spotId, setSpotId] = useState<string | null>(null);
  const [spot, setSpot] = useState<ClientSpot | null>(null);
  const [result, setResult] = useState<(Grade & { ratingDelta?: number }) | null>(null);
  const [answeredAction, setAnsweredAction] = useState<string | null>(null);
  const [history, setHistory] = useState<Answered[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const startedAt = useRef(0);
  const [finished, setFinished] = useState(false);
  const [hintsRemaining, setHintsRemaining] = useState<number | null>(null);
  const hintLevel = useRef(0);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult(null);
    setAnsweredAction(null);

    try {
      const response = await fetch("/api/drills/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: preset.config }),
      });

      if (!response.ok) {
        setError(
          response.status === 402
            ? "Your subscription has lapsed."
            : "Could not load the next hand. Try again.",
        );
        return;
      }

      const data = (await response.json()) as { spotId: string; spot: ClientSpot };
      setSpotId(data.spotId);
      setSpot(data.spot);
      hintLevel.current = 0;
      startedAt.current = nowMs();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [preset.config]);

  useEffect(() => {
    capture("drill_started", {
      source: preset.label ?? "arena",
      config: preset.config.type,
    });

    // Deferred to a microtask so the fetch's setState does not run synchronously
    // inside the effect, which cascades renders. Runs once per mount by design —
    // re-running on every render would burn spots.
    void Promise.resolve().then(loadNext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function answer(action: string): Promise<void> {
    if (spotId === null || spot === null || result !== null) return;

    const response = await fetch("/api/drills/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spotId, action, timeMs: nowMs() - startedAt.current }),
    });

    if (!response.ok) {
      setError("That hand could not be graded.");
      return;
    }

    const graded = (await response.json()) as Grade & {
      ratingDelta: number;
      hintsUsed?: number;
    };
    setResult(graded);
    setAnsweredAction(action);
    setHistory((h) => [...h, { spot, result: graded, action }]);

    capture("drill_answered", {
      grade: graded.grade,
      evLoss: graded.evLoss,
      timeMs: nowMs() - startedAt.current,
      difficulty: spot.difficulty,
      hintsUsed: graded.hintsUsed ?? hintLevel.current,
    });
  }

  /**
   * The level is tracked here only so the analytics event can carry it. The
   * rating penalty is computed server-side from the session, because a client
   * that reports its own hint usage will eventually report zero.
   */
  async function requestHint(level: HintLevel): Promise<HintLine | null> {
    if (spotId === null) return null;

    try {
      const response = await fetch("/api/coach/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spotId, level }),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        level: HintLevel;
        text: string;
        source: string;
        hintsRemaining: number;
      };

      setHintsRemaining(data.hintsRemaining);
      if (data.source !== "exhausted") hintLevel.current = Math.max(hintLevel.current, data.level);

      capture("coach_hint_requested", { level: data.level, source: data.source });

      return { level: data.level, text: data.text };
    } catch {
      return null;
    }
  }

  function next(): void {
    const played = history.length;
    if (preset.length !== undefined && played >= preset.length) {
      setFinished(true);
      return;
    }
    void loadNext();
  }

  // ── Session HUD figures ────────────────────────────────────────────────────
  const hands = history.length;
  const accuracy =
    hands === 0
      ? 0
      : (history.filter(
          (h) =>
            h.result.grade === "best" || h.result.grade === "sharp" || h.result.grade === "solid",
        ).length /
          hands) *
        100;
  const bbLost = history.reduce((sum, h) => sum + h.result.evLoss, 0);
  const sharpCount = history.filter((h) => h.result.grade === "sharp").length;
  const streak = (() => {
    let n = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const g = history[i]?.result.grade;
      if (g === "best" || g === "sharp") n++;
      else break;
    }
    return n;
  })();

  if (finished) {
    return (
      <SessionSummary
        history={history}
        returnTo={preset.returnTo}
        onRestart={() => {
          setHistory([]);
          setFinished(false);
          void loadNext();
        }}
        onReturn={(to) => router.push(to)}
      />
    );
  }

  const capsuleSegments =
    result === null
      ? []
      : Object.entries(result.frequencies)
          .map(([action, freq]) => ({
            action,
            freq,
            evLoss: result.alternativeActions.find((a) => a.action === action)?.evLoss ?? 0,
          }))
          .sort((a, b) => b.freq - a.freq);

  return (
    <div className="flex flex-col gap-5">
      {/* Session HUD */}
      <div className="border-border bg-surface-1 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3">
        {preset.label !== undefined && (
          <span className="border-accent text-accent-bright text-caption rounded-full border px-3 py-1">
            Practising: {preset.label}
          </span>
        )}
        <Hud label="Hands" value={hands} />
        <Hud label="Accuracy" value={accuracy} decimals={0} suffix="%" />
        <Hud label="bb lost" value={bbLost} decimals={2} />
        <Hud label="Streak" value={streak} />
        <Hud label="Sharp" value={sharpCount} />
        {preset.length !== undefined && (
          <span className="text-text-tertiary text-caption font-mono">
            {hands} / {preset.length}
          </span>
        )}
      </div>

      {error !== "" && (
        <p
          role="alert"
          className="border-danger-border bg-danger-fill text-danger-bright text-body-md rounded-md border px-3 py-2"
        >
          {error}
        </p>
      )}

      {loading || spot === null ? (
        <div className="flex flex-col gap-3">
          <Shimmer className="h-64 w-full" />
          <Shimmer className="h-14 w-full" />
        </div>
      ) : (
        <>
          <SpotView spot={spot} />

          {/* Frequency capsules sit directly above the buttons and are hidden
              until the answer is in — revealing them earlier would give away
              the strategy before the decision. */}
          {result !== null && (
            <FrequencyCapsules segments={capsuleSegments} topAction={result.topAction} revealed />
          )}

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
                style={
                  result !== null && action === result.topAction
                    ? {
                        borderColor: "var(--color-accent)",
                        boxShadow: "0 0 16px var(--color-accent-glow)",
                      }
                    : undefined
                }
              >
                {action}
              </Button>
            ))}
          </div>

          {result === null && spotId !== null && (
            <HintButton
              key={spotId}
              onRequest={requestHint}
              hintsRemaining={hintsRemaining}
              disabled={result !== null}
            />
          )}

          {result !== null && (
            <Feedback
              result={result}
              ratingDelta={result.ratingDelta ?? 0}
              onNext={next}
              explanation={
                spotId === null ? undefined : (
                  <Explanation
                    key={spotId}
                    spotId={spotId}
                    action={answeredAction ?? ""}
                    grade={result.grade}
                  />
                )
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function Hud({
  label,
  value,
  decimals = 0,
  suffix = "",
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  return (
    <span className="flex flex-col">
      <span className="text-overline text-text-tertiary uppercase">{label}</span>
      <span className="text-body-md font-mono font-semibold tabular-nums">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </span>
    </span>
  );
}

function SpotView({ spot }: { spot: ClientSpot }) {
  const hero = cardsFromString(spot.heroCards.map(String).join(" "));

  return (
    <div className="border-border bg-surface-1 flex flex-col items-center gap-4 rounded-lg border p-5">
      <div className="text-text-tertiary text-caption flex flex-wrap justify-center gap-x-4 font-mono">
        <span>{spot.heroPos}</span>
        <span>{spot.potBb.toFixed(1)}BB pot</span>
        <span>{spot.effStackBb.toFixed(0)}BB eff</span>
      </div>

      {spot.actionHistory.length > 0 && (
        <p className="text-text-secondary text-body-sm text-center">
          {spot.actionHistory.join(" · ")}
        </p>
      )}

      <div className="flex gap-2">
        {hero.map((card, i) => (
          <PlayingCard key={i} card={card} size="lg" index={i} dealCount={hero.length} />
        ))}
      </div>

      {spot.board.length > 0 && (
        <div className="flex gap-2">
          {cardsFromString(spot.board.map(String).join(" ")).map((card, i) => (
            <PlayingCard key={i} card={card} size="md" index={i} dealCount={spot.board.length} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionSummary({
  history,
  returnTo,
  onRestart,
  onReturn,
}: {
  history: Answered[];
  returnTo?: string;
  onRestart: () => void;
  onReturn: (to: string) => void;
}) {
  const hands = history.length;
  const good = history.filter(
    (h) => h.result.grade === "best" || h.result.grade === "sharp" || h.result.grade === "solid",
  ).length;
  const accuracy = hands === 0 ? 0 : (good / hands) * 100;
  const totalLoss = history.reduce((sum, h) => sum + h.result.evLoss, 0);
  const per100 = hands === 0 ? 0 : (totalLoss / hands) * 100;

  const distribution = GRADES.map((grade) => ({
    grade,
    count: history.filter((h) => h.result.grade === grade).length,
  }));

  const worst = [...history].sort((a, b) => b.result.evLoss - a.result.evLoss).slice(0, 3);

  useEffect(() => {
    capture("session_ended", { hands, accuracy, evLostPer100: per100 });
  }, [hands, accuracy, per100]);

  return (
    <section className="border-border bg-surface-1 flex flex-col gap-6 rounded-lg border p-5">
      <h2 className="text-display-md">Session complete</h2>

      <div className="grid grid-cols-3 gap-4">
        <Hud label="Hands" value={hands} />
        <Hud label="Accuracy" value={accuracy} decimals={0} suffix="%" />
        {/* bb/100 and accuracy only — never a dollar figure. */}
        <Hud label="bb lost /100" value={per100} decimals={1} />
      </div>

      <div>
        <p className="text-overline text-text-tertiary uppercase">Grades</p>
        <div className="mt-2 flex flex-col gap-1">
          {distribution
            .filter((d) => d.count > 0)
            .map((d) => (
              <div key={d.grade} className="flex items-center gap-3">
                <span className="w-24">
                  <GradeBadge grade={d.grade} size="sm" static />
                </span>
                <span
                  className="h-3 rounded-full"
                  style={{
                    width: `${(d.count / Math.max(hands, 1)) * 100}%`,
                    minWidth: 4,
                    background: `var(--color-grade-${d.grade})`,
                  }}
                />
                <span className="text-caption font-mono tabular-nums">{d.count}</span>
              </div>
            ))}
        </div>
      </div>

      {worst.length > 0 && (
        <div>
          <p className="text-overline text-text-tertiary uppercase">Worst hands</p>
          <ul className="mt-2 flex flex-col gap-2">
            {worst.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-body-sm font-mono">
                  {h.spot.heroPos} · {h.action}
                </span>
                <span
                  className="text-body-sm font-mono tabular-nums"
                  style={{ color: evColor(h.result.evLoss) }}
                >
                  −{h.result.evLoss.toFixed(2)}bb
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="lg" onClick={onRestart}>
          Play again
        </Button>
        {returnTo !== undefined && (
          <Button variant="ghost" size="lg" onClick={() => onReturn(returnTo)}>
            Back
          </Button>
        )}
      </div>
    </section>
  );
}
