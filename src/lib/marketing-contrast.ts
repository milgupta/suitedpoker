import type { FrequencySegment } from "@/components/poker/FrequencyBar";

/**
 * Widen the colour gap for indifferent mixes without inventing frequencies.
 *
 * A true mix has ~0 EV gap on every played line, so `evColor` paints the whole
 * bar one green and the 70/30 split vanishes. The arena keeps honest EV
 * colouring; the landing page paints the minority at the inaccuracy (yellow)
 * stop so a first-time visitor can SEE the mix — the same yellow the product
 * uses for a small EV gap in-game. The copy next to the bar has to say that
 * out loud, or the colour starts meaning "this line is worse".
 */
export function marketingContrast(segments: readonly FrequencySegment[]): FrequencySegment[] {
  if (segments.length < 2) return [...segments];
  const indifferent = segments.every((s) => s.evLoss < 0.02);
  if (!indifferent) return [...segments];
  // 0.4bb sits on the inaccuracy/yellow portion of `evColor`'s ramp — past the
  // near-green solid band, well before mistake orange.
  return segments.map((segment, i) => (i === 0 ? segment : { ...segment, evLoss: 0.4 }));
}
