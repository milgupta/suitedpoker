import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { lessons as lessonsTable, lessonProgress } from "@/db/schema";
import { loadLessons, type Lesson } from "@/lib/curriculum";
import {
  buildPath,
  isUnlocked,
  type LessonStatus,
  type ModuleState,
  type ProgressRow,
} from "@/lib/curriculum-progress";

/**
 * Progress, joined to the content on disk.
 *
 * The rows are keyed on the `lessons` table's uuid (the schema's FK), but every
 * caller thinks in slugs, so the slug↔id map is resolved once here. A missing
 * lesson row means `scripts/import-curriculum.ts` has not been run — progress
 * degrades to "nothing completed" rather than throwing, because a reader who
 * cannot open lesson one is a worse failure than a lost tick.
 */

export interface Path {
  readonly lessons: readonly Lesson[];
  readonly modules: readonly ModuleState[];
  readonly rows: readonly ProgressRow[];
}

async function slugToId(): Promise<Map<string, string>> {
  try {
    const rows = await getDb()
      .select({ id: lessonsTable.id, slug: lessonsTable.slug })
      .from(lessonsTable);
    return new Map(rows.map((r) => [r.slug, r.id]));
  } catch {
    return new Map();
  }
}

export async function loadPath(userId: string): Promise<Path> {
  const lessons = loadLessons();
  const ids = await slugToId();
  const idToSlug = new Map([...ids].map(([slug, id]) => [id, slug]));

  let rows: ProgressRow[] = [];
  try {
    const found = await getDb()
      .select({
        lessonId: lessonProgress.lessonId,
        status: lessonProgress.status,
        attempts: lessonProgress.attempts,
        bestAccuracy: lessonProgress.bestAccuracy,
        scrollPos: lessonProgress.scrollPos,
      })
      .from(lessonProgress)
      .where(eq(lessonProgress.userId, userId));

    rows = found.flatMap((r) => {
      const slug = idToSlug.get(r.lessonId);
      if (slug === undefined) return [];
      return [
        {
          lessonSlug: slug,
          status: r.status as LessonStatus,
          attempts: r.attempts,
          bestAccuracy: r.bestAccuracy === null ? null : Number(r.bestAccuracy),
          scrollPos: r.scrollPos,
        },
      ];
    });
  } catch {
    // No database is no reason to hide the curriculum.
  }

  return { lessons, modules: buildPath(lessons, rows), rows };
}

/** THE server-side gate. A hidden link is not a lock. */
export async function canOpen(userId: string, slug: string): Promise<boolean> {
  const path = await loadPath(userId);
  return isUnlocked(path.modules, slug);
}

export interface ProgressUpdate {
  readonly status?: LessonStatus;
  readonly scrollPos?: number;
  readonly accuracy?: number;
  readonly incrementAttempt?: boolean;
}

export async function saveProgress(
  userId: string,
  slug: string,
  update: ProgressUpdate,
): Promise<ProgressRow | null> {
  const ids = await slugToId();
  const lessonId = ids.get(slug);
  if (lessonId === undefined) return null;

  const db = getDb();
  const [existing] = await db
    .select({
      id: lessonProgress.id,
      status: lessonProgress.status,
      attempts: lessonProgress.attempts,
      bestAccuracy: lessonProgress.bestAccuracy,
      scrollPos: lessonProgress.scrollPos,
    })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    .limit(1);

  const previousBest = existing?.bestAccuracy === undefined ? null : Number(existing.bestAccuracy);
  const bestAccuracy =
    update.accuracy === undefined ? previousBest : Math.max(update.accuracy, previousBest ?? 0);

  // Completion is a ratchet: re-reading a finished lesson must not un-finish it.
  const nextStatus =
    existing?.status === "completed" && update.status !== undefined && update.status !== "completed"
      ? "completed"
      : (update.status ?? existing?.status ?? "not_started");

  const values = {
    status: nextStatus,
    attempts: (existing?.attempts ?? 0) + (update.incrementAttempt === true ? 1 : 0),
    bestAccuracy: bestAccuracy === null ? null : bestAccuracy.toFixed(3),
    scrollPos: update.scrollPos ?? existing?.scrollPos ?? null,
    ...(nextStatus === "completed" ? { completedAt: new Date() } : {}),
  };

  if (existing === undefined) {
    /**
     * UPSERT, not insert.
     *
     * Opening a lesson fires two writes almost at once — "reading" from the
     * mount effect and a scroll position from the first scroll — and both read
     * an empty row before either has written. Two inserts then race the unique
     * (user_id, lesson_id) index and one throws. The database already knows the
     * row is unique; this lets it settle the tie instead of the application
     * losing it.
     */
    await db
      .insert(lessonProgress)
      .values({ userId, lessonId, ...values })
      .onConflictDoUpdate({
        target: [lessonProgress.userId, lessonProgress.lessonId],
        set: values,
      });
  } else {
    await db.update(lessonProgress).set(values).where(eq(lessonProgress.id, existing.id));
  }

  return {
    lessonSlug: slug,
    status: values.status as LessonStatus,
    attempts: values.attempts,
    bestAccuracy,
    scrollPos: values.scrollPos,
  };
}
