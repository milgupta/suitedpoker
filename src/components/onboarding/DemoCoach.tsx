"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/analytics-client";
import {
  answerFor,
  DEMO_ANSWERS,
  DEMO_CHAT_FALLBACK,
  DEMO_CHAT_MAX_LENGTH,
  DEMO_CHAT_PROMPT,
  type DemoVerdict,
} from "@/lib/demo-script";
import { cn } from "@/lib/utils";

/**
 * The written verdict and the mini chat, under the fixed demo hand.
 *
 * NO MODEL RUNS HERE. Every word is from `src/lib/demo-script.ts`, matched by a
 * pure function. That is a deliberate trade on the one screen that sits in
 * front of the paywall: the real coach has a jailbreak suite, a redaction layer
 * and a spend breaker behind it, and none of those are worth standing up for an
 * unpaid surface answering questions about a single known hand. It also cannot
 * be slow, cannot be rate-limited, and cannot cost anything — three failure
 * modes that would each land on the highest-value screen in the funnel.
 *
 * The four chips are the primary interface and the box is the fallback. A
 * beginner who does not have the vocabulary cannot type the question they want
 * to ask; offering the four they were about to ask is faster than any input,
 * and it is also how we know what to answer.
 */

interface Turn {
  readonly id: string;
  /** What "already asked" is keyed on: the chip's id, or the typed text. */
  readonly key: string;
  readonly question: string;
  readonly answer: string;
  /** False when the fallback fired — counted separately in analytics. */
  readonly matched: boolean;
}

export function DemoCoach({ verdict, action }: { verdict: DemoVerdict; action: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [typed, setTyped] = useState("");

  /*
   * Derived from `turns`, never held in a ref. A ref read during render is what
   * React's compiler rejects — correctly, since the chip list would then be
   * computed from a value that changed without a re-render, and a chip could
   * stay on screen after its answer had already been given.
   */
  const asked = new Set(turns.map((turn) => turn.key));

  function ask(question: string, id?: string): void {
    const trimmed = question.trim();
    if (trimmed === "") return;

    // A chip already used is not asked twice; the answer is already on screen.
    const key = id ?? trimmed.toLowerCase();
    if (asked.has(key)) return;

    const match = answerFor(trimmed);
    setTurns((current) => [
      ...current,
      {
        id: `${key}:${String(current.length)}`,
        key,
        question: trimmed,
        answer: match?.answer ?? DEMO_CHAT_FALLBACK,
        matched: match !== null,
      },
    ]);

    capture("demo_hand_question_asked", {
      // The written id when a chip was tapped, so the funnel can tell which of
      // the four beginners actually reach for. Free text is reported only as
      // matched/unmatched — the question itself is user input and does not
      // belong in an analytics property.
      question: match?.id ?? "unmatched",
      source: id === undefined ? "typed" : "chip",
    });
  }

  const remaining = DEMO_ANSWERS.filter((entry) => !asked.has(entry.id));

  return (
    <div className="flex flex-col gap-4" data-demo-coach>
      {/* The set response. Rendered as the coach's first turn rather than as a
          separate panel, so the questions below read as a continuation of it. */}
      <div className="border-border bg-surface-1 flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-heading-md" data-verdict-headline>
          {verdict.headline}
        </p>
        <p className="text-text-secondary text-body-md" data-verdict-body>
          {verdict.body}
        </p>
      </div>

      {turns.map((turn) => (
        <div key={turn.id} className="flex flex-col gap-2">
          <p
            className="bg-surface-2 text-body-md ms-auto max-w-[85%] rounded-lg px-3 py-2"
            data-chat-question
          >
            {turn.question}
          </p>
          <p
            className="border-border bg-surface-1 text-text-secondary text-body-md rounded-lg border p-4"
            data-chat-answer
            data-matched={turn.matched}
          >
            {turn.answer}
          </p>
        </div>
      ))}

      {remaining.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-text-tertiary text-caption">{DEMO_CHAT_PROMPT}</p>
          <div className="flex flex-wrap gap-2">
            {remaining.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-chat-chip={entry.id}
                onClick={() => {
                  ask(entry.question, entry.id);
                }}
                className={cn(
                  "border-border bg-surface-1 text-body-sm hover:border-border-strong",
                  "min-h-[44px] rounded-full border px-4 text-left transition-colors",
                )}
              >
                {entry.question}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(typed);
          setTyped("");
        }}
      >
        <label className="sr-only" htmlFor="demo-chat-input">
          {DEMO_CHAT_PROMPT}
        </label>
        <input
          id="demo-chat-input"
          data-chat-input
          value={typed}
          maxLength={DEMO_CHAT_MAX_LENGTH}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          placeholder="Or type a question…"
          /* 16px minimum, or iOS zooms the whole page on focus. */
          className="border-border bg-surface-1 text-body-md placeholder:text-text-tertiary min-h-[44px] flex-1 rounded-lg border px-3"
        />
        <Button type="submit" variant="primary" size="lg" disabled={typed.trim() === ""}>
          Ask
        </Button>
      </form>

      <p className="text-text-tertiary text-caption" data-coach-note>
        {/* Says what it is. A canned Q&A that presents itself as the full coach
            is the kind of small lie a buyer discovers on day one. */}
        Four answers about this one hand. The full coach inside sees every hand you play and answers
        in the context of the spot in front of you.
      </p>
      <span className="sr-only" data-demo-action>
        {action}
      </span>
    </div>
  );
}
