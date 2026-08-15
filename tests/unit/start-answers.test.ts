import { describe, expect, it } from "vitest";
import {
  answersAreComplete,
  coerceAnswers,
  requiredIdsAnswered,
  START_ANSWERS_KEY,
  START_CONTINUE_PATH,
} from "../../src/lib/start-answers";
import { authOnlyRedirect } from "../../src/lib/auth-only-redirect";
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

  /**
   * The bug this pins: after /start → signup, the new session is still on
   * /signup when middleware runs. Sending that to /practice skips the demo
   * hand, and with DEV_BYPASS_ENTITLEMENT it skips the paywall too.
   */
  it("sends an unpaid signup to the continue bridge, not practice", () => {
    expect(authOnlyRedirect("/signup", false)).toBe(START_CONTINUE_PATH);
    expect(authOnlyRedirect("/signup/", false)).toBe(START_CONTINUE_PATH);
    expect(authOnlyRedirect("/login", false)).toBe("/practice");
    expect(authOnlyRedirect("/signup", true)).toBe("/practice");
    expect(authOnlyRedirect("/forgot", false)).toBe("/practice");
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
