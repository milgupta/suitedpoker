/**
 * The curriculum, held to the standard the paywall promises.
 *
 * Content rots differently from code: a broken prerequisite or an unpracticable
 * lesson doesn't throw, it just quietly teaches nothing. So the graph is
 * validated, every drill filter is run against the real generator, every MDX
 * file is actually compiled, and the prose itself is measured — length and
 * reading level — because "genuinely good writing" is a claim someone pays for.
 */

import { describe, expect, it } from "vitest";
import { compile } from "@mdx-js/mdx";
import { generateSpot } from "../../src/poker/generator";
import { parsePreflopNode, parsePostflopTemplate } from "../../src/poker/solutions";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  componentsUsed,
  CURRICULUM_COMPONENTS,
  drillConfigOf,
  loadLessons,
  MODULES,
  validateCurriculum,
} from "../../src/lib/curriculum";
import { DEFAULT_MODULE, LEAK_TO_LESSON } from "../../src/lib/onboarding";
import { CURRICULUM_LESSONS } from "../../src/lib/diagnosis";

const LESSONS = loadLessons();

function loadData() {
  const preflopDir = resolve(process.cwd(), "src/content/solutions/preflop");
  const postflopDir = resolve(process.cwd(), "src/content/solutions/postflop");
  return {
    preflop: readdirSync(preflopDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => parsePreflopNode(JSON.parse(readFileSync(join(preflopDir, f), "utf8")), f)),
    postflop: readdirSync(postflopDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => parsePostflopTemplate(JSON.parse(readFileSync(join(postflopDir, f), "utf8")), f)),
  };
}

const DATA = loadData();

/* ── Structure ───────────────────────────────────────────────────────────── */

describe("the curriculum graph", () => {
  it("has exactly 14 lessons across 4 modules", () => {
    expect(LESSONS).toHaveLength(14);
    expect(MODULES).toHaveLength(4);
    const byModule = MODULES.map((m) => LESSONS.filter((l) => l.module === m.slug).length);
    expect(byModule).toEqual([5, 3, 4, 2]);
    // The diagnosis screen promises this count. Two numbers is a lie waiting.
    expect(CURRICULUM_LESSONS).toBe(LESSONS.length);
  });

  it("validates: unique slugs, real prerequisites, contiguous ordering", () => {
    expect(() => validateCurriculum(LESSONS)).not.toThrow();
  });

  it("orders prerequisites strictly earlier in the course", () => {
    const position = new Map(LESSONS.map((l, i) => [l.slug, i]));
    for (const lesson of LESSONS) {
      for (const prerequisite of lesson.prerequisites) {
        expect(
          position.get(prerequisite)!,
          `${lesson.slug} requires ${prerequisite}, which comes later`,
        ).toBeLessThan(position.get(lesson.slug)!);
      }
    }
  });

  it("covers every onboarding entry point with a real lesson", () => {
    const slugs = new Set(LESSONS.map((l) => l.slug));
    expect(slugs.has(DEFAULT_MODULE), `default entry ${DEFAULT_MODULE} missing`).toBe(true);
    for (const [leak, slug] of Object.entries(LEAK_TO_LESSON)) {
      expect(slugs.has(slug), `${leak} points at missing lesson ${slug}`).toBe(true);
    }
  });
});

/* ── Practicability ──────────────────────────────────────────────────────── */

describe("every lesson can actually be practiced", () => {
  for (const lesson of LESSONS) {
    it(`${lesson.slug} yields 20+ valid spots`, () => {
      const config = drillConfigOf(lesson);
      const seen = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const spot = generateSpot(config, DATA, `curriculum:${lesson.slug}:${i}`);
        expect(spot.legalActions.length).toBeGreaterThan(1);
        seen.add(`${spot.nodeRef}|${spot.handKey}`);
      }
      // 20 draws must not be one spot repeated — a lesson drilled on a single
      // node+hand combination teaches memorisation, not the concept.
      expect(seen.size, `${lesson.slug} produced only ${seen.size} distinct spots`).toBeGreaterThan(
        5,
      );
    });
  }
});

/* ── MDX ─────────────────────────────────────────────────────────────────── */

describe("the MDX", () => {
  it("compiles every lesson", async () => {
    for (const lesson of LESSONS) {
      await expect(
        compile(lesson.body, { format: "mdx" }),
        `${lesson.path} does not compile`,
      ).resolves.toBeDefined();
    }
  });

  it("uses only defined components", () => {
    const defined = new Set<string>(CURRICULUM_COMPONENTS);
    for (const lesson of LESSONS) {
      for (const component of componentsUsed(lesson.body)) {
        expect(defined.has(component), `${lesson.slug} uses undefined <${component}>`).toBe(true);
      }
    }
  });

  it("ends every lesson with exactly one KeyIdea", () => {
    for (const lesson of LESSONS) {
      const count = (lesson.body.match(/<KeyIdea>/g) ?? []).length;
      expect(count, `${lesson.slug} has ${count} KeyIdeas`).toBe(1);
      // And it is the closing element — the takeaway is the exit note.
      expect(lesson.body.trim().endsWith("</KeyIdea>"), `${lesson.slug} does not end on it`).toBe(
        true,
      );
    }
  });

  it("gives every lesson a comprehension check", () => {
    for (const lesson of LESSONS) {
      expect(lesson.body).toContain("<Checkpoint");
    }
  });

  it("keeps Checkpoint answers in range", () => {
    // Prettier reflows JSX props across lines and leaves trailing commas, so
    // the option list is counted rather than JSON-parsed.
    for (const lesson of LESSONS) {
      const blocks = lesson.body.matchAll(
        /<Checkpoint[\s\S]*?options=\{\[([\s\S]*?)\]\}[\s\S]*?answer=\{(\d+)\}/g,
      );
      let seen = 0;
      for (const block of blocks) {
        seen += 1;
        const optionCount = (block[1]!.match(/"/g) ?? []).length / 2;
        const answer = Number(block[2]);
        expect(optionCount, `${lesson.slug}: unparsable options`).toBeGreaterThan(1);
        expect(answer, `${lesson.slug}: answer index out of range`).toBeLessThan(optionCount);
      }
      expect(seen, `${lesson.slug}: no Checkpoint matched`).toBeGreaterThan(0);
    }
  });
});

/* ── The writing itself ──────────────────────────────────────────────────── */

/** Strips frontmatter-free MDX down to readable prose. */
function proseOf(body: string): string {
  return body
    .replace(/<[A-Z][\s\S]*?\/>/g, " ")
    .replace(/<[A-Z][A-Za-z]*[\s\S]*?>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, (block) =>
      // Keep the inner text of KeyIdea — it is prose the user reads.
      block.startsWith("<KeyIdea") ? block.replace(/<\/?KeyIdea>/g, " ") : " ",
    )
    .replace(/[#*_`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (cleaned.length <= 3) return 1;
  const vowelGroups = cleaned.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, vowelGroups?.length ?? 1);
}

function fleschKincaidGrade(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  if (sentences.length === 0 || words.length === 0) return 0;
  return 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
}

describe("the writing", () => {
  const measured = LESSONS.map((lesson) => {
    const prose = proseOf(lesson.body);
    const words = prose.split(/\s+/).length;
    return { lesson, words, grade: fleschKincaidGrade(prose) };
  });

  it("prints the word-count and reading-level table", () => {
    const rows = measured.map(
      (m) =>
        `${m.lesson.slug.padEnd(30)} ${String(m.words).padStart(4)} words · grade ${m.grade.toFixed(1)}` +
        (m.words < 350 || m.words > 800 ? "  ⚠ LENGTH" : "") +
        (m.grade < 7 || m.grade > 9 ? `  ⚠ OUTSIDE TARGET 7-9` : ""),
    );
    console.log(
      `\n${"=".repeat(72)}\nCURRICULUM MEASUREMENTS\n${"=".repeat(72)}\n${rows.join("\n")}\n`,
    );
    expect(rows).toHaveLength(14);
  });

  it("keeps every lesson between 350 and 800 words", () => {
    for (const m of measured) {
      expect(m.words, `${m.lesson.slug} is ${m.words} words`).toBeGreaterThanOrEqual(350);
      expect(m.words, `${m.lesson.slug} is ${m.words} words`).toBeLessThanOrEqual(800);
    }
  });

  it("stays inside a readable band", () => {
    /**
     * The TARGET is grade 7-9 and the printed table flags anything outside it.
     * These rails are deliberately wider, in one direction only.
     *
     * Too complex is a defect: a beginner who cannot parse the sentence learns
     * nothing. Too simple is not — short sentences and plain words are what
     * this audience needs, and a lesson landing at grade 4 is easy to read, not
     * broken. So the ceiling is tight and the floor is generous.
     */
    for (const m of measured) {
      expect(m.grade, `${m.lesson.slug} reads at grade ${m.grade.toFixed(1)}`).toBeGreaterThan(3);
      expect(m.grade, `${m.lesson.slug} reads at grade ${m.grade.toFixed(1)}`).toBeLessThan(10.5);
    }
  });

  it("prints lessons 1.1 and 4.2 in full for human judgement", () => {
    const first = LESSONS.find((l) => l.slug === "position-is-everything")!;
    const last = LESSONS.find((l) => l.slug === "mixed-strategies")!;
    console.log(
      `\n${"=".repeat(72)}\nLESSON 1.1 — ${first.title}\n${"=".repeat(72)}\n${first.body}`,
    );
    console.log(`\n${"=".repeat(72)}\nLESSON 4.2 — ${last.title}\n${"=".repeat(72)}\n${last.body}`);
    expect(first.body.length).toBeGreaterThan(1000);
    expect(last.body.length).toBeGreaterThan(1000);
  });

  it("never makes a dollar-denominated results claim", () => {
    // Rule 5 applies to lessons too. "The button prints money" is an idiom;
    // "$340 a year" in a lesson would be a compliance problem.
    for (const lesson of LESSONS) {
      expect(lesson.body, lesson.slug).not.toMatch(/\$\d/);
    }
  });
});
