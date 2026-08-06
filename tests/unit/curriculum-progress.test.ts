/**
 * The unlocking rules.
 *
 * These decide what a paying beginner is allowed to see, so they are asserted
 * rather than trusted: sequential inside a module, 80% to open the next one,
 * 60% to complete a lesson, and never a permanent wall.
 */

import { describe, expect, it } from "vitest";
import { loadLessons } from "../../src/lib/curriculum";
import {
  ATTEMPTS_BEFORE_OVERRIDE,
  buildPath,
  courseFraction,
  isUnlocked,
  judgePractice,
  MODULE_UNLOCK_FRACTION,
  nextLesson,
  PASS_ACCURACY,
  type ProgressRow,
} from "../../src/lib/curriculum-progress";

const LESSONS = loadLessons();

function completed(...slugs: string[]): ProgressRow[] {
  return slugs.map((lessonSlug) => ({
    lessonSlug,
    status: "completed" as const,
    attempts: 1,
    bestAccuracy: 0.8,
    scrollPos: null,
  }));
}

const MODULE_1 = LESSONS.filter((l) => l.module === "before-the-flop").map((l) => l.slug);
const MODULE_2 = LESSONS.filter((l) => l.module === "reading-the-board").map((l) => l.slug);

describe("sequential unlocking inside a module", () => {
  it("opens only the first lesson to a brand-new user", () => {
    const path = buildPath(LESSONS, []);
    const open = path.flatMap((m) => m.lessons.filter((l) => !l.locked).map((l) => l.lesson.slug));
    expect(open).toEqual([MODULE_1[0]]);
  });

  it("opens the next lesson when the previous one completes", () => {
    const path = buildPath(LESSONS, completed(MODULE_1[0]!));
    expect(isUnlocked(path, MODULE_1[1]!)).toBe(true);
    expect(isUnlocked(path, MODULE_1[2]!), "it opened two at once").toBe(false);
  });

  it("explains every lock rather than leaving a dead click", () => {
    const path = buildPath(LESSONS, []);
    for (const mod of path) {
      for (const state of mod.lessons) {
        if (!state.locked) continue;
        expect(state.lockedReason, `${state.lesson.slug} locks with no reason`).not.toBeNull();
        expect(state.lockedReason!.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("module unlocking at 80%", () => {
  it("keeps module 2 shut below the threshold", () => {
    // 3 of 5 = 60%.
    const path = buildPath(LESSONS, completed(...MODULE_1.slice(0, 3)));
    expect(path[1]!.locked).toBe(true);
    expect(isUnlocked(path, MODULE_2[0]!)).toBe(false);
  });

  it("opens module 2 at exactly 80%, not 79%", () => {
    // 4 of 5 = exactly 80%.
    const path = buildPath(LESSONS, completed(...MODULE_1.slice(0, 4)));
    expect(path[0]!.fraction).toBe(MODULE_UNLOCK_FRACTION);
    expect(path[1]!.locked, "80% did not open the next module").toBe(false);
    expect(isUnlocked(path, MODULE_2[0]!)).toBe(true);

    // And the first lesson of module 2 only — sequencing still applies.
    expect(isUnlocked(path, MODULE_2[1]!)).toBe(false);
  });

  it("does not skip a module: 3 open only after 2 clears the bar too", () => {
    const throughOne = buildPath(LESSONS, completed(...MODULE_1));
    expect(throughOne[2]!.locked, "module 3 opened on module 1 alone").toBe(true);

    const throughTwo = buildPath(LESSONS, completed(...MODULE_1, ...MODULE_2));
    expect(throughTwo[2]!.locked).toBe(false);
  });
});

describe("the Continue target", () => {
  it("is the first lesson for a new user", () => {
    expect(nextLesson(buildPath(LESSONS, []))?.lesson.slug).toBe(MODULE_1[0]);
  });

  it("is the exact next incomplete lesson", () => {
    const path = buildPath(LESSONS, completed(...MODULE_1.slice(0, 2)));
    expect(nextLesson(path)?.lesson.slug).toBe(MODULE_1[2]);
  });

  it("never points at something locked", () => {
    for (let done = 0; done <= MODULE_1.length; done++) {
      const path = buildPath(LESSONS, completed(...MODULE_1.slice(0, done)));
      const next = nextLesson(path);
      expect(next, `no target after ${done} lessons`).not.toBeNull();
      expect(next!.locked, `${next!.lesson.slug} is locked but is the target`).toBe(false);
    }
  });

  it("tracks overall completion for the dashboard", () => {
    expect(courseFraction(buildPath(LESSONS, []))).toBe(0);
    expect(courseFraction(buildPath(LESSONS, completed(...LESSONS.map((l) => l.slug))))).toBe(1);
  });
});

describe("the 60% practice gate", () => {
  it("completes the lesson at exactly 60%, not 59%", () => {
    expect(judgePractice(PASS_ACCURACY, 0).passed).toBe(true);
    expect(judgePractice(PASS_ACCURACY - 0.01, 0).passed).toBe(false);
    expect(judgePractice(0.9, 0).status).toBe("completed");
    expect(judgePractice(0.3, 0).status).toBe("practicing");
  });

  it("stays encouraging when they fall short", () => {
    const close = judgePractice(0.5, 0);
    expect(close.message).toContain("close");
    // Never punitive: no "failed", no "wrong".
    for (const verdict of [judgePractice(0.5, 0), judgePractice(0.1, 0)]) {
      expect(verdict.message.toLowerCase()).not.toMatch(/\b(fail|failed|wrong|bad)\b/);
      expect(verdict.message).toContain("10 more");
    }
  });

  it("offers the override only after three real attempts", () => {
    expect(judgePractice(0.3, 0).canOverride, "offered on attempt 1").toBe(false);
    expect(judgePractice(0.3, 1).canOverride, "offered on attempt 2").toBe(false);
    expect(judgePractice(0.3, ATTEMPTS_BEFORE_OVERRIDE - 1).canOverride).toBe(true);
    expect(judgePractice(0.3, 9).canOverride).toBe(true);
  });

  it("never offers an override to someone who passed", () => {
    expect(judgePractice(0.9, 5).canOverride).toBe(false);
  });
});
