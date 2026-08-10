import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { SpotConfig } from "@/poker/generator";
import { MODULES, moduleOrder } from "@/lib/curriculum-modules";

/**
 * The curriculum's index: parses lesson frontmatter, orders modules and
 * lessons, and validates the graph. Server-side only in practice (it reads the
 * filesystem), but kept free of `server-only` so the unit tests can run it.
 *
 * Content lives in `src/content/curriculum/<module>/<order>-<slug>.mdx`. The
 * MDX body is 5.2's problem; this module owns everything above the `---`.
 */

export const CURRICULUM_ROOT = "src/content/curriculum";

// The module list lives in curriculum-modules.ts so client components can read
// it without dragging node:fs into a browser chunk.
export { MODULES, moduleOrder, type ModuleSlug } from "@/lib/curriculum-modules";

const spotConfigLoose = z.object({
  type: z.enum(["preflop", "postflop"]),
  difficulty: z.number().int().min(1).max(10).optional(),
  tags: z.array(z.string()).optional(),
  heroPos: z.enum(["UTG", "MP", "CO", "BTN", "SB", "BB"]).optional(),
  actionSeq: z.string().optional(),
  templateId: z.string().optional(),
  street: z.enum(["flop", "turn", "river"]).optional(),
});

export const frontmatterSchema = z.object({
  title: z.string().min(4),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  module: z.enum([
    "before-the-flop",
    "reading-the-board",
    "betting-with-a-plan",
    "not-losing-money",
    "playing-harder-spots",
  ]),
  order: z.number().int().min(1),
  estMinutes: z.number().int().min(2).max(20),
  concepts: z.array(z.string()).min(1),
  drillFilter: spotConfigLoose,
  prerequisites: z.array(z.string()),
});

export type LessonFrontmatter = z.infer<typeof frontmatterSchema>;

export interface Lesson extends LessonFrontmatter {
  /** Repo-relative path to the MDX file. */
  readonly path: string;
  /** The body below the frontmatter, verbatim MDX. */
  readonly body: string;
}

/**
 * Frontmatter is a strict, small format on purpose: `key: value` where value
 * is a JSON scalar, array or object. A full YAML parser accepts a hundred
 * things we never write and silently mis-parses a handful of them (the Norway
 * problem); JSON values are unambiguous.
 */
export function parseFrontmatter(source: string, path: string): { fm: unknown; body: string } {
  if (!source.startsWith("---\n")) throw new Error(`${path}: missing frontmatter`);
  const end = source.indexOf("\n---\n", 4);
  if (end === -1) throw new Error(`${path}: unterminated frontmatter`);

  const block = source.slice(4, end);
  const body = source.slice(end + 5);

  const fm: Record<string, unknown> = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) throw new Error(`${path}: bad frontmatter line: ${line}`);
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();

    try {
      fm[key] = JSON.parse(raw);
    } catch {
      // A bare string. Quoted strings took the JSON.parse path above.
      fm[key] = raw;
    }
  }

  return { fm, body };
}

export function loadLessons(root = CURRICULUM_ROOT): Lesson[] {
  const lessons: Lesson[] = [];

  for (const mod of MODULES) {
    const dir = join(root, mod.slug);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".mdx"));
    } catch {
      continue;
    }

    for (const file of files) {
      const path = join(dir, file);
      const { fm, body } = parseFrontmatter(readFileSync(path, "utf8"), path);
      const parsed = frontmatterSchema.safeParse(fm);
      if (!parsed.success) {
        throw new Error(`${path}: invalid frontmatter: ${parsed.error.message}`);
      }
      if (parsed.data.module !== mod.slug) {
        throw new Error(`${path}: module ${parsed.data.module} but lives in ${mod.slug}/`);
      }
      lessons.push({ ...parsed.data, path, body });
    }
  }

  return lessons.sort((a, b) => moduleOrder(a.module) - moduleOrder(b.module) || a.order - b.order);
}

export function getLesson(slug: string, root = CURRICULUM_ROOT): Lesson | null {
  return loadLessons(root).find((l) => l.slug === slug) ?? null;
}

/**
 * Validates the whole graph, throwing on the first structural problem. The
 * import script and the tests both run this, so a broken prerequisite cannot
 * reach the database.
 */
export function validateCurriculum(lessons: readonly Lesson[]): void {
  const slugs = new Set(lessons.map((l) => l.slug));
  if (slugs.size !== lessons.length) throw new Error("duplicate lesson slug");

  for (const lesson of lessons) {
    for (const prerequisite of lesson.prerequisites) {
      if (!slugs.has(prerequisite)) {
        throw new Error(`${lesson.slug}: prerequisite ${prerequisite} does not exist`);
      }
    }
  }

  // Orders are 1..n and unique within each module.
  for (const mod of MODULES) {
    const orders = lessons.filter((l) => l.module === mod.slug).map((l) => l.order);
    const expected = Array.from({ length: orders.length }, (_, i) => i + 1);
    if (JSON.stringify([...orders].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
      throw new Error(`${mod.slug}: lesson orders are not 1..${orders.length}`);
    }
  }
}

/** Every custom component the lessons are allowed to use. */
export const CURRICULUM_COMPONENTS = [
  "RangeGridEmbed",
  "HandExample",
  "TableExample",
  "KeyIdea",
  "Checkpoint",
] as const;

/** Component names actually used in a body, for the defined-set check. */
export function componentsUsed(body: string): string[] {
  const used = new Set<string>();
  for (const match of body.matchAll(/<([A-Z][A-Za-z]*)[\s/>]/g)) {
    used.add(match[1]!);
  }
  return [...used];
}

/** The drill config a lesson practices with, typed for the generator. */
export function drillConfigOf(lesson: Lesson): SpotConfig {
  return lesson.drillFilter as SpotConfig;
}
