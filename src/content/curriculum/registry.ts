import type { ComponentType } from "react";

/**
 * Every lesson, as a build-time import.
 *
 * Explicit rather than globbed: a dynamic `import(variable)` cannot be
 * statically analysed, so the bundler would either inline the whole directory
 * or nothing. Fourteen lines that fail loudly when a file is renamed beats a
 * clever glob that fails silently at runtime.
 *
 * The keys are lesson slugs, and tests/unit/curriculum.test.ts asserts this map
 * matches the files on disk exactly.
 */
export const LESSON_MODULES: Record<string, () => Promise<{ default: ComponentType }>> = {
  "position-is-everything": () => import("./before-the-flop/1-position-is-everything.mdx"),
  "starting-hands": () => import("./before-the-flop/2-starting-hands.mdx"),
  "facing-a-raise": () => import("./before-the-flop/3-facing-a-raise.mdx"),
  "defending-your-big-blind": () => import("./before-the-flop/4-defending-your-big-blind.mdx"),
  "facing-a-3bet": () => import("./before-the-flop/5-facing-a-3bet.mdx"),

  "board-texture": () => import("./reading-the-board/1-board-texture.mdx"),
  "who-does-the-board-favor": () => import("./reading-the-board/2-who-does-the-board-favor.mdx"),
  "ranges-not-hands": () => import("./reading-the-board/3-ranges-not-hands.mdx"),

  "why-we-bet": () => import("./betting-with-a-plan/1-why-we-bet.mdx"),
  "bet-sizing": () => import("./betting-with-a-plan/2-bet-sizing.mdx"),
  "the-continuation-bet": () => import("./betting-with-a-plan/3-the-continuation-bet.mdx"),
  "when-to-give-up": () => import("./betting-with-a-plan/4-when-to-give-up.mdx"),

  "the-hands-that-cost-you": () => import("./not-losing-money/1-the-hands-that-cost-you.mdx"),
  "mixed-strategies": () => import("./not-losing-money/2-mixed-strategies.mdx"),
};

export function hasLessonModule(slug: string): boolean {
  return Object.hasOwn(LESSON_MODULES, slug);
}
