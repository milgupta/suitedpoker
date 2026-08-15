import { describe, expect, it } from "vitest";
import {
  formatActionHistory,
  formatCommittedBb,
  formatHistoryLine,
  missingActionTip,
  seatChipAmount,
  situationLine,
  spotCoachTip,
  TRAINER_ACTIONS_CAPTION,
} from "@/lib/spot-situation";
import { seatActivity } from "@/lib/spot-seats";

describe("spot situation copy", () => {
  it("rewrites folded-to-hero into plain English", () => {
    expect(formatHistoryLine("folded to hero")).toBe("Everyone folded to you");
    expect(formatActionHistory(["folded to hero"])).toBe("Everyone folded to you");
  });

  it("explains an unopened pot in the situation line", () => {
    const line = situationLine("MP", ["folded to hero"], 0);
    expect(line.toLowerCase()).toContain("folded");
    expect(line.toLowerCase()).toContain("middle position");
    expect(line.toLowerCase()).toContain("can't check");
  });

  it("never says anyone folded to UTG — nobody has acted yet", () => {
    // The seat map marks zero folds on a UTG open; the sentence above the
    // table must not contradict it.
    const line = situationLine("UTG", ["folded to hero"], 0);
    expect(line.toLowerCase()).toContain("first to act");
    expect(line.toLowerCase()).not.toContain("folded");
    expect(line.toLowerCase()).toContain("can't check");
    expect(formatHistoryLine("folded to hero", "UTG")).toBe("You're first to act");
    expect(formatActionHistory(["folded to hero"], "UTG")).toBe("You're first to act");
  });

  it("names the opener when facing a raise", () => {
    const line = situationLine("BB", ["BTN opens 5"], 0);
    expect(line.toLowerCase()).toContain("button");
    expect(line.toLowerCase()).toContain("opened");
    expect(line.toLowerCase()).toContain("big blind");
  });

  it("never puts dollars in situation copy", () => {
    const blob = [
      situationLine("MP", ["folded to hero"], 0),
      situationLine("BB", ["UTG opens 5"], 0),
      formatActionHistory(["folded to hero"]),
      spotCoachTip("CO", ["folded to hero"], 0) ?? "",
      missingActionTip(["fold", "raise"]) ?? "",
    ].join(" ");
    expect(blob).not.toMatch(/\$|dollar|USD/i);
  });

  it("shows blind chips before anyone opens", () => {
    const seats = seatActivity("MP", ["folded to hero"]);
    expect(seatChipAmount("SB", seats.SB, 0)).toBe("1");
    expect(seatChipAmount("BB", seats.BB, 0)).toBe("2");
    expect(seatChipAmount("UTG", seats.UTG, 0)).toBeNull();
  });

  it("prefers the open size over the blind chip", () => {
    const seats = seatActivity("BB", ["BTN opens 5"]);
    expect(seatChipAmount("BTN", seats.BTN, 0)).toBe("5");
  });

  it("explains missing check/call after an open-or-fold chart", () => {
    expect(missingActionTip(["fold", "raise"])).toMatch(/limp/i);
    // Call is legal on RFI (limp) — no post-answer tip about a missing action.
    expect(missingActionTip(["fold", "call", "raise"])).toBeNull();
    expect(missingActionTip(["check", "bet_33"])).toBeNull();
  });

  it("coaches first-in before the decision", () => {
    expect(spotCoachTip("BTN", ["folded to hero"], 0)).toMatch(/first in/i);
    expect(spotCoachTip("BTN", ["folded to hero"], 0)).toMatch(/limp/i);
    expect(spotCoachTip("BB", ["BTN opens 5"], 0)).toMatch(/opened/i);
  });

  it("prefers server committedBb for chip labels", () => {
    expect(formatCommittedBb(0.5)).toBe("1");
    expect(formatCommittedBb(2.5)).toBe("5");
    expect(formatCommittedBb(1)).toBe("2");
  });

  it("names the trainer action bar honestly", () => {
    expect(TRAINER_ACTIONS_CAPTION.toLowerCase()).toContain("actions in this spot");
    expect(TRAINER_ACTIONS_CAPTION.toLowerCase()).toContain("chart");
    expect(TRAINER_ACTIONS_CAPTION.toLowerCase()).toMatch(/limp/);
    expect(TRAINER_ACTIONS_CAPTION).not.toMatch(/\$|dollar/i);
  });

  it("mentions limp as an option on an unopened pot", () => {
    expect(situationLine("CO", ["folded to hero"], 0).toLowerCase()).toMatch(/call \(limp\)/);
  });
});
