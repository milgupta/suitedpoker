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
  CoachChat,
  DrillSurface,
  Explanation,
  Feedback,
  FrequencyCapsules,
  HintButton,
} from "@/components/poker";
import type { HintLine } from "@/components/poker";
import type { HintLevel } from "@/lib/hints";
import { parseArenaPreset, type ArenaPreset } from "@/lib/arena-preset";
import { capture } from "@/lib/analytics-client";
import { GRADES } from "@/lib/grade";
import { actionLabel } from "@/lib/action-label";
import { capsuleSegments } from "@/lib/action-grid";
import { evColor } from "@/lib/ev-color";

interface Answered {
  spot: ClientSpot;
  result: Grade;
  action: string;
}

type SourceQuality = { provenance: string; evConfidence: string };

interface NextSpotData {
  spotId: string;
  spot: ClientSpot;
  leakTag?: string | null;
}

/**
 * The open Arena deals 20-hand sessions, not an endless feed. Endless was the
 * old default, which made the fully-built SessionSummary unreachable from the
 * main practice mode — nobody ever saw their accuracy, distribution or worst
 * hands without arriving through a deep link. Twenty ends at a summary with
 * "Keep going" starting a fresh twenty; deep-linked presets keep whatever
 * length (or endlessness) they asked for.
 */
const DEFAULT_PRESET: ArenaPreset = { config: { type: "preflop" }, length: 20 };

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
  const [result, setResult] = useState<
    (Grade & { ratingDelta?: number; source?: SourceQuality | null }) | null
  >(null);
  const [answeredAction, setAnsweredAction] = useState<string | null>(null);
  const [history, setHistory] = useState<Answered[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [leakFocus, setLeakFocus] = useState<string | null>(null);
  const startedAt = useRef(0);
  const [finished, setFinished] = useState(false);
  const [hintsRemaining, setHintsRemaining] = useState<number | null>(null);
  /** 4.4's chat is scoped to one attempt, so it needs the row's id. */
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const hintLevel = useRef(0);
  /** Set in `next()` before fetch — never read a render-time ref copy. */
  const advancingRef = useRef(false);
  /**
   * The next spot, requested the moment an answer is graded — while the user
   * reads their feedback. That reading time used to be pure idle, and then
   * "Next hand" paid the whole server round trip on the click. With the
   * prefetch, the click usually swaps a spot that is already here. Resolves to
   * null on any failure so a stored rejection can never surface as an
   * unhandled one; loadNext retries with a fresh fetch in that case.
   */
  const prefetchRef = useRef<Promise<NextSpotData | null> | null>(null);

  const fetchNextSpot = useCallback(async (): Promise<NextSpotData> => {
    const response = await fetch("/api/drills/next", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: preset.config }),
    });
    if (!response.ok) {
      throw new Error(response.status === 402 ? "lapsed" : "load_failed");
    }
    return (await response.json()) as NextSpotData;
  }, [preset.config]);

  const applySpot = useCallback((data: NextSpotData) => {
    setResult(null);
    setAnsweredAction(null);
    setAttemptId(null);
    setChatOpen(false);
    setSpotId(data.spotId);
    setSpot(data.spot);
    setLeakFocus(data.leakTag ?? null);
    hintLevel.current = 0;
    startedAt.current = nowMs();
  }, []);

  const loadNext = useCallback(async () => {
    // Remember whether we were leaving a graded hand. Clearing the grade
    // before the fetch succeeds used to leave a burned spot playable again —
    // the buttons came back, /answer said already_answered, and the only
    // recovery was a full refresh.
    const advancing = advancingRef.current;

    setLoading(true);
    setError("");

    try {
      // A prefetched spot swaps in immediately; a failed or absent prefetch
      // falls back to fetching now.
      const prefetched = prefetchRef.current === null ? null : await prefetchRef.current;
      prefetchRef.current = null;
      const data = prefetched ?? (await fetchNextSpot());
      applySpot(data);
    } catch (error) {
      setError(
        error instanceof Error && error.message === "lapsed"
          ? "Your subscription has lapsed."
          : "Could not load the next hand. Try again.",
      );
      if (advancing) {
        setSpot(null);
        setSpotId(null);
        setResult(null);
        setAnsweredAction(null);
        setAttemptId(null);
      }
    } finally {
      advancingRef.current = false;
      setLoading(false);
    }
  }, [fetchNextSpot, applySpot]);

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
      attemptId?: string | null;
      source?: SourceQuality | null;
    };
    setResult(graded);
    setAttemptId(graded.attemptId ?? null);
    setAnsweredAction(action);
    setHistory((h) => [...h, { spot, result: graded, action }]);

    // Start fetching the next spot NOW, while the feedback is being read —
    // unless this answer just completed a fixed-length session, where dealing
    // another hand would burn a spot nobody will play.
    const playedAfterThis = history.length + 1;
    if (preset.length === undefined || playedAfterThis < preset.length) {
      prefetchRef.current = fetchNextSpot().catch(() => null);
    }

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
    // Re-entry guard: the Space shortcut and a slow advance can otherwise
    // stack a second fetch on top of the first.
    if (loading || advancingRef.current) return;
    const played = history.length;
    if (preset.length !== undefined && played >= preset.length) {
      setFinished(true);
      return;
    }
    advancingRef.current = true;
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

  /*
   * Built from `legalActions`, in that order, and NEVER sorted.
   *
   * Each capsule is read as the frequency of the button directly under it. This
   * was sorted descending by frequency while the buttons stayed in node order,
   * so a hand the solver calls 60% of the time printed "60%" above Fold. The
   * screen was telling a paying user the opposite of the strategy it had just
   * graded them against.
   */
  const segments =
    result === null || spot === null ? [] : capsuleSegments(spot.legalActions, result);

  return (
    <div className="flex flex-col gap-4">
      {/*
       * The session HUD, as ONE quiet line rather than a bordered card of five
       * stat tiles.
       *
       * It used to be a filled box taking the top sixth of the screen, and at
       * the start of a session every figure in it was a zero — so the largest,
       * most structured object above the hand was a box of nothing. The hand is
       * what the screen is for; the running totals are glanceable context and
       * should look like it.
       */}
      <div className="text-text-tertiary flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {preset.label !== undefined && (
          <span className="border-accent text-accent-bright text-caption rounded-full border px-3 py-0.5">
            {preset.label}
          </span>
        )}
        {leakFocus !== null && (
          <span
            className="border-border text-text-secondary text-caption rounded-full border px-3 py-0.5"
            data-leak-focus={leakFocus}
          >
            Focusing on {leakFocusLabel(leakFocus)}
          </span>
        )}
        {hands === 0 ? (
          <span className="text-text-secondary text-body-sm" data-arena-goal>
            {leakFocus !== null
              ? `Focus: ${leakFocusLabel(leakFocus)}`
              : preset.label !== undefined
                ? `Session: ${preset.label}`
                : "Play a hand — metrics appear after your first decision."}
          </span>
        ) : (
          <>
            <Hud label="Hands" value={hands} />
            <Hud label="Accuracy" value={accuracy} decimals={0} suffix="%" />
            <Hud label="Streak" value={streak} />
            {/* bb lost and Sharp sit in the secondary line — three above the fold
                on 390px, the rest available without crowding the table. */}
            <span className="text-text-tertiary flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.9em]">
              <Hud label="bb lost" value={bbLost} decimals={2} />
              <Hud label="Sharp" value={sharpCount} />
            </span>
          </>
        )}
        {preset.length !== undefined && (
          <span className="text-caption font-mono">
            {hands} / {preset.length}
          </span>
        )}
      </div>

      {error !== "" && (
        <div
          role="alert"
          className="border-danger-border bg-danger-fill text-danger-bright flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-body-md">{error}</p>
          {spot === null && (
            <Button variant="primary" size="sm" onClick={() => void loadNext()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {/* Error first: a failed load must never sit behind an eternal skeleton.
          The skeleton renders only when there is NO spot on screen (first
          load, or a failed advance) — while a slow next-spot request runs, the
          just-played table stays up instead of collapsing into shimmer. */}
      {error !== "" && spot === null ? null : spot === null ? (
        /*
         * The skeleton mirrors DrillSurface's GEOMETRY, not just its
         * existence: situation line, opponents strip, board band (five slots
         * plus the pot number), history line, hero dock, caption, action row.
         *
         * A previous version was an `h-64` block that became a ~700px table
         * the instant the spot arrived — a 0.07 CLS on the screen this product
         * is most used on. A loading state whose size is unrelated to what
         * replaces it is not a loading state, it is a guaranteed reflow.
         */
        <div className="flex flex-col items-center gap-4">
          <Shimmer className="h-6 w-full max-w-md" />
          <Shimmer className="h-[88px] w-full" />
          <Shimmer className="h-[105px] w-full sm:h-[133px]" />
          <Shimmer className="h-5 w-64" />
          <Shimmer className="h-[164px] w-full" />
          <Shimmer className="h-8 w-full max-w-md" />
          <Shimmer className="h-14 w-full" />
        </div>
      ) : (
        /*
         * `Card` is a branded NUMBER, so it survives JSON as a number and
         * needs no parsing — DrillSurface renders the cards as they arrive. A
         * previous version stringified each one and fed it back through
         * `cardsFromString`, which crashed the whole arena into its error
         * boundary.
         */
        <DrillSurface
          spot={spot}
          onAction={(action) => void answer(action)}
          answered={result !== null}
          topAction={result?.topAction ?? null}
          /* Frequency capsules sit directly above the buttons and appear only
             once the answer is in — revealing them earlier would give away
             the strategy before the decision. */
          capsules={
            result === null ? undefined : (
              <FrequencyCapsules segments={segments} topAction={result.topAction} revealed />
            )
          }
          belowActions={
            result === null && spotId !== null ? (
              <HintButton
                key={spotId}
                onRequest={requestHint}
                hintsRemaining={hintsRemaining}
                disabled={result !== null}
              />
            ) : undefined
          }
          feedback={
            result === null ? undefined : (
              <Feedback
                result={result}
                ratingDelta={result.ratingDelta ?? 0}
                onNext={next}
                nextPending={loading}
                source={result.source}
                showMix={false}
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
                chat={
                  attemptId === null || spotId === null ? undefined : (
                    <>
                      <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => setChatOpen(true)}
                        data-testid="open-chat"
                      >
                        Ask about this hand
                      </Button>
                      <CoachChat
                        attemptId={attemptId}
                        spotId={spotId}
                        open={chatOpen}
                        onOpenChange={setChatOpen}
                      />
                    </>
                  )
                }
              />
            )
          }
        />
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
  // Label and figure on ONE baseline. Stacked, five of these are five two-line
  // columns and the eye reads a table where there is only a status line.
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-overline uppercase">{label}</span>
      <span className="text-text-secondary text-caption font-mono font-semibold tabular-nums">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </span>
    </span>
  );
}

/** Plain English for the onboarding leak keys the chip surfaces. */
function leakFocusLabel(tag: string): string {
  const labels: Record<string, string> = {
    overcalling: "overcalling",
    postflop_fundamentals: "postflop play",
    preflop_ranges: "preflop ranges",
    bluff_catching: "bluff catching",
    tilt_control: "tilt spots",
  };
  return labels[tag] ?? tag.replace(/_/g, " ");
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
                  {h.spot.heroPos} · {actionLabel(h.action)}
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
          Keep going
        </Button>
        {returnTo !== undefined && (
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              // The accuracy travels back with them. A lesson's practice set is
              // graded by the SERVER on arrival — this is the report, not the
              // verdict, and the route recomputes and judges it.
              const separator = returnTo.includes("?") ? "&" : "?";
              onReturn(`${returnTo}${separator}accuracy=${Math.round(accuracy)}`);
            }}
          >
            Back
          </Button>
        )}
      </div>
    </section>
  );
}
