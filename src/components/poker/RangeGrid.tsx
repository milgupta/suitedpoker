"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { GRID_SIZE, HAND_KEYS, type HandKey } from "@/poker/range";
import { DURATION, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type RangeGridMode = "strategy" | "ev" | "frequency";

/** Action name to its share of the cell, 0–1. */
export type CellStrategy = Record<string, number>;
export type RangeStrategy = Partial<Record<HandKey, CellStrategy>>;

export interface RangeGridProps {
  strategy: RangeStrategy;
  /** Draws a bright ring around one cell — used post-drill. */
  highlightHand?: HandKey;
  onCellClick?: (key: HandKey) => void;
  mode?: RangeGridMode;
  className?: string;
}

/**
 * Colour per action.
 *
 * Blue is interface, and a range grid is reference data rather than a graded
 * decision — so this uses the accent ramp, never the grade ramp. Fold is
 * near-transparent so a tight range reads as mostly empty at a glance.
 */
const ACTION_COLOUR: Record<string, string> = {
  raise: "var(--color-accent)",
  bet: "var(--color-accent)",
  allin: "var(--color-accent-300)",
  call: "var(--color-accent-deep)",
  check: "var(--color-accent-deep)",
  fold: "transparent",
};

/** Draw order, bottom to top. Aggressive actions fill from the bottom. */
const ACTION_ORDER = ["raise", "bet", "allin", "call", "check", "fold"];

export interface Band {
  action: string;
  /** Percentage of the cell's height. */
  height: number;
  colour: string;
}

/**
 * The stacked fill bands for one cell.
 *
 * Exported and pure so the "fills match the frequencies" check is arithmetic in
 * a unit test rather than a pixel measurement in a browser.
 */
export function cellBands(cell: CellStrategy | undefined): Band[] {
  if (cell === undefined) return [];

  const total = Object.values(cell).reduce((sum, v) => sum + v, 0);
  if (total <= 0) return [];

  const known = ACTION_ORDER.filter((a) => (cell[a] ?? 0) > 0);
  const extra = Object.keys(cell).filter((a) => !ACTION_ORDER.includes(a) && (cell[a] ?? 0) > 0);

  return [...known, ...extra].map((action) => ({
    action,
    height: ((cell[action] ?? 0) / total) * 100,
    colour: ACTION_COLOUR[action] ?? "var(--color-accent-600)",
  }));
}

export function RangeGrid({
  strategy,
  highlightHand,
  onCellClick,
  mode = "strategy",
  className,
}: RangeGridProps) {
  const reduced = useReducedMotion() ?? false;
  const [selected, setSelected] = useState<HandKey | null>(null);

  // 169 cells at 10ms each is 1.7s and reads as broken, so the whole reveal is
  // capped at 300ms regardless of cell count.
  const step = staggerDelay(HAND_KEYS.length);

  return (
    <div className={cn("w-full", className)}>
      <div
        className="border-border grid w-full overflow-hidden rounded-md border"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
        role="grid"
        aria-label={`Range grid, ${mode}`}
      >
        {HAND_KEYS.map((key, index) => {
          const bands = cellBands(strategy[key]);
          const isHighlighted = key === highlightHand;
          const isSelected = key === selected;

          return (
            <motion.button
              key={key}
              type="button"
              role="gridcell"
              aria-label={key}
              onClick={() => {
                setSelected((current) => (current === key ? null : key));
                onCellClick?.(key);
              }}
              className="border-border-subtle relative aspect-square border-r border-b"
              style={{
                background: "var(--color-surface-2)",
                outline: isHighlighted
                  ? "2px solid var(--color-accent-bright)"
                  : isSelected
                    ? "2px solid var(--color-text-primary)"
                    : undefined,
                outlineOffset: "-2px",
                zIndex: isHighlighted || isSelected ? 1 : 0,
              }}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                reduced ? { duration: 0 } : { duration: DURATION.fast, delay: index * step }
              }
            >
              {/* Bands stack from the bottom, so a mixed hand reads as a
                  partially filled cell rather than as a flat colour. */}
              <span className="absolute inset-0 flex flex-col-reverse">
                {bands.map((band) => (
                  <span
                    key={band.action}
                    style={{ height: `${band.height}%`, background: band.colour }}
                  />
                ))}
              </span>

              {/* Labels only above 500px — below that the grid is purely visual
                  and detail comes from a tap. */}
              {/*
                White, not canvas-dark. The label sits on both an accent fill
                and a bare surface depending on the hand, and near-black is
                invisible on the surface and fails AA on the fill. White clears
                4.62 on the accent and 16.7 on surface-2.
              */}
              <span
                className="relative hidden font-mono text-[9px] leading-none font-semibold min-[500px]:block"
                style={{ color: "var(--color-on-accent)" }}
              >
                {key}
              </span>
            </motion.button>
          );
        })}
      </div>

      {selected !== null && (
        <CellDetail hand={selected} cell={strategy[selected]} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function CellDetail({
  hand,
  cell,
  onClose,
}: {
  hand: HandKey;
  cell: CellStrategy | undefined;
  onClose: () => void;
}) {
  const bands = cellBands(cell);

  return (
    <div
      className="border-border bg-surface-1 mt-3 rounded-lg border p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-heading-md font-mono">{hand}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary text-body-sm"
        >
          Close
        </button>
      </div>

      {bands.length === 0 ? (
        <p className="text-text-secondary text-body-sm mt-2">Not in this range.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {bands.map((band) => (
            <li key={band.action} className="text-body-sm flex justify-between font-mono">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ background: band.colour, outline: "1px solid var(--color-border)" }}
                />
                {band.action}
              </span>
              <span className="tabular-nums">{band.height.toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
