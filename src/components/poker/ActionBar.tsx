"use client";

import { useEffect, useMemo, useState } from "react";
import type { Action, LegalAction } from "@/poker/gamestate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A named size the solution actually defines, e.g. "Bet 4bb". */
export interface SizedOption {
  readonly label: string;
  readonly action: Action;
  /** Amount in big blinds, for the secondary line. */
  readonly bb: number;
  /** Percentage of pot, for the secondary line. */
  readonly potPct: number;
}

export interface ActionBarProps {
  legalActions: readonly LegalAction[];
  /**
   * Discrete sizings from the spot's solution. When present the bar becomes a
   * 2x2 grid of size-specific buttons rather than a generic RAISE plus slider —
   * that is what makes a drill feel like a solver instead of a quiz, and it
   * removes the slider from the critical path on mobile.
   */
  sizedOptions?: readonly SizedOption[];
  potBb: number;
  bigBlind: number;
  onAction: (action: Action) => void;
  disabled?: boolean;
  className?: string;
}

const SHORTCUT_LABEL: Record<string, string> = {
  fold: "F",
  check: "C",
  call: "C",
  bet: "R",
  raise: "R",
};

function labelFor(action: LegalAction, bigBlind: number): string {
  if (action.type === "call" && action.amount !== undefined) {
    return `Call ${(action.amount / bigBlind).toFixed(1)}BB`;
  }
  return action.type.charAt(0).toUpperCase() + action.type.slice(1);
}

export function ActionBar({
  legalActions,
  sizedOptions,
  potBb,
  bigBlind,
  onAction,
  disabled = false,
  className,
}: ActionBarProps) {
  const [customBb, setCustomBb] = useState<number | null>(null);

  const passive = useMemo(
    () => legalActions.filter((a) => a.type === "fold" || a.type === "check" || a.type === "call"),
    [legalActions],
  );
  const aggressive = useMemo(
    () => legalActions.find((a) => a.type === "bet" || a.type === "raise"),
    [legalActions],
  );

  const hasSizes = sizedOptions !== undefined && sizedOptions.length > 0;

  // Keyboard shortcuts. Deliberately inert while an input is focused — the
  // sizing field is an input, and typing "4" there must not fire an action.
  useEffect(() => {
    if (disabled) return;

    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable === true) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();

      if (key === "f") {
        const fold = legalActions.find((a) => a.type === "fold");
        if (fold !== undefined) {
          event.preventDefault();
          onAction({ type: "fold" });
        }
        return;
      }

      if (key === "c") {
        const passiveAction = legalActions.find((a) => a.type === "check" || a.type === "call");
        if (passiveAction !== undefined) {
          event.preventDefault();
          onAction({ type: passiveAction.type, amount: passiveAction.amount });
        }
        return;
      }

      if (key === "r" && aggressive !== undefined) {
        event.preventDefault();
        const first = sizedOptions?.[0];
        onAction(first?.action ?? { type: aggressive.type, amount: aggressive.min });
        return;
      }

      const index = Number(key);
      if (Number.isInteger(index) && index >= 1 && index <= 5 && hasSizes) {
        const option = sizedOptions?.[index - 1];
        if (option !== undefined) {
          event.preventDefault();
          onAction(option.action);
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [legalActions, aggressive, sizedOptions, hasSizes, onAction, disabled]);

  if (legalActions.length === 0) {
    return (
      <div className={cn("text-text-tertiary text-body-md py-4 text-center", className)}>
        Waiting…
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      role="group"
      aria-label="Your action"
      aria-disabled={disabled}
    >
      {hasSizes ? (
        // 2x2 grid with size-specific labels.
        <div className="grid grid-cols-2 gap-3">
          {passive.map((action) => (
            <Button
              key={action.type}
              variant="action"
              size="action"
              disabled={disabled}
              onClick={() => onAction({ type: action.type, amount: action.amount })}
              className="w-full flex-col gap-0"
            >
              <span>{labelFor(action, bigBlind)}</span>
              <span className="text-text-tertiary text-caption font-normal">
                {SHORTCUT_LABEL[action.type]}
              </span>
            </Button>
          ))}
          {sizedOptions.map((option, i) => (
            <Button
              key={option.label}
              variant="action"
              size="action"
              disabled={disabled}
              onClick={() => onAction(option.action)}
              className="w-full flex-col gap-0"
            >
              <span>{option.label}</span>
              <span className="text-text-tertiary text-caption font-normal">
                {Math.round(option.potPct)}% pot · {i + 1}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {passive.map((action) => (
              <Button
                key={action.type}
                variant="action"
                size="action"
                disabled={disabled}
                onClick={() => onAction({ type: action.type, amount: action.amount })}
                className="w-full"
              >
                {labelFor(action, bigBlind)}
              </Button>
            ))}
            {aggressive !== undefined && (
              <Button
                variant="action"
                size="action"
                disabled={disabled}
                onClick={() =>
                  onAction({
                    type: aggressive.type,
                    amount: customBb === null ? aggressive.min : customBb * bigBlind,
                  })
                }
                className="w-full"
              >
                {aggressive.type === "bet" ? "Bet" : "Raise"}
              </Button>
            )}
          </div>

          {/* Continuous sizing falls back to quick-select chips plus a slider. */}
          {aggressive !== undefined &&
            aggressive.min !== undefined &&
            aggressive.max !== undefined && (
              <ContinuousSizer
                min={aggressive.min}
                max={aggressive.max}
                potBb={potBb}
                bigBlind={bigBlind}
                disabled={disabled}
                onChange={setCustomBb}
              />
            )}
        </>
      )}
    </div>
  );
}

const QUICK_PCT = [33, 50, 75, 100] as const;

function ContinuousSizer({
  min,
  max,
  potBb,
  bigBlind,
  disabled,
  onChange,
}: {
  min: number;
  max: number;
  potBb: number;
  bigBlind: number;
  disabled: boolean;
  onChange: (bb: number) => void;
}) {
  const minBb = min / bigBlind;
  const maxBb = max / bigBlind;
  const [bb, setBb] = useState(minBb);

  function set(next: number): void {
    const clamped = Math.min(maxBb, Math.max(minBb, next));
    setBb(clamped);
    onChange(clamped);
  }

  const potPct = potBb > 0 ? (bb / potBb) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {QUICK_PCT.map((pct) => (
          <Button
            key={pct}
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => set((potBb * pct) / 100)}
          >
            {pct === 100 ? "Pot" : `${pct}%`}
          </Button>
        ))}
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => set(maxBb)}>
          All-in
        </Button>
      </div>

      <label className="flex items-center gap-3">
        <span className="sr-only">Bet size in big blinds</span>
        <input
          type="range"
          min={minBb}
          max={maxBb}
          step={0.5}
          value={bb}
          disabled={disabled}
          onChange={(e) => set(Number(e.target.value))}
          className="accent-accent h-11 flex-1"
        />
        {/* Always both units: bb is what the player must learn to think in, pot
            percentage is what the strategy is actually expressed in. */}
        <span className="text-body-sm w-28 text-right font-mono tabular-nums">
          {bb.toFixed(1)}BB
          <span className="text-text-tertiary"> · {Math.round(potPct)}%</span>
        </span>
      </label>
    </div>
  );
}
