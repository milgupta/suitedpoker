/**
 * The onboarding quiz.
 *
 * This is the top of the paid funnel, and two of its properties are the kind
 * that rot silently: the progress bar (which every competitor's gets wrong) and
 * the answer echoing (which degrades into "at your stakes" the moment a mapping
 * is missed). Both are asserted here rather than eyeballed.
 */

import { describe, expect, it } from "vitest";
import {
  CHART_STEP,
  derive,
  deriveCurriculumEntry,
  deriveDailyMinutes,
  deriveLeakTags,
  derivePrimaryLeak,
  deriveRating,
  deriveSkillTier,
  ECHO_POINTS,
  isAnswered,
  optionsFor,
  progressAt,
  QUESTIONS,
  questionAt,
  resumeIndex,
  TOTAL_STEPS,
  type Answers,
} from "../../src/lib/onboarding";
import { initialRatingFromOnboarding } from "../../src/lib/rating";
import { SKILL_TIERS } from "../../src/lib/explain-policy";

/* ── Progress ────────────────────────────────────────────────────────────── */

describe("progress", () => {
  it("is strictly monotonic across every step", () => {
    // Runout's bar skips 7/12 -> 9/12. Astral's runs backwards. Both happen
    // because progress was computed from something other than the step index.
    let previous = 0;
    for (let step = 1; step <= TOTAL_STEPS; step++) {
      const value = progressAt(step);
      expect(value, `step ${step} did not advance`).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it("never skips a step", () => {
    // CHART_STEP asks nothing, so it is absent from QUESTIONS by design. The
    // union of questions and the interstitial must still cover 1..TOTAL_STEPS
    // with no hole — a gap here is a step the client renders as a blank screen.
    const covered = [...QUESTIONS.map((q) => q.index), CHART_STEP].sort((a, b) => a - b);
    expect(covered).toEqual(Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1));
  });

  it("gives every question a unique index and id", () => {
    expect(new Set(QUESTIONS.map((q) => q.index)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(QUESTIONS.some((q) => q.index === CHART_STEP)).toBe(false);
  });

  it("reaches exactly 100% on the last step and never exceeds it", () => {
    expect(progressAt(TOTAL_STEPS)).toBe(1);
    expect(progressAt(TOTAL_STEPS + 5)).toBe(1);
    expect(progressAt(0)).toBe(progressAt(1));
  });

  it("returns to the same value when you go back and forward again", () => {
    // Back-navigation must not disturb the bar. It is a function of the index.
    for (let step = 2; step <= TOTAL_STEPS; step++) {
      const forward = progressAt(step);
      const back = progressAt(step - 1);
      expect(back).toBeLessThan(forward);
      expect(progressAt(step)).toBe(forward);
    }
  });
});

/* ── Control shape ───────────────────────────────────────────────────────── */

describe("the control shape tells you the rule", () => {
  it("has exactly one multi-select and no free-text question", () => {
    expect(QUESTIONS.filter((q) => q.kind === "multi").map((q) => q.id)).toEqual(["leaks"]);
    // The free-text question is gone. It was optional, nothing consumed it,
    // and a keyboard on a phone is the most expensive step in a funnel.
    expect(QUESTIONS.filter((q) => q.kind === "text")).toEqual([]);
  });

  it("makes every single-select answerable in one tap", () => {
    for (const question of QUESTIONS.filter((q) => q.kind === "single")) {
      expect(question.options?.length ?? 0, `${question.id} has no options`).toBeGreaterThan(1);
    }
  });

  it("makes every remaining question required", () => {
    // Each one now feeds the derivation, so an optional answer would be a
    // silent hole in the diagnosis rather than a kindness.
    expect(QUESTIONS.filter((q) => q.optional === true)).toEqual([]);
  });

  it("describes options by content, never by label", () => {
    // "Beginner / Intermediate / Advanced" is the failure mode: nobody knows
    // which they are and everyone over-rates themselves.
    const banned = /^(beginner|intermediate|advanced|expert|novice|pro)$/i;
    for (const question of QUESTIONS) {
      for (const option of question.options ?? []) {
        expect(option.label, `${question.id}: "${option.label}"`).not.toMatch(banned);
      }
    }
  });
});

/* ── Echoing ─────────────────────────────────────────────────────────────── */

describe("answers echo forward", () => {
  const answers: Answers = { venue: "live_1_2", pain: "call_too_much" };

  it("renders every declared echo point, and prints them", () => {
    const rendered: string[] = [];

    for (const point of ECHO_POINTS) {
      const question = QUESTIONS.find((q) => q.id === point.question);
      expect(question, `no question ${point.question}`).toBeDefined();

      const withEcho = question!.prompt(answers);
      const withoutEcho = question!.prompt({});

      rendered.push(`${point.question} (echoes ${point.source}): ${withEcho}`);

      expect(
        withEcho,
        `${point.question} renders identically with and without ${point.source}`,
      ).not.toBe(withoutEcho);
    }

    console.log(`\n${"=".repeat(72)}\nECHO POINTS\n${"=".repeat(72)}\n${rendered.join("\n")}\n`);
    expect(rendered).toHaveLength(ECHO_POINTS.length);
  });

  it("uses the venue verbatim rather than 'your stakes'", () => {
    const pain = questionAt(2)!.prompt(answers);
    expect(pain).toContain("$1/$2");
    expect(pain.toLowerCase()).not.toContain("your stakes");
  });

  it("repeats the pain back in their own framing", () => {
    expect(questionAt(4)!.prompt(answers)).toContain("call too much");
  });

  it("degrades to a sensible sentence when the source is missing", () => {
    // Back-navigation can clear an answer. The question must still read.
    for (const question of QUESTIONS) {
      const text = question.prompt({});
      expect(text.length, `${question.id} rendered empty`).toBeGreaterThan(10);
      expect(text, `${question.id} leaked an undefined`).not.toContain("undefined");
      expect(text, `${question.id} left a dangling space`).not.toMatch(/\s{2,}|\s\?/);
    }
  });

  it("gives every echoed option an echo string", () => {
    // A missing echo silently falls back to the generic phrasing.
    for (const point of ECHO_POINTS) {
      for (const option of optionsFor(point.source)) {
        expect(option.echo, `${point.source}/${option.value} has no echo`).toBeDefined();
      }
    }
  });
});

/* ── Resume ──────────────────────────────────────────────────────────────── */

describe("resume", () => {
  it("starts at question 1 with nothing answered", () => {
    expect(resumeIndex({})).toBe(1);
  });

  it("resumes at Q4 when the first three are answered", () => {
    expect(resumeIndex({ venue: "home", pain: "tilt", frequency: "weekly" })).toBe(4);
  });

  it("treats an empty multi-select as unanswered", () => {
    const partial: Answers = {
      venue: "home",
      pain: "tilt",
      frequency: "weekly",
      goal: "serious",
      study: "never",
      leaks: [],
    };
    expect(resumeIndex(partial)).toBe(6);
  });

  it("does not strand anyone on the optional last question", () => {
    const all: Answers = {
      venue: "home",
      pain: "tilt",
      frequency: "weekly",
      goal: "serious",
      study: "never",
      leaks: ["tilt_control"],
      minutes: "5",
    };
    expect(resumeIndex(all)).toBe(TOTAL_STEPS);
  });

  it("knows what counts as answered", () => {
    const multi = QUESTIONS.find((q) => q.kind === "multi")!;
    expect(isAnswered(multi, { leaks: [] })).toBe(false);
    expect(isAnswered(multi, { leaks: ["tilt_control"] })).toBe(true);

    const single = QUESTIONS.find((q) => q.kind === "single")!;
    expect(isAnswered(single, {})).toBe(false);
    expect(isAnswered(single, { venue: "" })).toBe(false);
    expect(isAnswered(single, { venue: "home" })).toBe(true);
  });
});

/* ── Derivation ──────────────────────────────────────────────────────────── */

interface Combination {
  label: string;
  answers: Answers;
}

const COMBINATIONS: Combination[] = [
  {
    label: "complete beginner, play money",
    answers: {
      venue: "play_money",
      pain: "which_hands",
      frequency: "monthly",
      goal: "stop_losing",
      study: "never",
      leaks: ["blind_defense"],
      minutes: "2",
    },
  },
  {
    label: "live $1/$2 grinder who calls too much",
    answers: {
      venue: "live_1_2",
      pain: "call_too_much",
      frequency: "weekly",
      goal: "move_up",
      study: "charts",
      leaks: ["facing_aggression", "bet_sizing"],
      minutes: "10",
    },
  },
  {
    label: "solver user, online micro",
    answers: {
      venue: "online_micro",
      pain: "bluffed_off",
      frequency: "daily",
      goal: "serious",
      study: "solver",
      leaks: ["bluffing"],
      minutes: "15",
    },
  },
  {
    label: "solver reader who only plays play money",
    answers: {
      venue: "play_money",
      pain: "lost_postflop",
      frequency: "monthly",
      goal: "beat_friends",
      study: "solver",
      leaks: ["out_of_position"],
      minutes: "5",
    },
  },
  {
    label: "just starting, claims to have used a solver",
    answers: {
      venue: "starting",
      pain: "tilt",
      frequency: "yearly",
      goal: "stop_losing",
      study: "solver",
      leaks: ["tilt_control"],
      minutes: "5",
    },
  },
  {
    label: "home game, videos, tilts",
    answers: {
      venue: "home",
      pain: "tilt",
      frequency: "monthly",
      goal: "beat_friends",
      study: "videos",
      leaks: ["tilt_control", "facing_aggression"],
      minutes: "5",
    },
  },
];

describe("derivation", () => {
  it("prints the table for every combination", () => {
    const rows = COMBINATIONS.map((c) => {
      const d = derive(c.answers);
      return (
        `${c.label.padEnd(46)} tier=${d.skillTier.padEnd(7)} rating=${String(d.rating).padEnd(5)} ` +
        `leak=${(d.primaryLeakKey ?? "none").padEnd(24)} module=${d.curriculumEntry.padEnd(20)} ` +
        `min=${d.dailyMinutes} tags=[${d.leakTags.join(", ")}]`
      );
    });

    console.log(`\n${"=".repeat(72)}\nDERIVATION TABLE\n${"=".repeat(72)}\n${rows.join("\n")}\n`);
    expect(rows).toHaveLength(6);
  });

  it("maps study answers straight onto skill tiers", () => {
    for (const tier of SKILL_TIERS) {
      expect(deriveSkillTier({ venue: "live_1_2", study: tier })).toBe(tier);
    }
  });

  it("caps a play-money player at videos, however much they have read", () => {
    // Study without table time does not transfer.
    expect(deriveSkillTier({ venue: "play_money", study: "solver" })).toBe("videos");
    expect(deriveSkillTier({ venue: "play_money", study: "charts" })).toBe("videos");
    expect(deriveSkillTier({ venue: "play_money", study: "never" })).toBe("never");
  });

  it("caps someone just starting out at never", () => {
    expect(deriveSkillTier({ venue: "starting", study: "solver" })).toBe("never");
  });

  it("never caps upwards", () => {
    // Being wrong LOW costs a few easy spots the rating corrects in twenty
    // hands. Being wrong HIGH makes a beginner's first session impossible, and
    // they do not come back to be corrected.
    const order = [...SKILL_TIERS];
    for (const venue of ["home", "online_micro", "live_1_2", "play_money", "starting"]) {
      for (const study of SKILL_TIERS) {
        const derived = deriveSkillTier({ venue, study });
        expect(order.indexOf(derived), `${venue}/${study}`).toBeLessThanOrEqual(
          order.indexOf(study),
        );
      }
    }
  });

  it("takes the rating from 3.3's table rather than a second copy", () => {
    for (const combination of COMBINATIONS) {
      const tier = deriveSkillTier(combination.answers);
      expect(deriveRating(combination.answers)).toEqual(initialRatingFromOnboarding(tier));
    }
  });

  it("defaults to never when the quiz was abandoned before Q5", () => {
    expect(deriveSkillTier({})).toBe("never");
    expect(deriveRating({}).rating).toBe(initialRatingFromOnboarding("never").rating);
  });

  it("derives a primary leak from every pain answer", () => {
    for (const option of optionsFor("pain")) {
      expect(derivePrimaryLeak({ pain: option.value }), option.value).not.toBeNull();
    }
    expect(derivePrimaryLeak({})).toBeNull();
  });

  it("puts the volunteered pain first in the leak tags", () => {
    const tags = deriveLeakTags({ pain: "call_too_much", leaks: ["bluffing", "bet_sizing"] });
    expect(tags[0]).toBe("overcalling");
    expect(tags).toEqual(["overcalling", "bluffing", "bet_sizing"]);
  });

  it("does not count the same leak twice", () => {
    // Q2 "I go on tilt" and Q6 "Tilt" are one leak. Counted twice it takes
    // double its share of the spot mix.
    const tags = deriveLeakTags({ pain: "tilt", leaks: ["tilt_control", "bluffing"] });
    expect(tags).toEqual(["tilt_control", "bluffing"]);
  });

  it("starts a complete beginner at the beginning whatever they picked", () => {
    expect(deriveCurriculumEntry({ venue: "starting", study: "never", pain: "bluffed_off" })).toBe(
      "starting-hands",
    );
  });

  it("routes a studied player to the module for their pain", () => {
    expect(deriveCurriculumEntry({ venue: "live_1_2", study: "charts", pain: "bluffed_off" })).toBe(
      "ranges-not-hands",
    );
  });

  it("always yields a module, even from nothing", () => {
    for (const combination of [...COMBINATIONS.map((c) => c.answers), {}]) {
      expect(deriveCurriculumEntry(combination)).toMatch(/^[a-z-]+$/);
    }
  });

  it("reads the daily target, defaulting to the anchored five minutes", () => {
    expect(deriveDailyMinutes({ minutes: "10" })).toBe(10);
    expect(deriveDailyMinutes({})).toBe(5);
    expect(deriveDailyMinutes({ minutes: "nonsense" })).toBe(5);
    expect(deriveDailyMinutes({ minutes: "0" })).toBe(5);
  });

  it("produces a complete, valid derivation for all six combinations", () => {
    for (const combination of COMBINATIONS) {
      const d = derive(combination.answers);
      expect(SKILL_TIERS, combination.label).toContain(d.skillTier);
      expect(d.rating, combination.label).toBeGreaterThan(0);
      expect(d.ratingDeviation).toBe(350);
      expect(d.primaryLeakKey, combination.label).not.toBeNull();
      expect(d.leakTags.length, combination.label).toBeGreaterThan(0);
      expect(d.dailyMinutes, combination.label).toBeGreaterThan(0);
    }
  });
});
