"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { DrillSurface } from "@/components/poker";
import { capture } from "@/lib/analytics-client";
import { fadeUp } from "@/lib/motion";
import {
  EXAMPLE_CORRECT_ACTION,
  EXAMPLE_INTRO,
  EXAMPLE_OUTRO,
  EXAMPLE_SPOT,
  exampleVerdict,
  type ExampleVerdict,
} from "@/lib/example-hand";
import { cn } from "@/lib/utils";

/**
 * The example-hand step of the /start quiz: one authored, obviously-right
 * hand on the real drill surface, graded with preset copy. See
 * `src/lib/example-hand.ts` for why it is scripted rather than dealt.
 *
 * `onContinue` hands the flow back to the quiz client, which saves the
 * answers and moves to signup.
 */

export function ExampleHand({ onContinue }: { onContinue: () => void }) {
  const reduced = useReducedMotion() ?? false;
  const [verdict, setVerdict] = useState<ExampleVerdict | null>(null);
  const verdictRef = useRef<HTMLDivElement | null>(null);

  // The verdict docks under the action buttons, which sit at the bottom of a
  // 844px viewport — without this the payoff of the whole screen renders
  // below the fold and the CTA with it.
  useEffect(() => {
    if (verdict === null) return;
    verdictRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
  }, [verdict, reduced]);

  function answer(action: string): void {
    if (verdict !== null) return;
    const result = exampleVerdict(action);
    setVerdict(result);
    capture("example_hand_answered", { action, correct: result.correct });
  }

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      animate="visible"
      className="flex flex-1 flex-col gap-4"
      data-example-hand
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-display-md">{EXAMPLE_INTRO.heading}</h1>
        <p className="text-text-secondary text-body-lg">{EXAMPLE_INTRO.sub}</p>
      </div>

      <DrillSurface
        spot={EXAMPLE_SPOT}
        onAction={answer}
        answered={verdict !== null}
        topAction={verdict === null ? null : EXAMPLE_CORRECT_ACTION}
        // The intro line above already states the situation in one sentence;
        // the default coach tip underneath would say it a third time.
        coachTip={null}
        feedback={
          verdict === null ? undefined : (
            <motion.div
              ref={verdictRef}
              variants={fadeUp(reduced)}
              initial="hidden"
              animate="visible"
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-4",
                verdict.correct
                  ? "border-grade-best-border bg-grade-best-fill"
                  : "border-grade-inaccuracy-border bg-grade-inaccuracy-fill",
              )}
              data-example-verdict={verdict.correct ? "correct" : "corrected"}
            >
              <p className="text-body-lg font-semibold">{verdict.title}</p>
              <p className="text-text-secondary text-body-md">{verdict.body}</p>
              <p className="text-text-secondary text-body-md">{EXAMPLE_OUTRO.bridge}</p>
              <Button
                variant="accent"
                size="lg"
                className="w-full"
                onClick={onContinue}
                data-testid="example-continue"
              >
                {EXAMPLE_OUTRO.cta}
              </Button>
            </motion.div>
          )
        }
      />
    </motion.div>
  );
}
