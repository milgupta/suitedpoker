import type { GradeName } from "@/poker/grader";

/**
 * When the coach speaks without being asked.
 *
 * Pure and shared: the client uses it to decide whether to open a stream at all,
 * and the tests use it to prove the spend is where the plan says it is. A second
 * copy of this rule on the server is how the two quietly disagree and the bill
 * doubles.
 *
 * The economics: `best` and `solid` are the majority of answers by a wide
 * margin. Skipping them cuts AI spend by roughly 60% and costs nothing, because
 * a user who just played the right hand does not need three sentences about it —
 * they need the next hand. The "why?" button is there for the minority who do.
 *
 * `sharp` is the exception that pays for itself. It is rare by construction, it
 * is the moment the product feels worth the money, and generic praise is the
 * fastest way to waste it.
 */
export function shouldAutoExplain(grade: GradeName): boolean {
  return grade === "sharp" || grade === "inaccuracy" || grade === "mistake" || grade === "blunder";
}

/** The user's self-reported experience, from onboarding. */
export type SkillTier = "never" | "videos" | "charts" | "solver";

export const SKILL_TIERS: readonly SkillTier[] = ["never", "videos", "charts", "solver"];

/**
 * Terms a beginner has not met yet.
 *
 * A "never studied" explanation may not use any of these undefined. This is not
 * a style rule — a beginner who reads "your range is polarized" learns nothing
 * and concludes the product is not for them, and that conclusion is expensive.
 */
export const JARGON = [
  "range",
  "equity",
  "polarized",
  "polarised",
  "blocker",
  "GTO",
  "EV",
  "c-bet",
  "cbet",
  "ICM",
] as const;

/**
 * Narrows whatever is in `profiles.skill_tier` to a tier.
 *
 * Defaults to `never` — the zero-jargon end. A user whose onboarding row is
 * missing or malformed gets the most careful explanation rather than the most
 * technical one, which is the right way round to be wrong.
 */
export function tierOf(value: string | null | undefined): SkillTier {
  return SKILL_TIERS.includes(value as SkillTier) ? (value as SkillTier) : "never";
}

/** True when the tier means "explain everything, assume nothing". */
export function isNoviceTier(tier: SkillTier): boolean {
  return tier === "never" || tier === "videos";
}
