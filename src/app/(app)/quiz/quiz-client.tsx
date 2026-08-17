"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlayingCard } from "@/components/poker/PlayingCard";
import { Shimmer } from "@/components/motion";
import { capture } from "@/lib/analytics-client";
import { cn } from "@/lib/utils";
import type { ClientQuizQuestion } from "@/poker/quiz";

/**
 * The poker-maths quiz.
 *
 * The one screen in the product that states a number without a hedge. Every
 * other graded surface carries "authored chart, not solver-verified" because
 * its EVs are modelled; these answers are counting problems, so the panel says
 * so and means it.
 */

const SESSION_LENGTH = 10;

interface Verdict {
  correct: boolean;
  correctIndex: number;
  correctPercent: number;
  exactPercent: number;
  explanation: string;
}

export function QuizClient() {
  const [question, setQuestion] = useState<ClientQuizQuestion | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // `performance.now()` in an effect, never a `useRef(Date.now())` initialiser:
  // a ref initialiser runs during render, which React's compiler rejects.
  const shownAt = useRef(0);

  /** Fetches WITHOUT touching state, so an effect can await before rendering. */
  const fetchQuestion = useCallback(async (): Promise<{
    questionId: string;
    question: ClientQuizQuestion;
  } | null> => {
    try {
      const response = await fetch("/api/quiz/next", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) return null;
      return (await response.json()) as { questionId: string; question: ClientQuizQuestion };
    } catch {
      return null;
    }
  }, []);

  /** The handler path. Setting state synchronously is fine from an event. */
  const load = useCallback(async () => {
    setPending(true);
    setError("");
    setVerdict(null);
    setChosen(null);
    const data = await fetchQuestion();
    setPending(false);
    if (data === null) {
      setError("Could not load a question.");
      return;
    }
    setQuestion(data.question);
    setQuestionId(data.questionId);
    shownAt.current = performance.now();
  }, [fetchQuestion]);

  useEffect(() => {
    capture("quiz_started", {});
    let cancelled = false;
    void (async () => {
      // Awaited BEFORE any setState. Calling one synchronously inside an effect
      // triggers a cascading render, and React's compiler rejects it — the same
      // class of complaint that made the demo hand's timing use an effect
      // rather than a `useRef(Date.now())` initialiser.
      const data = await fetchQuestion();
      if (cancelled) return;
      if (data === null) {
        setError("Could not load a question.");
        return;
      }
      setQuestion(data.question);
      setQuestionId(data.questionId);
      shownAt.current = performance.now();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchQuestion]);

  const answer = useCallback(
    async (index: number) => {
      if (questionId === null || verdict !== null || pending) return;
      setPending(true);
      setChosen(index);
      const timeMs = Math.max(0, Math.round(performance.now() - shownAt.current));
      try {
        const response = await fetch("/api/quiz/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId, chosenIndex: index, timeMs }),
        });
        if (!response.ok) {
          setError("Could not grade that answer.");
          setChosen(null);
          return;
        }
        const data = (await response.json()) as Verdict;
        setVerdict(data);
        setAnswered((n) => n + 1);
        if (data.correct) setCorrectCount((n) => n + 1);
        if (question !== null) {
          capture("quiz_answered", {
            family: question.family,
            correct: data.correct,
            timeMs,
          });
        }
      } catch {
        setError("Could not grade that answer.");
        setChosen(null);
      } finally {
        setPending(false);
      }
    },
    [questionId, verdict, pending, question],
  );

  // 1/2/3 pick an answer, Space or Enter moves on — the same keyboard promise
  // the action bar makes in the arena.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target !== null && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      if (verdict === null) {
        const index = ["1", "2", "3"].indexOf(event.key);
        if (index >= 0 && question !== null && index < question.options.length) {
          event.preventDefault();
          void answer(index);
        }
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (answered < SESSION_LENGTH) void load();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, load, question, verdict, answered]);

  if (error !== "") {
    // Error state FIRST, before any loading branch. /daily shipped with the
    // check the other way round and showed a grey box forever on a failed load.
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-danger-bright text-body-md">
          {error}
        </p>
        <Button onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  if (answered >= SESSION_LENGTH && verdict !== null) {
    return (
      <QuizSummary
        correct={correctCount}
        total={SESSION_LENGTH}
        onAgain={() => location.reload()}
      />
    );
  }

  if (question === null) return <Shimmer className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-6" data-quiz>
      <header className="flex items-baseline justify-between">
        <h1 className="text-heading-md">Poker maths</h1>
        <p className="text-text-tertiary text-body-sm tabular-nums">
          {answered} / {SESSION_LENGTH}
        </p>
      </header>

      <QuizArt question={question} />

      <div className="flex flex-col gap-2">
        <p className="text-overline text-text-tertiary uppercase">{question.clarifier}</p>
        <h2 className="text-heading-lg">{question.prompt}</h2>
      </div>

      <ul className="flex flex-col gap-3" data-quiz-options>
        {question.options.map((option, index) => {
          const isChosen = chosen === index;
          const isCorrect = verdict !== null && verdict.correctIndex === index;
          const isWrongPick = verdict !== null && isChosen && !verdict.correct;
          return (
            <li key={option}>
              <button
                type="button"
                data-quiz-option={option}
                disabled={verdict !== null || pending}
                onClick={() => void answer(index)}
                className={cn(
                  "border-border bg-surface-1 text-body-lg flex min-h-[56px] w-full items-center",
                  "justify-center rounded-lg border tabular-nums transition-colors",
                  "duration-[var(--duration-fast)] disabled:cursor-default",
                  verdict === null && "hover:border-border-strong active:bg-surface-2",
                  isCorrect && "border-grade-best-border bg-grade-best-fill text-grade-best",
                  isWrongPick && "border-danger bg-danger-fill text-danger-bright",
                )}
              >
                {option}%
              </button>
            </li>
          );
        })}
      </ul>

      {verdict !== null && <QuizFeedback verdict={verdict} />}

      {verdict !== null && (
        <Button variant="accent" onClick={() => void load()} data-quiz-next>
          Next question
        </Button>
      )}
    </div>
  );
}

/** Hero cards over the board, or nothing at all for a pot-odds question. */
function QuizArt({ question }: { question: ClientQuizQuestion }) {
  if (question.heroCards.length === 0 && question.board.length === 0) return null;
  return (
    <div className="bg-surface-1 border-border flex flex-col items-center gap-4 rounded-lg border py-6">
      {question.board.length > 0 && (
        <div className="flex gap-2" aria-label="Board">
          {question.board.map((card, i) => (
            <PlayingCard
              key={i}
              card={card}
              size="md"
              index={i}
              dealCount={question.board.length}
            />
          ))}
        </div>
      )}
      {question.heroCards.length > 0 && (
        <div className="flex gap-2" aria-label="Your hand">
          {question.heroCards.map((card, i) => (
            <PlayingCard
              key={i}
              card={card}
              size="lg"
              index={i}
              dealCount={question.heroCards.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuizFeedback({ verdict }: { verdict: Verdict }) {
  return (
    <section
      className="border-border bg-surface-1 flex flex-col gap-3 rounded-lg border p-4"
      data-quiz-feedback
      aria-live="polite"
    >
      <p
        className={cn("text-heading-md", verdict.correct ? "text-grade-best" : "text-text-primary")}
      >
        {verdict.correct ? "Correct." : `Not quite — it's ${verdict.correctPercent}%.`}
      </p>
      <p className="text-text-secondary text-body-md">{verdict.explanation}</p>
      {/*
       * The only place in the product that says "exactly". Every other graded
       * screen carries a provenance line saying its numbers are an authored
       * approximation; this one is arithmetic, and the copy should say which.
       */}
      <p className="text-text-tertiary text-body-sm tabular-nums">
        Exactly {verdict.exactPercent}% — counted, not estimated.
      </p>
    </section>
  );
}

function QuizSummary({
  correct,
  total,
  onAgain,
}: {
  correct: number;
  total: number;
  onAgain: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-5" data-quiz-summary>
      <h1 className="text-display-md">
        {correct} of {total}
      </h1>
      <p className="text-text-secondary text-body-lg max-w-[46ch]">
        {correct === total
          ? "Every one. The maths is not the thing holding your game back."
          : "The wrong answers are the useful part — each one is a specific way the count goes astray."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="accent" onClick={onAgain}>
          Another ten
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/practice">Back to practice</Link>
        </Button>
      </div>
    </div>
  );
}
