/**
 * Bet-sizing arithmetic for the ActionDock's expander, kept out of the client
 * component so "the presets clamp and step correctly" is a node test rather
 * than a DOM assertion.
 *
 * Every amount here is a TO-amount in big blinds — the total the bet is made
 * to, never the increment — matching the engine's convention so neither side
 * ever adds a committed amount twice.
 */

export interface ActionDockSizing {
  /** Smallest legal TO-amount, in bb. */
  minTo: number;
  /** Largest legal TO-amount (all-in), in bb. */
  maxTo: number;
  /** Current pot in bb, which the fraction presets are computed from. */
  potBb: number;
  onConfirm: (amountBb: number) => void;
}

/** Slider granularity. Half a big blind is the smallest amount worth arguing about. */
export const SIZE_STEP_BB = 0.5;

/** Rounds to the slider step, then clamps into the legal window. */
export function clampSize(amountBb: number, minTo: number, maxTo: number): number {
  const stepped = Math.round(amountBb / SIZE_STEP_BB) * SIZE_STEP_BB;
  return Math.min(maxTo, Math.max(minTo, stepped));
}

export interface SizePreset {
  id: string;
  label: string;
  amountBb: number;
}

/**
 * The six preset chips, in the order they render. Fractions of the pot are
 * clamped into [minTo, maxTo] rather than hidden — a ⅓-pot chip that vanishes
 * when the pot is small leaves a gap where a button was.
 */
export function sizePresets(
  sizing: Pick<ActionDockSizing, "minTo" | "maxTo" | "potBb">,
): SizePreset[] {
  const { minTo, maxTo, potBb } = sizing;
  const clamp = (amount: number) => clampSize(amount, minTo, maxTo);
  return [
    { id: "min", label: "Min", amountBb: clamp(minTo) },
    { id: "third_pot", label: "⅓ Pot", amountBb: clamp(potBb / 3) },
    { id: "half_pot", label: "½ Pot", amountBb: clamp(potBb / 2) },
    { id: "three_quarter_pot", label: "¾ Pot", amountBb: clamp(potBb * 0.75) },
    { id: "pot", label: "Pot", amountBb: clamp(potBb) },
    { id: "allin", label: "All-in", amountBb: clamp(maxTo) },
  ];
}

/** "12bb", "2.5bb" — a whole number never carries a decimal it does not need. */
export function formatBb(amountBb: number): string {
  const rounded = Math.round(amountBb * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}bb`;
}
