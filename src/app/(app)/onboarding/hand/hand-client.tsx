"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import type { ClientSpot } from "@/poker/generator";
import type { Grade } from "@/poker/grader";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/motion";
import { Explanation, Feedback, FrequencyCapsules, SpotTable } from "@/components/poker";
import { capsuleSegments } from "@/lib/action-grid";
import { capture } from "@/lib/analytics-client";
import { actionGridClass } from "@/lib/action-grid";
import { cn } from "@/lib/utils";
import { actionLabel } from "@/lib/action-label";
import { fadeUp } from "@/lib/motion";
import { DEMO_INTRO, DEMO_OUTRO_CTA } from "@/lib/demo-hand";

/**
 * The one hand, played before the wall.
 *
 * It uses the REAL table components, the REAL drill API and the REAL grader —
 * no mock, no scripted sequence, no video. That is the whole argument: the
 * competitor's hero image is a table playing itself, and the thing that beats
 * it is not better copy, it is letting someone actually play one hand.
 *
 * Three states in one component (intro → hand → feedback) rather than three
 * routes, so nothing navigates and the whole thing stays inside the funnel's
 * 45-second budget.
 */

type Phase = "intro" | "playing" | "answered";

export function HandClient() {
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  const [phase, setPhase] = useState<Phase>("intro");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [spot, setSpot] = useState<ClientSpot | null>(null);
  const [result, setResult] = useState<Grade | null>(null);
  const [answeredAction, setAnsweredAction] = useState<string | null>(null);
  const [error, setError] = useState("");

  const startedAt = useRef(0);
  // Stamped in an effect, not in the initialiser: a ref initialiser runs
  // DURING render, and React's compiler is right to reject a clock read there
  // — it makes the value depend on how many times the component happened to
  // re-render.
  const arrivedAt = useRef(0);

  useEffect(() => {
    arrivedAt.current = performance.now();
  }, []);

  const deal = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/onboarding/hand", { method: "POST" });

      if (response.status === 409) {
        // Already played it — the diagnosis has its evidence.
        router.replace("/diagnosis");
        return;
      }
      if (!response.ok) {
        setError("Couldn't deal a hand. You can skip ahead, nothing is lost.");
        return;
      }

      const data = (await response.json()) as { spotId: string; spot: ClientSpot };
      setSpotId(data.spotId);
      setSpot(data.spot);
      setPhase("playing");
      startedAt.current = performance.now();
      capture("demo_hand_shown", {});
    } catch {
      setError("Couldn't reach the server. You can skip ahead, nothing is lost.");
    }
  }, [router]);

  // useCallback, not a plain declaration: a function declared in the component
  // body is recreated every render, and the compiler cannot prove it is only
  // ever an event handler — so the clock read inside it reads as render work.
  const answer = useCallback(
    async (action: string): Promise<void> => {
      if (spotId === null || result !== null) return;
      // performance.now() throughout: it is monotonic, so a clock adjustment
      // mid-hand cannot produce a negative think time.
      const timeMs = Math.round(performance.now() - startedAt.current);

      try {
        const response = await fetch("/api/onboarding/hand/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ spotId, action, timeMs }),
        });

        if (!response.ok) {
          setError("That hand couldn't be graded. Carry on, nothing is lost.");
          return;
        }

        const graded = (await response.json()) as Grade;
        setResult(graded);
        setAnsweredAction(action);
        setPhase("answered");

        capture("demo_hand_answered", {
          grade: graded.grade,
          evLoss: graded.evLoss,
          timeMs,
        });
      } catch {
        setError("That hand couldn't be graded. Carry on, nothing is lost.");
      }
    },
    [spotId, result],
  );

  const finish = useCallback((): void => {
    capture("demo_hand_completed", {
      // The funnel budget for this screen, measured rather than assumed.
      secondsAdded: Math.round((performance.now() - arrivedAt.current) / 1000),
    });
    router.push("/diagnosis");
  }, [router]);

  // Prefetched during the hand so the diagnosis is instant after the CTA.
  useEffect(() => {
    router.prefetch("/diagnosis");
  }, [router]);

  const segments =
    result === null || spot === null ? [] : capsuleSegments(spot.legalActions, result);

  if (phase === "intro") {
    return (
      <motion.div
        variants={fadeUp(reduced)}
        initial="hidden"
        animate="visible"
        className="mx-auto flex min-h-[calc(100dvh-2*var(--app-shell-py))] max-w-md flex-col justify-center gap-6"
      >
        <h1 className="text-display-md">{DEMO_INTRO.heading}</h1>
        <p className="text-text-secondary text-body-lg">{DEMO_INTRO.body}</p>

        {error !== "" && (
          <p role="alert" className="text-grade-mistake text-body-md">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {/* accent, not primary: this is the one lit control on the screen,
              and a white pill on near-black read as an empty box. */}
          <Button
            variant="accent"
            size="lg"
            className="w-full"
            onClick={() => void deal()}
            data-testid="deal-me-in"
          >
            {DEMO_INTRO.cta}
          </Button>
          {/* Always offered, not only after a failure. A forced step this late
              in the funnel is friction, and someone who does not want to play
              a hand still converts on the diagnosis. */}
          <Button variant="ghost" onClick={finish} data-testid="skip-hand">
            {DEMO_INTRO.skip}
          </Button>
        </div>
      </motion.div>
    );
  }

  if (spot === null) {
    return <Shimmer className="h-96 w-full" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      {/* The hand itself, rendered with the same components the paid product
          uses — the same table, the same cards. Swapping in a lighter mock here
          would make the demo a lie, and this is the one hand that decides
          whether anybody pays. */}
      <div className="flex flex-col gap-3">
        <SpotTable
          seats={spot.seats}
          heroPos={spot.heroPos}
          heroCards={spot.heroCards}
          board={spot.board}
          potBb={spot.potBb}
          effStackBb={spot.effStackBb}
          actionHistory={spot.actionHistory}
        />
        {/* Only when there is a SEQUENCE — with one action the seat chip on
            the table already says it. */}
        {spot.actionHistory.length > 1 && (
          <p className="text-text-secondary text-body-sm text-center">
            {spot.actionHistory.join(" · ")}
          </p>
        )}
      </div>

      {result !== null && (
        <FrequencyCapsules segments={segments} topAction={result.topAction} revealed />
      )}

      <div className={cn("grid gap-2.5", actionGridClass(spot.legalActions.length))}>
        {spot.legalActions.map((action) => (
          <Button
            key={action}
            data-action={action}
            variant="action"
            size="action"
            disabled={result !== null}
            onClick={() => void answer(action)}
            className="w-full"
          >
            {actionLabel(action)}
          </Button>
        ))}
      </div>

      {error !== "" && (
        <p role="alert" className="text-grade-mistake text-body-md">
          {error}
        </p>
      )}

      {result !== null && (
        <Feedback
          result={result}
          ratingDelta={0}
          onNext={finish}
          nextLabel={DEMO_OUTRO_CTA}
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
    </div>
  );
}
