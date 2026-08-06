/**
 * The module list and the lesson shape — everything the CLIENT may know about
 * the curriculum.
 *
 * Split out of `curriculum.ts` because that module reads the filesystem, and a
 * client component importing anything from it drags `node:fs` into a browser
 * chunk. Turbopack fails the build with "does not support external modules",
 * which is the right error at the wrong distance from the cause.
 */

export const MODULES = [
  { slug: "before-the-flop", title: "Before the Flop", order: 1 },
  { slug: "reading-the-board", title: "Reading the Board", order: 2 },
  { slug: "betting-with-a-plan", title: "Betting With a Plan", order: 3 },
  { slug: "not-losing-money", title: "Not Losing Money", order: 4 },
] as const;

export type ModuleSlug = (typeof MODULES)[number]["slug"];

export function moduleOrder(slug: ModuleSlug): number {
  return MODULES.find((m) => m.slug === slug)?.order ?? 99;
}

/** The frontmatter fields, without the body or the path. */
export interface LessonMeta {
  readonly title: string;
  readonly slug: string;
  readonly module: ModuleSlug;
  readonly order: number;
  readonly estMinutes: number;
  readonly concepts: readonly string[];
  readonly prerequisites: readonly string[];
}
