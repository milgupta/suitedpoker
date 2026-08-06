"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * An inline comprehension check. Answering reveals; nothing is recorded.
 *
 * Its own file because it needs state, and everything else in a lesson does
 * not. Keeping the static components on the server is what stops a reading
 * page shipping a bundle to render a card.
 */
export function Checkpoint({
  question,
  options = [],
  answer = 0,
  explain,
}: {
  question: string;
  options?: readonly string[];
  /** Index into options. */
  answer?: number;
  explain?: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <div className="border-border bg-surface-1 my-6 rounded-lg border px-4 py-4" data-checkpoint>
      <p className="text-body-md mb-3 font-medium">{question}</p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={question}>
        {options.map((option, index) => {
          const isPicked = picked === index;
          const isAnswer = index === answer;
          const revealed = picked !== null;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={isPicked}
              disabled={revealed}
              onClick={() => setPicked(index)}
              className={cn(
                "min-h-[44px] rounded-md border px-3 py-2 text-left text-sm transition-colors",
                !revealed && "border-border hover:border-border-strong",
                revealed && isAnswer && "border-grade-best-border bg-grade-best-fill",
                revealed &&
                  isPicked &&
                  !isAnswer &&
                  "border-grade-mistake-border bg-grade-mistake-fill",
                revealed && !isPicked && !isAnswer && "border-border opacity-50",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p className="text-text-secondary text-body-sm mt-3" data-checkpoint-explain>
          {picked === answer ? "Right. " : "Not quite. "}
          {explain ?? ""}
        </p>
      )}
    </div>
  );
}
