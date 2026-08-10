import type { SpotConfig } from "@/poker/generator";

/**
 * Onboarding Q2 pain → primaryLeakKey values that live on the profile.
 *
 * These are product vocabulary (`overcalling`), not generator tags
 * (`vs-open`). Mapping them is what makes the Arena "leak focus" chip
 * describe a spot that was actually filtered.
 */
export const PRIMARY_LEAK_KEYS = [
  "overcalling",
  "postflop_fundamentals",
  "preflop_ranges",
  "bluff_catching",
  "tilt_control",
] as const;

export type PrimaryLeakKey = (typeof PRIMARY_LEAK_KEYS)[number];

export function isPrimaryLeakKey(value: string): value is PrimaryLeakKey {
  return (PRIMARY_LEAK_KEYS as readonly string[]).includes(value);
}

/**
 * Turns a stored leak key into SpotConfig fields the generator understands.
 *
 * Returns null for keys that have no content family (tilt is behavioural —
 * anti-tilt difficulty already handles it) or for unknown strings.
 */
export function leakToSpotConfig(leakKey: string): Partial<SpotConfig> | null {
  switch (leakKey) {
    case "preflop_ranges":
      return { type: "preflop", tags: ["rfi", "open"] };
    case "overcalling":
      return { type: "preflop", tags: ["vs-open", "defense"] };
    case "postflop_fundamentals":
      return { type: "postflop", tags: ["dry", "wet"] };
    case "bluff_catching":
      // River decisions are the bluff-catch classroom. street is ANDed so we
      // do not pull every postflop via the synthetic "postflop" tag.
      return { type: "postflop", street: "river" };
    case "tilt_control":
      return null;
    default:
      return null;
  }
}
