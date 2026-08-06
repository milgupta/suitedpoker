"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RangeGrid, PlayingCard, type RangeStrategy } from "@/components/poker";
import { cardsFromString } from "@/poker/cards";
import { cn } from "@/lib/utils";

/**
 * The lesson vocabulary: every custom component MDX may use.
 *
 * These render inside prose, so they are quiet by default — the words carry
 * the lesson, the components carry the evidence. Anything loud enough to
 * compete with the paragraph it sits in is doing the wrong job.
 */

/** A live range grid for a named solution node. Reference data, accent ramp. */
export function RangeGridEmbed({ node, caption }: { node: string; caption?: string }) {
  const [strategy, setStrategy] = useState<RangeStrategy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/ranges?node=${encodeURIComponent(node)}`);
        if (!response.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const body = (await response.json()) as { strategy: RangeStrategy };
        if (!cancelled) setStrategy(body.strategy);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [node]);

  return (
    <figure className="my-6" data-range-embed={node}>
      {failed ? (
        <p className="text-text-tertiary text-body-sm border-border rounded-md border border-dashed px-4 py-6 text-center">
          Range chart unavailable — open the range browser to explore this spot.
        </p>
      ) : strategy === null ? (
        <div className="bg-surface-1 h-64 animate-pulse rounded-md" aria-hidden />
      ) : (
        <RangeGrid strategy={strategy} mode="frequency" />
      )}
      {caption !== undefined && (
        <figcaption className="text-text-tertiary text-caption mt-2 text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Real cards inline. `hole` and optional `board` are strings like "Ah Kd". */
export function HandExample({
  hole,
  board,
  label,
}: {
  hole: string;
  board?: string;
  label?: string;
}) {
  const holeCards = cardsFromString(hole);
  const boardCards = board === undefined ? [] : cardsFromString(board);

  return (
    <figure className="my-5 flex flex-col items-center gap-3" data-hand-example>
      <div className="flex items-center gap-4">
        <div className="flex gap-1.5">
          {holeCards.map((card, i) => (
            <PlayingCard key={i} card={card} size="md" />
          ))}
        </div>
        {boardCards.length > 0 && (
          <>
            <span aria-hidden className="text-text-tertiary">
              on
            </span>
            <div className="flex gap-1.5">
              {boardCards.map((card, i) => (
                <PlayingCard key={i} card={card} size="sm" />
              ))}
            </div>
          </>
        )}
      </div>
      {label !== undefined && (
        <figcaption className="text-text-tertiary text-caption">{label}</figcaption>
      )}
    </figure>
  );
}

/** A static table snapshot: positions, the pot, and what has happened. */
export function TableExample({
  hero,
  pot,
  lines,
}: {
  hero: string;
  pot: number;
  lines: readonly string[];
}) {
  return (
    <figure
      className="border-border bg-surface-1 my-5 flex flex-col gap-2 rounded-lg border px-4 py-3"
      data-table-example
    >
      <div className="text-text-tertiary text-caption flex justify-between font-mono">
        <span>You are {hero}</span>
        <span>pot {pot.toFixed(1)}bb</span>
      </div>
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line} className="text-body-sm text-text-secondary">
            {line}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** The takeaway box. One per lesson, at the end — the rule of thumb to keep. */
export function KeyIdea({ children }: { children: ReactNode }) {
  return (
    <aside
      className="border-accent bg-surface-1 my-6 rounded-lg border-l-2 px-4 py-3"
      data-key-idea
    >
      <p className="text-overline text-accent-bright mb-1 uppercase">Key idea</p>
      <div className="text-body-lg font-medium">{children}</div>
    </aside>
  );
}

/** An inline comprehension check. Answering reveals; nothing is recorded. */
export function Checkpoint({
  question,
  options,
  answer,
  explain,
}: {
  question: string;
  options: readonly string[];
  /** Index into options. */
  answer: number;
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

export const curriculumComponents = {
  RangeGridEmbed,
  HandExample,
  TableExample,
  KeyIdea,
  Checkpoint,
};
