import { describe, expect, it } from "vitest";
import {
  answersAreComplete,
  coerceAnswers,
  requiredIdsAnswered,
  START_ANSWERS_KEY,
  START_CONTINUE_PATH,
} from "../../src/lib/start-answers";
import type { Answers } from "../../src/lib/onboarding";

const COMPLETE: Answers = {
  venue: "live_1_2",
  pain: "call_too_much",
  frequency: "weekly",
  goal: "move_up",
  study: "charts",
  leaks: ["facing_aggression", "bet_sizing"],
  minutes: "10",
};

describe("start-answers", () => {
  it("keeps the continue path under the entitlement-exempt /onboarding prefix", () => {
    expect(START_CONTINUE_PATH.startsWith("/onboarding")).toBe(true);
    expect(START_ANSWERS_KEY).toContain("start-answers");
  });

  it("coerces only known question fields", () => {
    const answers = coerceAnswers({
      venue: "live_1_2",
      pain: "call_too_much",
      frequency: "weekly",
      goal: "move_up",
      study: "charts",
      leaks: ["facing_aggression", 12, "bet_sizing"],
      minutes: "10",
      evil: "drop-me",
      hand: "should not appear on Answers type path",
    });

    expect(answers).toEqual({
      venue: "live_1_2",
      pain: "call_too_much",
      frequency: "weekly",
      goal: "move_up",
      study: "charts",
      leaks: ["facing_aggression", "bet_sizing"],
      minutes: "10",
    });
    expect(answersAreComplete(answers)).toBe(true);
  });

  it("rejects junk and incomplete sets", () => {
    expect(coerceAnswers(null)).toEqual({});
    expect(coerceAnswers("nope")).toEqual({});
    expect(answersAreComplete({})).toBe(false);
    expect(answersAreComplete({ venue: "home" })).toBe(false);
    expect(requiredIdsAnswered(COMPLETE).length).toBeGreaterThanOrEqual(7);
  });
});
