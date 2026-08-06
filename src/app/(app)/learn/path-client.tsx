"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { RingGauge } from "@/components/ui/ring-gauge";
import { SPRING, staggerDelay } from "@/lib/motion";
import type { LessonStatus } from "@/lib/curriculum-progress";
import { cn } from "@/lib/utils";

/** Per-node stagger, capped by the shared 300ms budget across ~14 nodes. */
const STEP = staggerDelay(14);

/**
 * The learning path.
 *
 * A vertical spine of modules and lessons — the shape a phone reads best — in
 * this product's palette rather than a gamified one. Locked nodes are tappable
 * and say WHY: a dead click teaches nothing except that the app is broken.
 */

interface LessonNode {
  slug: string;
  title: string;
  module: string;
  estMinutes: number;
  status: LessonStatus;
  locked: boolean;
  lockedReason: string | null;
}

interface ModuleNode {
  slug: string;
  title: string;
  completed: number;
  total: number;
  fraction: number;
  locked: boolean;
  lessons: LessonNode[];
}

export interface LearnPathClientProps {
  modules: ModuleNode[];
  nextHref: string | null;
  nextTitle: string | null;
}

export function LearnPathClient({ modules, nextHref, nextTitle }: LearnPathClientProps) {
  const reduced = useReducedMotion() ?? false;
  const [explaining, setExplaining] = useState<string | null>(null);

  const done = modules.reduce((sum, m) => sum + m.completed, 0);
  const total = modules.reduce((sum, m) => sum + m.total, 0);

  return (
    <div className="flex flex-col gap-8" data-learn-path>
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-display-md">Your path</h1>
          <p className="text-text-secondary text-body-md mt-1">
            {done} of {total} lessons done
          </p>
        </div>
        <RingGauge value={total === 0 ? 0 : done / total} size={64} label={`${done}/${total}`} />
      </header>

      {nextHref !== null && (
        <Button variant="accent" size="lg" className="w-full" asChild>
          <Link href={nextHref} data-continue>
            {done === 0 ? "Start" : "Continue"}
            {nextTitle === null ? "" : ` · ${nextTitle}`}
          </Link>
        </Button>
      )}

      <div className="flex flex-col gap-8">
        {modules.map((mod, moduleIndex) => (
          <section key={mod.slug} className="flex flex-col gap-3" data-module={mod.slug}>
            <div className="flex items-center gap-3">
              <RingGauge
                value={mod.fraction}
                size={36}
                label={`${mod.completed} of ${mod.total} lessons`}
              />
              <div className="min-w-0 flex-1">
                <h2 className={cn("text-heading-lg", mod.locked && "text-text-tertiary")}>
                  {mod.title}
                </h2>
                <p className="text-text-tertiary text-caption font-mono">
                  {mod.completed}/{mod.total}
                </p>
              </div>
            </div>

            {/* The spine. Nodes hang off a single vertical rule. */}
            <ol className="border-border ml-[17px] flex flex-col gap-2 border-l pl-5">
              {mod.lessons.map((lesson, i) => (
                <motion.li
                  key={lesson.slug}
                  initial={reduced ? { opacity: 1 } : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { ...SPRING.smooth, delay: (moduleIndex * 5 + i) * STEP }
                  }
                >
                  <LessonRow
                    lesson={lesson}
                    explaining={explaining === lesson.slug}
                    onExplain={() =>
                      setExplaining((current) => (current === lesson.slug ? null : lesson.slug))
                    }
                  />
                </motion.li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

const DOT: Record<LessonStatus, string> = {
  not_started: "border-border-strong",
  reading: "border-accent",
  practicing: "border-accent bg-accent/30",
  completed: "border-accent bg-accent",
};

function LessonRow({
  lesson,
  explaining,
  onExplain,
}: {
  lesson: LessonNode;
  explaining: boolean;
  onExplain: () => void;
}) {
  const body = (
    <span className="flex w-full items-center gap-3">
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border-2",
          lesson.locked ? "border-border" : DOT[lesson.status],
        )}
      >
        {lesson.status === "completed" && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.5L4.75 8.75L9.5 3.5"
              stroke="var(--color-on-accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("text-body-md block", lesson.locked && "text-text-tertiary")}>
          {lesson.title}
        </span>
      </span>
      <span className="text-text-tertiary text-caption shrink-0 font-mono">
        {lesson.locked ? "🔒" : `${lesson.estMinutes}m`}
      </span>
    </span>
  );

  if (lesson.locked) {
    return (
      <div className="flex flex-col gap-1">
        {/* Tappable, and it explains itself. Never a dead click. */}
        <button
          type="button"
          onClick={onExplain}
          aria-expanded={explaining}
          data-lesson={lesson.slug}
          data-locked="true"
          className="hover:border-border-strong border-border min-h-[44px] w-full rounded-md border px-3 py-2 text-left"
        >
          {body}
        </button>
        {explaining && (
          <p className="text-text-tertiary text-caption px-3" data-locked-reason>
            {lesson.lockedReason}
          </p>
        )}
      </div>
    );
  }

  return (
    <Link
      href={`/learn/${lesson.module}/${lesson.slug}`}
      data-lesson={lesson.slug}
      data-locked="false"
      data-status={lesson.status}
      className="border-border hover:border-accent block min-h-[44px] rounded-md border px-3 py-2 transition-colors"
    >
      {body}
    </Link>
  );
}
