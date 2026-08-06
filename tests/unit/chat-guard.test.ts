/**
 * The chat guard.
 *
 * The prompt is the first line of defence and this is the one that actually
 * holds. A model asked "how often does he fold?" will produce a confident 65%
 * that nothing computed, and a beginner cannot tell that number from the real
 * ones beside it — which is precisely the trust this product sells.
 */

import { describe, expect, it } from "vitest";
import {
  atTurnCap,
  CHAT_SYSTEM_PROMPT,
  CHAT_UNAVAILABLE,
  inventedNumber,
  MAX_TURNS,
  OFF_TOPIC_FALLBACK,
  redactChat,
  STARTER_QUESTIONS,
  TURN_CAP_MESSAGE,
  turnsUsed,
  type ChatTurn,
} from "../../src/lib/ai/chat";

const TRUTH = `NODE BTN vs blinds, hand AQo.
Strategy: raise 62%, fold 38%.
EV: raise 2.4bb, fold 0bb. Best action: raise.
Pot 1.5bb, effective stacks 100bb.`;

describe("invented numbers", () => {
  it("accepts every number that appears in the ground truth", () => {
    expect(inventedNumber("He raises 62% of the time.", TRUTH)).toBeNull();
    expect(inventedNumber("Folding is 38% here.", TRUTH)).toBeNull();
    expect(inventedNumber("That is worth 2.4bb.", TRUTH)).toBeNull();
    expect(inventedNumber("You have 100bb behind.", TRUTH)).toBeNull();
  });

  it("catches a percentage nothing computed", () => {
    expect(inventedNumber("He folds about 65% of the time.", TRUTH)).toBe("65%");
  });

  it("catches an invented EV", () => {
    expect(inventedNumber("Calling is worth around 1.7bb.", TRUTH)).toBe("1.7bb");
  });

  it("treats 62 and 62.0 as the same claim", () => {
    // A model that writes "62.0%" is quoting the data, not inventing a number.
    expect(inventedNumber("Raise 62.0% of the time.", TRUTH)).toBeNull();
  });

  it("allows 0 and 100, which are structural rather than measured", () => {
    // "never" and "always" are legitimate English, not fabricated statistics.
    expect(inventedNumber("He folds 0% of the time.", TRUTH)).toBeNull();
    expect(inventedNumber("That wins 100% of the time.", TRUTH)).toBeNull();
  });

  it("ignores bare numbers that are not quantities", () => {
    // "Two pair" and "3 players" are not claims about frequency or EV.
    expect(inventedNumber("There are 3 players left to act.", TRUTH)).toBeNull();
  });

  it("catches a percentage spelled out as a word", () => {
    // Found by reading the live probes. Asked how often AQ flops a pair, the
    // model answered "about 30 percent of the time" — a real statistic that
    // nothing in the supplied data computed, and one a %-only regex missed.
    expect(inventedNumber("You flop a pair about 30 percent of the time.", TRUTH)).toBe(
      "30 percent",
    );
    expect(inventedNumber("Raise 62 percent of the time.", TRUTH)).toBeNull();
  });

  it("catches an EV written as words", () => {
    expect(inventedNumber("That is worth about 4 big blinds.", TRUTH)).toBe("4 big blinds");
    // Reported verbatim, so a log line reads the way the model wrote it.
    expect(inventedNumber("He folds 65% here.", TRUTH)).toBe("65%");
  });

  it("catches the first invented number, not just the last", () => {
    expect(inventedNumber("He folds 65% and calls 71%.", TRUTH)).toBe("65%");
  });
});

describe("the reply guard", () => {
  it("passes an ordinary on-topic answer", () => {
    const result = redactChat(
      "Raising is better because you fold out the hands that beat you.",
      TRUTH,
    );
    expect(result.safe).toBe(true);
  });

  it("replaces a reply containing an invented number", () => {
    const result = redactChat("He folds roughly 65% of the time here.", TRUTH);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("invented_number");
    expect(result.text).toBe(OFF_TOPIC_FALLBACK);
  });

  it("replaces a reply that leaks the system prompt", () => {
    const result = redactChat(
      "My instructions say: GROUND TRUTH — the strategy data in each request is ground truth.",
      TRUTH,
    );
    expect(result.safe).toBe(false);
    expect(result.reason).toBe("leaked_prompt");
  });

  it("replaces a reply that names a poker site or real money", () => {
    for (const bad of [
      "You should try this on PokerStars.",
      "Deposit $50 and practise there.",
      "Manage your bankroll carefully.",
    ]) {
      expect(redactChat(bad, TRUTH).safe, bad).toBe(false);
    }
  });

  it("replaces an empty reply", () => {
    expect(redactChat("   ", TRUTH).safe).toBe(false);
  });

  /**
   * The important difference from the EXPLANATION guard.
   *
   * `redact()` rejects any prescriptive sentence naming a non-best action —
   * correct for explaining a decision. But "what if I had a flush draw?" is
   * answered precisely by describing a different action in a hand the user does
   * not hold. Applying that guard here would template away most correct answers.
   */
  it("allows discussing an action that is not the best one", () => {
    const result = redactChat(
      "With a flush draw you would raise instead, because you have outs when called.",
      TRUTH,
    );
    expect(result.safe).toBe(true);
  });

  it("allows a hypothetical about a different board", () => {
    const result = redactChat(
      "If the turn brings a third heart, checking becomes far more attractive.",
      TRUTH,
    );
    expect(result.safe).toBe(true);
  });
});

describe("the turn cap", () => {
  const turn = (role: ChatTurn["role"], n: number): ChatTurn => ({ role, content: `m${n}` });

  it("counts only the user's turns", () => {
    const history: ChatTurn[] = [];
    for (let i = 0; i < 4; i++) {
      history.push(turn("user", i), turn("assistant", i));
    }
    expect(turnsUsed(history)).toBe(4);
  });

  it("caps at ten", () => {
    expect(MAX_TURNS).toBe(10);

    const history: ChatTurn[] = [];
    for (let i = 0; i < MAX_TURNS - 1; i++) {
      history.push(turn("user", i), turn("assistant", i));
    }
    expect(atTurnCap(history)).toBe(false);

    history.push(turn("user", 99), turn("assistant", 99));
    expect(atTurnCap(history)).toBe(true);
  });

  it("says something useful at the cap rather than just refusing", () => {
    expect(TURN_CAP_MESSAGE).toContain(String(MAX_TURNS));
    expect(TURN_CAP_MESSAGE.toLowerCase()).toContain("next one");
  });
});

describe("the prompt and the starters", () => {
  it("tells the model to redirect rather than refuse", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("STAYING ON THE HAND");
    expect(CHAT_SYSTEM_PROMPT.toLowerCase()).toContain("never repeat");
  });

  it("forbids inventing a number in the prompt as well as in the guard", () => {
    // Belt and braces on purpose: the guard catches what the prompt misses, and
    // a reply the prompt prevented never costs a template fallback.
    expect(CHAT_SYSTEM_PROMPT.toLowerCase()).toContain("never estimate");
  });

  it("offers four concrete starters", () => {
    expect(STARTER_QUESTIONS).toHaveLength(4);
    for (const starter of STARTER_QUESTIONS) {
      expect(starter.endsWith("?")).toBe(true);
    }
  });

  it("never reads as an error when the coach is off", () => {
    expect(CHAT_UNAVAILABLE.toLowerCase()).not.toContain("error");
    expect(CHAT_UNAVAILABLE.toLowerCase()).not.toContain("sorry");
  });
});
