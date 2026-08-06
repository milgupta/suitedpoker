import { MODULES, type ModuleSlug } from "@/lib/curriculum-modules";
import type { Lesson } from "@/lib/curriculum";

/**
 * The unlocking rules, pure.
 *
 * Sequential inside a module, and a module opens when the previous one is 80%
 * done. Both rules exist for the same reason: a beginner who can jump anywhere
 * lands in lesson 3.4 with no idea what a range is, concludes the product is
 * over their head, and leaves. The gate is the guidance.
 *
 * It is also enforced server-side. A locked lesson that only hides its link is
 * not locked — it is a URL away from the exact confusing experience the gate
 * exists to prevent.
 */

export type LessonStatus = "not_started" | "reading" | "practicing" | "completed";

export const LESSON_STATUSES: readonly LessonStatus[] = [
  "not_started",
  "reading",
  "practicing",
  "completed",
];

export function isLessonStatus(value: unknown): value is LessonStatus {
  return typeof value === "string" && (LESSON_STATUSES as readonly string[]).includes(value);
}

export interface ProgressRow {
  readonly lessonSlug: string;
  readonly status: LessonStatus;
  readonly attempts: number;
  readonly bestAccuracy: number | null;
  readonly scrollPos: number | null;
}

/** Accuracy needed to complete a lesson's practice set. */
export const PASS_ACCURACY = 0.6;

/** Attempts after which "mark complete anyway" appears. Never a hard wall. */
export const ATTEMPTS_BEFORE_OVERRIDE = 3;

/** Fraction of the previous module that must be complete to open the next. */
export const MODULE_UNLOCK_FRACTION = 0.8;

/** Spots in a lesson's practice set. */
export const PRACTICE_SPOTS = 10;

export interface LessonState {
  readonly lesson: Lesson;
  readonly status: LessonStatus;
  readonly attempts: number;
  readonly bestAccuracy: number | null;
  readonly locked: boolean;
  /** Why it is locked, for the tap-to-explain. Null when open. */
  readonly lockedReason: string | null;
}

export interface ModuleState {
  readonly slug: ModuleSlug;
  readonly title: string;
  readonly order: number;
  readonly lessons: readonly LessonState[];
  readonly completed: number;
  readonly total: number;
  /** 0..1 */
  readonly fraction: number;
  readonly locked: boolean;
}

function statusOf(rows: readonly ProgressRow[], slug: string): ProgressRow | undefined {
  return rows.find((r) => r.lessonSlug === slug);
}

/**
 * The whole path: modules, lessons, and exactly which are open.
 *
 * Computed in one pass from the lesson list and the user's rows so the page,
 * the API guard and the tests all read the same answer.
 */
export function buildPath(lessons: readonly Lesson[], rows: readonly ProgressRow[]): ModuleState[] {
  const modules: ModuleState[] = [];
  let previousFraction = 1; // Module 1 is always open.

  for (const mod of MODULES) {
    const inModule = lessons.filter((l) => l.module === mod.slug).sort((a, b) => a.order - b.order);

    const moduleLocked = previousFraction < MODULE_UNLOCK_FRACTION;
    const previousTitle = MODULES[mod.order - 2]?.title ?? "";

    const states: LessonState[] = [];
    let completed = 0;

    for (const [index, lesson] of inModule.entries()) {
      const row = statusOf(rows, lesson.slug);
      const status = row?.status ?? "not_started";
      if (status === "completed") completed += 1;

      // Sequential: a lesson opens when the one before it is complete.
      const previousLesson = inModule[index - 1];
      const previousDone =
        previousLesson === undefined ||
        (statusOf(rows, previousLesson.slug)?.status ?? "not_started") === "completed";

      const locked = moduleLocked || !previousDone;
      const lockedReason = !locked
        ? null
        : moduleLocked
          ? `Finish ${Math.round(MODULE_UNLOCK_FRACTION * 100)}% of ${previousTitle} first.`
          : `Complete “${previousLesson?.title ?? "the previous lesson"}” first.`;

      states.push({
        lesson,
        status,
        attempts: row?.attempts ?? 0,
        bestAccuracy: row?.bestAccuracy ?? null,
        locked,
        lockedReason,
      });
    }

    const fraction = inModule.length === 0 ? 1 : completed / inModule.length;
    modules.push({
      slug: mod.slug,
      title: mod.title,
      order: mod.order,
      lessons: states,
      completed,
      total: inModule.length,
      fraction,
      locked: moduleLocked,
    });

    previousFraction = fraction;
  }

  return modules;
}

/** The exact next incomplete, unlocked lesson — the "Continue" target. */
export function nextLesson(path: readonly ModuleState[]): LessonState | null {
  for (const mod of path) {
    for (const state of mod.lessons) {
      if (!state.locked && state.status !== "completed") return state;
    }
  }
  // Everything done, or everything locked: send them to the first lesson.
  return path[0]?.lessons[0] ?? null;
}

export function isUnlocked(path: readonly ModuleState[], slug: string): boolean {
  for (const mod of path) {
    for (const state of mod.lessons) {
      if (state.lesson.slug === slug) return !state.locked;
    }
  }
  return false;
}

/** Overall course completion, for the dashboard ring. */
export function courseFraction(path: readonly ModuleState[]): number {
  const total = path.reduce((sum, m) => sum + m.total, 0);
  const done = path.reduce((sum, m) => sum + m.completed, 0);
  return total === 0 ? 0 : done / total;
}

export interface PracticeVerdict {
  readonly passed: boolean;
  readonly status: LessonStatus;
  /** Shown when they fall short. Encouraging, never punitive. */
  readonly message: string;
  readonly canOverride: boolean;
}

/**
 * What a finished practice set means.
 *
 * Below the bar is never a wall: the copy stays encouraging, the retry is one
 * tap, and after three attempts they can mark it complete anyway. A curriculum
 * that traps someone on lesson 4 has not taught them discipline — it has lost
 * them.
 */
export function judgePractice(accuracy: number, attemptsBefore: number): PracticeVerdict {
  const attempts = attemptsBefore + 1;
  const passed = accuracy >= PASS_ACCURACY;

  if (passed) {
    return {
      passed: true,
      status: "completed",
      message: `${Math.round(accuracy * 100)}% — that concept is yours.`,
      canOverride: false,
    };
  }

  return {
    passed: false,
    status: "practicing",
    message:
      accuracy >= PASS_ACCURACY - 0.15
        ? `${Math.round(accuracy * 100)}% — close. Try 10 more.`
        : `${Math.round(accuracy * 100)}%. Re-read the key idea, then try 10 more.`,
    canOverride: attempts >= ATTEMPTS_BEFORE_OVERRIDE,
  };
}
