"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { GradeName } from "@/poker/grader";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/motion";
import { DURATION } from "@/lib/motion";
import { shouldAutoExplain } from "@/lib/explain-policy";
import { cn } from "@/lib/utils";

/**
 * The streamed post-hand explanation.
 *
 * Text arrives word by word and each word fades in. The streaming is not a
 * loading state dressed up — watching it think is part of what the subscription
 * feels like it is buying, so it is never buffered and dumped.
 *
 * `best` and `solid` do not open a stream at all. They get the one-line
 * template already rendered above this, plus a "Why?" button. That single rule
 * removes roughly 60% of the AI spend and costs nothing, because a user who
 * just played the right hand wants the next hand rather than three sentences.
 */

export interface ExplanationProps {
  spotId: string;
  action: string;
  grade: GradeName;
  /** Injectable for tests; defaults to the real endpoint. */
  fetcher?: typeof fetch;
  className?: string;
}

type Phase = "idle" | "streaming" | "done" | "failed";

export function Explanation({ spotId, action, grade, fetcher, className }: ExplanationProps) {
  const reduced = useReducedMotion() ?? false;
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const started = useRef(false);

  const run = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPhase("streaming");
    setText("");

    const doFetch = fetcher ?? fetch;

    try {
      const response = await doFetch("/api/coach/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spotId, action }),
      });

      if (!response.ok || response.body === null) {
        setPhase("failed");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        // The last element is whatever arrived after the final newline.
        pending = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          let event: { type: string; text?: string };
          try {
            event = JSON.parse(line) as { type: string; text?: string };
          } catch {
            continue;
          }

          if (event.type === "text" && event.text !== undefined) {
            const chunk = event.text;
            setText((current) => current + chunk);
          } else if (event.type === "reset") {
            setText("");
          } else if (event.type === "done") {
            setPhase("done");
          }
        }
      }

      setPhase((current) => (current === "streaming" ? "done" : current));
    } catch {
      setPhase("failed");
    }
  }, [spotId, action, fetcher]);

  const auto = shouldAutoExplain(grade);

  useEffect(() => {
    if (!auto) return;
    // A microtask so the fetch's first setState does not run synchronously
    // inside the effect and cascade a render.
    void Promise.resolve().then(run);
  }, [auto, run]);

  if (phase === "failed") {
    // Never an error state. The one-line template above this is already true
    // and already on screen, so silence is the honest fallback.
    return null;
  }

  if (phase === "idle") {
    return (
      <div className={className}>
        <Button variant="bare" size="sm" onClick={() => void run()} className="tap-target">
          Why?
        </Button>
      </div>
    );
  }

  if (text === "") {
    return (
      <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-4/5" />
      </div>
    );
  }

  return (
    <p className={cn("text-text-primary text-body-md", className)} aria-live="polite">
      {splitWords(text).map((word, index) => (
        <motion.span
          key={`${index}-${word}`}
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.fast }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  );
}

/** Words with their trailing whitespace, so spacing survives the split. */
function splitWords(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}
