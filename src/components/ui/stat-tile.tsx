"use client";

import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/motion";
import { SegmentedMeter } from "@/components/ui/segmented-meter";
import { StatInfoSheet } from "@/components/ui/stat-info-sheet";
import { getGlossaryEntry, verdictFor } from "@/content/glossary";

export interface StatTileProps {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  /** Change since the last period. Positive is not automatically good — see `higherIsBetter`. */
  delta?: number;
  /** EV lost is a stat where down is up. */
  higherIsBetter?: boolean;
  /** A `GLOSSARY` id. Adds the (i) and the plain-word verdict. */
  stat?: string;
  /** Show a discrete meter under the number. */
  meterMax?: number;
  className?: string;
}

/**
 * A single number, given enough context to mean something.
 *
 * Deltas are coloured by whether they are GOOD, not by their sign — EV lost
 * falling is an improvement even though the number went down. Colour is never
 * the only signal: the arrow carries the direction independently.
 */
export function StatTile({
  label,
  value,
  decimals = 0,
  suffix = "",
  delta,
  higherIsBetter = true,
  stat,
  meterMax,
  className,
}: StatTileProps) {
  const entry = stat === undefined ? undefined : getGlossaryEntry(stat);
  const improved = delta === undefined ? null : higherIsBetter ? delta > 0 : delta < 0;

  return (
    <div
      className={cn("border-border bg-surface-1 rounded-lg border", className)}
      style={{ padding: "var(--card-padding)" }}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        <p className="text-overline text-text-tertiary uppercase">{label}</p>
        {entry !== undefined && <StatInfoSheet stat={entry.id} value={value} />}
      </div>

      <p className="text-display-md mt-2 font-mono tabular-nums">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </p>

      <div className="mt-1 flex items-baseline gap-3">
        {entry !== undefined && (
          <span className="text-text-secondary text-body-sm">{verdictFor(entry, value)}</span>
        )}
        {delta !== undefined && improved !== null && (
          <span
            className="text-body-sm font-mono tabular-nums"
            style={{
              color: improved ? "var(--color-grade-best)" : "var(--color-grade-mistake)",
            }}
          >
            <span aria-hidden="true">{delta > 0 ? "▲" : "▼"}</span>{" "}
            {Math.abs(delta).toFixed(decimals)}
            {suffix}
            <span className="sr-only">
              {improved ? "improved by" : "worsened by"} {Math.abs(delta).toFixed(decimals)}
              {suffix}
            </span>
          </span>
        )}
      </div>

      {meterMax !== undefined && (
        <SegmentedMeter className="mt-4" value={value} max={meterMax} label={label} />
      )}
    </div>
  );
}
