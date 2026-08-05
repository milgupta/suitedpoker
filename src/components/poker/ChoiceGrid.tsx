"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { combosOf, type HandKey } from "@/poker/range";
import { evColor } from "@/lib/ev-color";
import { SPRING } from "@/lib/motion";
import { PlayingCard } from "./PlayingCard";
import { cn } from "@/lib/utils";

export interface ChoiceOption {
  value: string;
  label: string;
  /** Renders a pair of cards, for hand_choice questions. */
  handKey?: HandKey;
}

export interface ChoiceGridProps {
  options: readonly ChoiceOption[];
  selected?: string;
  /** Set after answering — the correct option gets a --grade-best border. */
  correct?: string;
  /** EV loss per option, for colouring a chosen-but-wrong card. */
  evLossByValue?: Record<string, number>;
  onSelect: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * A 2x2 grid of large tappable cards.
 *
 * Arrow keys move between options and Enter or Space picks one, so the whole
 * question is answerable without a mouse — the same guarantee the ActionBar's
 * shortcuts give.
 */
export function ChoiceGrid({
  options,
  selected,
  correct,
  evLossByValue,
  onSelect,
  disabled = false,
  className,
}: ChoiceGridProps) {
  const reduced = useReducedMotion() ?? false;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number): void {
    const columns = 2;
    let next = index;

    if (event.key === "ArrowRight") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + options.length) % options.length;
    else if (event.key === "ArrowDown") next = (index + columns) % options.length;
    else if (event.key === "ArrowUp") next = (index - columns + options.length) % options.length;
    else return;

    event.preventDefault();
    refs.current[next]?.focus();
  }

  return (
    <div
      className={cn("grid grid-cols-2 gap-3", className)}
      role="radiogroup"
      aria-label="Choose an answer"
    >
      {options.map((option, index) => {
        const isSelected = option.value === selected;
        const isCorrect = correct !== undefined && option.value === correct;
        const isWrongPick = correct !== undefined && isSelected && !isCorrect;
        const loss = evLossByValue?.[option.value] ?? 0;

        return (
          <motion.button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onKeyDown={(e) => onKeyDown(e, index)}
            onClick={() => onSelect(option.value)}
            className="border-border bg-surface-1 flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border p-4 disabled:cursor-not-allowed"
            style={{
              borderColor: isCorrect
                ? "var(--color-grade-best)"
                : isWrongPick
                  ? evColor(loss)
                  : isSelected
                    ? "var(--color-accent)"
                    : undefined,
              borderWidth: isCorrect || isWrongPick || isSelected ? 2 : 1,
            }}
            whileTap={reduced || disabled ? undefined : { scale: 0.97 }}
            animate={isSelected && !reduced ? { scale: [1, 1.03, 1] } : {}}
            transition={SPRING.snappy}
          >
            {option.handKey !== undefined && (
              <span className="flex gap-1.5">
                {(combosOf(option.handKey)[0] ?? []).map((card, i) => (
                  <PlayingCard key={i} card={card} size="md" />
                ))}
              </span>
            )}
            <span className="text-body-lg font-mono font-semibold">{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
