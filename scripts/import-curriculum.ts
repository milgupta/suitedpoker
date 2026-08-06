/**
 * Upserts the curriculum into the database, keyed on slug.
 *
 * Idempotent: modules and lessons update in place, so editing an MDX file and
 * re-running refreshes titles, ordering and drill filters without touching the
 * ids that user progress rows point at. Deleting a lesson from disk does NOT
 * delete its row — progress hangs off those ids, and removing content someone
 * has completed is a decision for a human with a migration, not a sync script.
 *
 *   npx tsx scripts/import-curriculum.ts
 */

import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { loadLessons, MODULES, validateCurriculum } from "../src/lib/curriculum";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    console.error("DATABASE_URL is not set — nothing imported.");
    process.exit(1);
  }

  const lessons = loadLessons();
  validateCurriculum(lessons);
  console.log(`Parsed ${lessons.length} lessons across ${MODULES.length} modules.`);

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const moduleIds = new Map<string, string>();

  for (const mod of MODULES) {
    const [existing] = await db
      .select({ id: schema.modules.id })
      .from(schema.modules)
      .where(eq(schema.modules.slug, mod.slug))
      .limit(1);

    if (existing !== undefined) {
      await db
        .update(schema.modules)
        .set({ title: mod.title, order: mod.order })
        .where(eq(schema.modules.id, existing.id));
      moduleIds.set(mod.slug, existing.id);
    } else {
      const [inserted] = await db
        .insert(schema.modules)
        .values({ slug: mod.slug, title: mod.title, order: mod.order })
        .returning({ id: schema.modules.id });
      moduleIds.set(mod.slug, inserted!.id);
    }
    console.log(`module ${mod.slug} → ${moduleIds.get(mod.slug)}`);
  }

  for (const lesson of lessons) {
    const moduleId = moduleIds.get(lesson.module);
    if (moduleId === undefined) throw new Error(`no module for ${lesson.slug}`);

    const values = {
      moduleId,
      slug: lesson.slug,
      title: lesson.title,
      order: lesson.order,
      mdxPath: lesson.path,
      drillFilter: lesson.drillFilter,
    };

    const [existing] = await db
      .select({ id: schema.lessons.id })
      .from(schema.lessons)
      .where(eq(schema.lessons.slug, lesson.slug))
      .limit(1);

    if (existing !== undefined) {
      await db.update(schema.lessons).set(values).where(eq(schema.lessons.id, existing.id));
      console.log(`updated ${lesson.slug}`);
    } else {
      await db.insert(schema.lessons).values(values);
      console.log(`inserted ${lesson.slug}`);
    }
  }

  await client.end();
  console.log("Curriculum import complete.");
}

void main();
