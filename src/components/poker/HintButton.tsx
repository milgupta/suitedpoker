"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { FadeUp } from "@/components/motion";
import { MAX_HINT_LEVEL, type HintLevel } from "@/lib/hints";
import { cn } from "@/lib/utils";

/**
 * The hint control.
 *
 * Deliberately quiet: it sits beside the action bar rather than in it, because
 * the default path through a drill is to decide, and a loud hint button turns a
 * training tool into a lookup tool.
 *
 * Each level expands BENEATH the previous one and none of them disappear — the
 * escalation from orientation to direction is itself the lesson, and collapsing
 * level 1 when level 2 arrives throws that away.
 */

export interface HintLine {
  readonly level: HintLevel;
  readonly text: string;
}

export interface HintButtonProps {
  /** Called with the next level. Returns the text, or null if it failed. */
  onRequest: (level: HintLevel) => Promise<HintLine | null>;
  /** Hides the control entirely once the user has acted. */
  disabled?: boolean;
  /** Null until the first request comes back. */
  hintsRemaining?: number | null;
  className?: string;
}

export function HintButton({
  onRequest,
  disabled = false,
  hintsRemaining = null,
  className,
}: HintButtonProps) {
  const [lines, setLines] = useState<HintLine[]>([]);
  const [loading, setLoading] = useState(false);

  const nextLevel = (lines.length + 1) as HintLevel;
  const exhaustedLevels = lines.length >= MAX_HINT_LEVEL;
  const outOfHints = hintsRemaining !== null && hintsRemaining <= 0 && lines.length === 0;

  async function request(): Promise<void> {
    if (loading || exhaustedLevels || disabled) return;
    setLoading(true);
    try {
      const line = await onRequest(nextLevel);
      if (line !== null) setLines((current) => [...current, line]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3">
        <Button
          variant="bare"
          size="sm"
          onClick={() => void request()}
          disabled={disabled || exhaustedLevels || loading}
          aria-label={
            lines.length === 0 ? "Get a hint" : `Get hint ${nextLevel} of ${MAX_HINT_LEVEL}`
          }
          className="tap-target"
        >
          {loading ? "Thinking…" : lines.length === 0 ? "Hint" : "More"}
        </Button>

        {/* Remaining levels as dots — a progress affordance, not a scoreboard. */}
        <span className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: MAX_HINT_LEVEL }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i < lines.length ? "bg-accent" : "bg-border-strong",
              )}
            />
          ))}
        </span>

        {hintsRemaining !== null && (
          <span className="text-text-tertiary text-caption font-mono tabular-nums">
            {hintsRemaining} left today
          </span>
        )}
      </div>

      {outOfHints && (
        <p className="text-text-tertiary text-body-sm">
          You have used today&rsquo;s hints. They come back at midnight.
        </p>
      )}

      <AnimatePresence initial={false}>
        {lines.map((line) => (
          <FadeUp key={line.level}>
            <p className="border-accent bg-surface-1 text-body-md text-text-secondary rounded-md border-l-2 px-3 py-2">
              <span className="text-overline text-text-tertiary mr-2 uppercase">
                Hint {line.level}
              </span>
              {line.text}
            </p>
          </FadeUp>
        ))}
      </AnimatePresence>
    </div>
  );
}
