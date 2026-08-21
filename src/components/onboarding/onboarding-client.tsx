"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/analytics-client";
import { trackDeduplicated } from "@/lib/meta-client";
import { SPRING } from "@/lib/motion";
import {
  EXAMPLE_STEP,
  progressAt,
  questionAt,
  resumeIndex,
  TOTAL_STEPS,
  type Answers,
  type Question,
} from "@/lib/onboarding";
import { ExampleHand } from "@/components/onboarding/ExampleHand";
import { saveStartAnswers, commitStartAnswers } from "@/lib/start-answers-client";
import { cn } from "@/lib/utils";

/**
 * The onboarding quiz.
 *
 * The mechanics that make four questions feel like fifteen seconds:
 *
 *   - Single-select AUTO-ADVANCES. No Continue button exists on those screens,
 *     so most questions are exactly one tap. Multi-select keeps a Continue,
 *     disabled until a pick, because there is no other way to say "done".
 *   - THE CONTROL SHAPE TELLS YOU THE RULE. A radio means one; a checkmark
 *     means several. The user never has to guess and never has to be told.
 *   - The footer says "You can adjust later" on every screen, identically, so
 *     it goes invisible after step two while still removing the "am I locking
 *     myself in?" hesitation.
 *   - Progress is computed from the step index and nothing else, which is what
 *     makes it impossible for the bar to skip or run backwards.
 */

const AUTO_ADVANCE_MS = 250;
const FOOTER = "You can adjust later.";

export interface OnboardingClientProps {
  initialAnswers: Answers;
  /**
   * `api` — signed-in `/onboarding` (organic). Persists to the profile.
   * `local` — public `/start` (paid ads). Persists to localStorage, then signup.
   */
  mode?: "api" | "local";
}

export function OnboardingClient({ initialAnswers, mode = "api" }: OnboardingClientProps) {
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  // No intro screen: the quiz opens on the first unanswered question. The ad
  // creative and the landing page have already done the hook's job by the time
  // anyone is here, so a second pitch was one more tap before the funnel.
  const [step, setStep] = useState<number>(() => resumeIndex(initialAnswers));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [busy, setBusy] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    capture("onboarding_started", { entry: mode === "local" ? "start" : "app" });
    return () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    };
  }, [mode]);

  // Ads-funnel safety net. `/onboarding/continue` is the real commit, but a
  // signed-in user can still land here (organic signup, a failed continue).
  // If the local quiz is sitting in localStorage, pick it up rather than
  // making them answer the quiz a second time.
  useEffect(() => {
    if (mode !== "api") return;
    if (Object.keys(initialAnswers).length > 0) return;
    let cancelled = false;
    void (async () => {
      const result = await commitStartAnswers();
      if (!cancelled && result === "committed") {
        // Ads funnel: the example hand was already played on /start, so the
        // committed quiz goes straight to the wall.
        router.replace("/paywall");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, initialAnswers, router]);

  const persist = useCallback(
    async (next: Answers, complete = false): Promise<void> => {
      if (mode === "local") {
        saveStartAnswers(next);
        return;
      }
      try {
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers: next, complete }),
        });
      } catch {
        // A failed write must not block the flow. The next answer posts the whole
        // merged set again, so one dropped request costs nothing.
      }
    },
    [mode],
  );

  const question = step === 0 ? undefined : questionAt(step);

  function goTo(next: number, dir: 1 | -1): void {
    setDirection(dir);
    setStep(next);
  }

  async function record(id: keyof Answers, value: string | string[]): Promise<void> {
    const next = { ...answers, [id]: value };
    setAnswers(next);

    capture("onboarding_question_answered", {
      question: id,
      answer: Array.isArray(value) ? value.join(",") : value,
      index: step,
    });

    void persist(next);
  }

  async function finish(final: Answers): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "local") {
        // Account next — Lead and onboarding_completed fire after commit, once
        // there is an email for Meta to match and a profile row to derive into.
        saveStartAnswers(final);
        router.push("/signup?from=start");
        return;
      }

      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: final, complete: true }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        derived?: { skillTier: string; primaryLeakKey: string | null; rating: number };
      };

      if (body.derived !== undefined) {
        // Meta's Lead event, deduplicated across pixel and CAPI. This is the
        // signal the ad optimiser learns from before anyone has paid, so it is
        // the one that decides who the algorithm shows the ads to on day one.
        trackDeduplicated("Lead");
        capture("onboarding_completed", {
          skillTier: body.derived.skillTier,
          primaryLeak: body.derived.primaryLeakKey ?? "none",
          rating: body.derived.rating,
        });
      }

      // 7.2b: one real hand before the wall. The diagnosis opens with it, so
      // it has to come first — the hand is the evidence, the quiz is context.
      router.push("/onboarding/hand");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Where "next" goes from a finished question. Before the last question it
   * is simply the next one. After the last: the ads funnel plays the example
   * hand first (its Continue calls `finish`), the organic flow finishes here.
   */
  function advanceFrom(current: number, latest: Answers): void {
    if (current < TOTAL_STEPS) {
      goTo(current + 1, 1);
      return;
    }
    if (mode === "local") {
      goTo(EXAMPLE_STEP, 1);
      return;
    }
    void finish(latest);
  }

  function selectSingle(id: keyof Answers, value: string): void {
    void record(id, value);

    // A beat, so the selection registers visually before the screen moves.
    // Instant advance reads as the app choosing for you.
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      advanceFrom(step, { ...answers, [id]: value });
    }, AUTO_ADVANCE_MS);
  }

  const slide = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: direction * 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction * -24 },
      };

  const example = step === EXAMPLE_STEP && mode === "local";
  if (question === undefined && !example) return null;

  if (example) {
    return (
      <div
        className="flex min-h-[calc(100dvh-2*var(--app-shell-py))] flex-col gap-6"
        data-step={step}
      >
        {/* No progress header: the questions are done, and a bar reading 4/4
            over a poker table says there is a fifth question coming. */}
        <ExampleHand onContinue={() => void finish(answers)} />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[calc(100dvh-2*var(--app-shell-py))] flex-col gap-6"
      data-step={step}
    >
      <div className="flex items-center gap-4">
        {/* Invisible, not absent, on question one: the progress bar must not
            jump sideways when the button appears on question two. */}
        <button
          type="button"
          aria-label="Back"
          className={cn(
            "tap-target text-text-secondary hover:text-text-primary -ml-2 p-2",
            step === 1 && "invisible",
          )}
          disabled={step === 1}
          onClick={() => goTo(Math.max(1, step - 1), -1)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M12.5 4L6.5 10L12.5 16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div
          className="bg-surface-2 h-1 flex-1 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Question progress"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step}
          data-progress={step}
        >
          <motion.div
            className="bg-accent h-full rounded-full"
            initial={false}
            animate={{ width: `${progressAt(step) * 100}%` }}
            transition={reduced ? { duration: 0 } : SPRING.smooth}
          />
        </div>

        <span className="text-text-tertiary text-caption font-mono tabular-nums">
          {step}/{TOTAL_STEPS}
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={question!.id}
          {...slide}
          transition={reduced ? { duration: 0 } : SPRING.smooth}
          className="flex flex-1 flex-col gap-8"
        >
          {/* Left-aligned: you are answering. Interstitials centre theirs. */}
          <h1 className="text-display-md text-left">{question!.prompt(answers)}</h1>
          {question!.hint !== undefined && (
            <p className="text-text-tertiary text-body-sm -mt-6">{question!.hint}</p>
          )}

          {question!.kind === "multi" ? (
            <MultiSelect
              question={question!}
              label={question!.prompt(answers)}
              selected={answers.leaks ?? []}
              onToggle={(value) => {
                const current = answers.leaks ?? [];
                const next = current.includes(value)
                  ? current.filter((v) => v !== value)
                  : [...current, value];
                void record("leaks", next);
              }}
              onContinue={() => advanceFrom(step, answers)}
            />
          ) : (
            <SingleSelect
              question={question!}
              label={question!.prompt(answers)}
              selected={answers[question!.id] as string | undefined}
              onSelect={(value) => selectSingle(question!.id, value)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <p className="text-text-tertiary text-caption text-center italic">{FOOTER}</p>
    </div>
  );
}

function SingleSelect({
  question,
  label,
  selected,
  onSelect,
}: {
  question: Question;
  label: string;
  selected: string | undefined;
  onSelect: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-3">
      {(question.options ?? []).map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={selected === option.value}
          data-value={option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            "border-border bg-surface-1 hover:border-border-strong flex min-h-[56px] w-full items-center gap-4 rounded-lg border px-4 py-3 text-left transition-colors",
            selected === option.value && "border-accent bg-surface-2",
          )}
        >
          {/* A circle means one. */}
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border-2",
              selected === option.value ? "border-accent" : "border-border-strong",
            )}
            aria-hidden
          >
            {selected === option.value && <span className="bg-accent size-2.5 rounded-full" />}
          </span>
          <span className="text-body-lg">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function MultiSelect({
  question,
  label,
  selected,
  onToggle,
  onContinue,
}: {
  question: Question;
  label: string;
  selected: string[];
  onToggle: (value: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div role="group" aria-label={label} className="flex flex-col gap-3">
        {(question.options ?? []).map((option) => {
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={checked}
              data-value={option.value}
              onClick={() => onToggle(option.value)}
              className={cn(
                "border-border bg-surface-1 hover:border-border-strong flex min-h-[56px] w-full items-center gap-4 rounded-lg border px-4 py-3 text-left transition-colors",
                checked && "border-accent bg-surface-2",
              )}
            >
              {/* A square with a tick means several. */}
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-md border-2",
                  checked ? "border-accent bg-accent" : "border-border-strong",
                )}
                aria-hidden
              >
                {checked && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 6.5L4.75 8.75L9.5 3.5"
                      stroke="var(--color-on-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="text-body-lg">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-4">
        <Button
          variant="accent"
          size="lg"
          className="w-full"
          disabled={selected.length === 0}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
