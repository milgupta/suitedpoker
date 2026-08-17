import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { QuizStats } from "@/lib/quiz-stats";

/**
 * The poker-maths breakdown on /progress.
 *
 * Reported as PERCENT CORRECT, never as accuracy or a grade. Everything else on
 * this page is denominated in EV loss and feeds the rating; this is a count of
 * right answers and has to read as a different kind of number, or the two get
 * compared and neither survives it.
 */
export function QuizProgress({ stats }: { stats: QuizStats }) {
  if (stats.totalAnswered === 0) {
    return (
      <section className="flex flex-col gap-3" data-section="quiz">
        <h2 className="text-heading-md">Poker maths</h2>
        <p className="text-text-secondary text-body-md max-w-[52ch]">
          Odds and outs, with exact answers. Ten questions is about two minutes.
        </p>
        <div>
          <Button variant="accent" asChild>
            <Link href="/quiz">Try a set</Link>
          </Button>
        </div>
      </section>
    );
  }

  const answered = stats.families.filter((family) => family.attempts > 0);

  return (
    <section className="flex flex-col gap-4" data-section="quiz">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-heading-md">Poker maths</h2>
        <p className="text-text-tertiary text-body-sm tabular-nums">
          {stats.totalCorrect} of {stats.totalAnswered} right
        </p>
      </header>

      {stats.weakest !== null && (
        <p className="text-text-secondary text-body-md max-w-[52ch]">
          Your weakest area is <strong className="text-text-primary">{stats.weakest.label}</strong>,
          at {stats.weakest.accuracy}% over {stats.weakest.attempts} questions.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {answered.map((family) => (
          <li
            key={family.family}
            className="flex items-center gap-3"
            data-quiz-family={family.family}
          >
            <span className="text-body-md text-text-secondary min-w-[9rem]">{family.label}</span>
            <span className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-full">
              {/*
               * The accent ramp, not the grade ramp. This is reference data
               * about what somebody knows, not a verdict on a hand they played.
               */}
              <span
                className="bg-accent block h-full rounded-full"
                style={{ width: `${String(family.accuracy ?? 0)}%` }}
              />
            </span>
            <span className="text-text-tertiary text-body-sm w-20 text-right tabular-nums">
              {family.accuracy}% · {family.attempts}
            </span>
          </li>
        ))}
      </ul>

      <div>
        <Button variant="ghost" asChild>
          <Link href="/quiz">Another ten</Link>
        </Button>
      </div>
    </section>
  );
}
