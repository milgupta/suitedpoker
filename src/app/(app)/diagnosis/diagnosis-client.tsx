"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/analytics-client";
import { trackDeduplicated } from "@/lib/meta-client";
import { SPRING } from "@/lib/motion";
import type { Diagnosis } from "@/lib/diagnosis";
import { cn } from "@/lib/utils";
import { demoHandDetail, demoHandHeadline, type DemoHandRecord } from "@/lib/demo-hand";

/**
 * The diagnosis, staged.
 *
 * ~1.4 seconds of reveal, then everything stays. Each block springs in on a
 * stagger so it reads as a report being WRITTEN, not a page loading — the
 * difference between the two is whether the user feels analysed or stalled.
 *
 * Reduced motion collapses the whole sequence to "everything visible now".
 */

const STAGE_MS = [0, 400, 900] as const;
export const REVEAL_TOTAL_MS = 1400;

export interface DiagnosisClientProps {
  diagnosis: Diagnosis;
  /** 7.2b's hand. Null for anyone who reached here without playing one. */
  demoHand?: DemoHandRecord | null;
  /** Unpaid → paywall; already subscribed → practice. */
  nextHref?: "/paywall" | "/practice";
  nextLabel?: string;
}

export function DiagnosisClient({
  diagnosis,
  demoHand = null,
  nextHref = "/paywall",
  nextLabel = "See my plan →",
}: DiagnosisClientProps) {
  const reduced = useReducedMotion() ?? false;
  const [analyzing, setAnalyzing] = useState(!reduced);

  useEffect(() => {
    trackDeduplicated("ViewContent", { content_name: "diagnosis" });
    capture("diagnosis_viewed", {
      primaryLeak: diagnosis.leakKey,
      annualCost: diagnosis.cost.annualUsd ?? 0,
    });
  }, [diagnosis.leakKey, diagnosis.cost.annualUsd]);

  useEffect(() => {
    if (reduced) return;
    const timer = setTimeout(() => setAnalyzing(false), 500);
    return () => clearTimeout(timer);
  }, [reduced]);

  const stage = (index: number) =>
    reduced
      ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { ...SPRING.smooth, delay: STAGE_MS[index]! / 1000 },
        };

  return (
    <div className="flex flex-col gap-7" data-diagnosis>
      {/* The one-beat header swap: analysing -> the report title. */}
      <div className="min-h-[1.5rem]">
        {analyzing ? (
          <motion.p
            key="analyzing"
            className="text-overline text-text-tertiary uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Analyzing your game…
          </motion.p>
        ) : (
          <motion.p
            key="profile"
            className="text-overline text-accent-bright uppercase"
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Your poker profile
          </motion.p>
        )}
      </div>

      {/*
        THE HAND COMES FIRST when one exists — evidence from something the
        user just did, not a horoscope from the questionnaire. Rating and
        path follow. Leak headline and dollar cost used to live here; they
        were cut because a questionnaire-derived $ figure reads as fabricated
        to the audience that would catch it.
      */}
      {demoHand !== null && (
        <motion.section {...stage(0)} className="flex flex-col gap-1" data-demo-hand>
          <h2 className="text-overline text-text-tertiary uppercase">The hand you just played</h2>
          <p className="text-display-md" data-demo-headline>
            {demoHandHeadline(demoHand)}
          </p>
          <p className="text-text-secondary text-body-md mt-1" data-demo-detail>
            {demoHandDetail(demoHand)}
          </p>
        </motion.section>
      )}

      {/* Where you stand — rating from the quiz, not a dollar estimate. */}
      <motion.section {...stage(0)} className="flex flex-col gap-2">
        <h2 className="text-overline text-text-tertiary uppercase">Where you stand</h2>
        <p className="text-body-lg">
          Rating <span className="font-mono font-semibold tabular-nums">{diagnosis.rating}</span>
          {" · "}
          {diagnosis.tierName}
        </p>
        <PositionBar position={diagnosis.position} label={diagnosis.standing} reduced={reduced} />
      </motion.section>

      <motion.section {...stage(1)} className="flex flex-col gap-2">
        <h2 className="text-overline text-text-tertiary uppercase">Your path</h2>
        <p className="text-body-lg" data-path>
          {diagnosis.lessons} lessons · about {diagnosis.weeks} week
          {diagnosis.weeks === 1 ? "" : "s"} · {diagnosis.minutesPerDay} min/day
        </p>
        <ProjectionBar from={diagnosis.rating} to={diagnosis.projectedRating} reduced={reduced} />
        <p className="text-text-tertiary text-caption">
          Projected: where the material you&rsquo;ll have mastered sits on the difficulty scale.
        </p>

        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-body-md text-text-secondary">What we&rsquo;ll fix first:</p>
          {diagnosis.fixFirst.map((line) => (
            <p key={line} className="text-body-md flex items-start gap-2">
              <span aria-hidden className="text-accent-bright">
                ✓
              </span>
              {line}
            </p>
          ))}
          {diagnosis.alsoFixing.length > 0 && (
            <p className="text-text-tertiary text-body-sm mt-1">
              Also on your list: {diagnosis.alsoFixing.join(", ")}.
            </p>
          )}
        </div>
      </motion.section>

      <motion.div {...stage(2)}>
        <Button variant="accent" size="lg" className="w-full" asChild>
          <Link href={nextHref}>{nextLabel}</Link>
        </Button>
      </motion.div>
    </div>
  );
}

function PositionBar({
  position,
  label,
  reduced,
}: {
  position: number;
  label: string;
  reduced: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="bg-surface-2 relative h-2 flex-1 rounded-full">
        <motion.span
          className="bg-accent absolute top-1/2 size-3 -translate-y-1/2 rounded-full"
          style={{ boxShadow: "0 0 8px var(--color-accent-glow)" }}
          initial={reduced ? { left: `${position * 100}%` } : { left: "0%" }}
          animate={{ left: `${position * 100}%` }}
          transition={reduced ? { duration: 0 } : SPRING.smooth}
        />
      </div>
      <span className="text-text-tertiary text-caption whitespace-nowrap">{label}</span>
    </div>
  );
}

function ProjectionBar({ from, to, reduced }: { from: number; to: number; reduced: boolean }) {
  const scaleMin = 600;
  const scaleMax = 1800;
  const fromPct = ((from - scaleMin) / (scaleMax - scaleMin)) * 100;
  const toPct = ((to - scaleMin) / (scaleMax - scaleMin)) * 100;

  return (
    <div className="flex items-center gap-3">
      <span className="text-caption font-mono tabular-nums">{from}</span>
      <div className="bg-surface-2 relative h-2 flex-1 overflow-hidden rounded-full">
        <motion.span
          className={cn("bg-accent absolute inset-y-0 rounded-full opacity-60")}
          style={{ left: `${fromPct}%` }}
          initial={reduced ? { width: `${toPct - fromPct}%` } : { width: "0%" }}
          animate={{ width: `${toPct - fromPct}%` }}
          transition={reduced ? { duration: 0 } : { ...SPRING.gentle, delay: 0.3 }}
        />
      </div>
      <span className="text-accent-bright text-caption font-mono font-semibold tabular-nums">
        {to}
      </span>
    </div>
  );
}
