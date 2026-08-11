/**
 * THE CIRCUIT BREAKER.
 *
 * An LLM endpoint behind a flat subscription is an unbounded liability sold at
 * a fixed price. Per-user limits bound one abuser; this bounds everyone at once
 * — a viral post, a scraper, a bug in our own retry logic.
 *
 * The property that has to hold above all others is the last block: with AI
 * hard-disabled, every surface still produces a true, useful answer built from
 * the solution data. If that ever stops being true, the breaker is not a
 * safety valve, it is an outage switch.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRedis, __setRedisForTests } from "../../src/lib/redis";
import {
  allowsGeneration,
  budgetState,
  canGenerateFor,
  currentSpendUsd,
  dailyBudgetUsd,
  HARD_CAP_FRACTION,
  levelFor,
  maybeAlert,
  recordSpend,
  recordSpendFor,
  SOFT_CAP_FRACTION,
  userBudgetState,
  userDailyBudgetUsd,
  userSpentUsd,
  utcDay,
  __resetBudgetForTests,
  type BudgetLevel,
} from "../../src/lib/ai/budget";
import { templateExplanation } from "../../src/lib/ai/redact";
import { templateHint } from "../../src/lib/hints";
import { CHAT_UNAVAILABLE } from "../../src/lib/ai/chat";
import type { Grade } from "../../src/poker/grader";

const BUDGET = 25;

beforeEach(() => {
  __setRedisForTests(new MemoryRedis());
  process.env.AI_DAILY_BUDGET_USD = String(BUDGET);
});

afterEach(() => {
  __setRedisForTests(null);
  delete process.env.AI_DAILY_BUDGET_USD;
  delete process.env.AI_USER_DAILY_BUDGET_USD;
  delete process.env.ALERT_WEBHOOK_URL;
});

describe("the day boundary", () => {
  it("counts in UTC, not the user's local day", () => {
    // This is OUR bill, not a per-user allowance. A counter that rolled over 24
    // times would never be a single day's spend.
    expect(utcDay(new Date("2026-08-06T23:59:59Z"))).toBe("2026-08-06");
    expect(utcDay(new Date("2026-08-07T00:00:01Z"))).toBe("2026-08-07");
  });

  it("keeps yesterday's spend separate from today's", async () => {
    const yesterday = new Date("2026-08-06T12:00:00Z");
    const today = new Date("2026-08-07T12:00:00Z");

    await recordSpend(3, yesterday);
    expect(await currentSpendUsd(yesterday)).toBeCloseTo(3, 6);
    expect(await currentSpendUsd(today)).toBe(0);
  });
});

describe("accumulating spend", () => {
  it("adds up sub-cent amounts without losing them to rounding", async () => {
    // A single explanation costs about $0.00009. Storing dollars as a float and
    // rounding to cents would record every one of them as zero, and the counter
    // would sit at $0.00 while the real bill climbed.
    for (let i = 0; i < 1_000; i++) await recordSpend(0.00009);
    expect(await currentSpendUsd()).toBeCloseTo(0.09, 4);
  });

  it("ignores zero and negative amounts", async () => {
    await recordSpend(0);
    await recordSpend(-5);
    expect(await currentSpendUsd()).toBe(0);
  });
});

describe("the thresholds", () => {
  it("trips soft at exactly 80% and hard at exactly 100%", () => {
    expect(SOFT_CAP_FRACTION).toBe(0.8);
    expect(HARD_CAP_FRACTION).toBe(1);

    expect(levelFor(BUDGET * 0.79, BUDGET)).toBe("normal");
    expect(levelFor(BUDGET * 0.8, BUDGET)).toBe("soft");
    expect(levelFor(BUDGET * 0.99, BUDGET)).toBe("soft");
    expect(levelFor(BUDGET, BUDGET)).toBe("hard");
    expect(levelFor(BUDGET * 10, BUDGET)).toBe("hard");
  });

  it("treats a zero or negative budget as hard, never as unlimited", () => {
    // A misconfigured env var must fail toward "spend nothing".
    expect(levelFor(0, 0)).toBe("hard");
    expect(levelFor(0, -1)).toBe("hard");
  });

  it("reaches each level as real spend accumulates", async () => {
    expect((await budgetState()).level).toBe("normal");

    await recordSpend(BUDGET * 0.85);
    expect((await budgetState()).level).toBe("soft");

    await recordSpend(BUDGET * 0.2);
    expect((await budgetState()).level).toBe("hard");
  });
});

describe("degrading by feature, not by user", () => {
  /**
   * Under a hard paywall every user is paying, so there is no free tier to
   * shed. Cutting one paying customer off because they arrived after another is
   * not defensible; giving everyone a plainer explanation is.
   */
  const matrix: [BudgetLevel, boolean, boolean][] = [
    // level, cheap allowed, expensive allowed
    ["normal", true, true],
    ["soft", false, true],
    ["hard", false, false],
  ];

  it.each(matrix)("%s: cheap=%s expensive=%s", (level, cheap, expensive) => {
    expect(allowsGeneration(level, "cheap")).toBe(cheap);
    expect(allowsGeneration(level, "expensive")).toBe(expensive);
  });

  it("keeps the expensive path alive at the soft cap", () => {
    // The explanation of a MISTAKE is the product. It is the last thing to go.
    expect(allowsGeneration("soft", "expensive")).toBe(true);
  });

  it("stops everything at the hard cap", () => {
    expect(allowsGeneration("hard", "cheap")).toBe(false);
    expect(allowsGeneration("hard", "expensive")).toBe(false);
  });
});

describe("alerting", () => {
  it("fires once per threshold per day, not on every request", async () => {
    // An alert on every request past 80% is how a cost alert becomes noise,
    // then gets muted, and then the hard cap arrives with no warning at all.
    await recordSpend(BUDGET * 0.85);
    const state = await budgetState();

    expect(await maybeAlert(state)).toBe(true);
    expect(await maybeAlert(state)).toBe(false);
    expect(await maybeAlert(state)).toBe(false);
  });

  it("alerts separately for soft and hard", async () => {
    await recordSpend(BUDGET * 0.85);
    expect(await maybeAlert(await budgetState())).toBe(true);

    await recordSpend(BUDGET * 0.3);
    expect(await maybeAlert(await budgetState())).toBe(true);
  });

  it("never alerts at normal", async () => {
    expect(await maybeAlert(await budgetState())).toBe(false);
  });

  it("resets for a new day", async () => {
    await recordSpend(BUDGET, new Date("2026-08-06T12:00:00Z"));
    const day1 = await budgetState(new Date("2026-08-06T12:00:00Z"));
    expect(await maybeAlert(day1)).toBe(true);

    await recordSpend(BUDGET, new Date("2026-08-07T12:00:00Z"));
    const day2 = await budgetState(new Date("2026-08-07T12:00:00Z"));
    expect(await maybeAlert(day2)).toBe(true);
  });
});

describe("the per-user fair share", () => {
  /**
   * The global counter alone means one heavy user spends everyone's budget and
   * the time of day you practise decides whether your coach is live. The fair
   * share bounds one user's slice; past it, THAT user gets templates while
   * everyone else stays live, and the global thresholds remain the backstop.
   */

  it("defaults to $0.50 and treats an unparseable value as the default", () => {
    expect(userDailyBudgetUsd()).toBe(0.5);

    process.env.AI_USER_DAILY_BUDGET_USD = "not-a-number";
    expect(userDailyBudgetUsd()).toBe(0.5);

    process.env.AI_USER_DAILY_BUDGET_USD = "2.5";
    expect(userDailyBudgetUsd()).toBe(2.5);
  });

  it("caps one user without touching anyone else", async () => {
    await recordSpendFor("heavy-user", 0.6);

    // The heavy user is refused BOTH paths — their degradation is by user,
    // which is the one shape of degradation that protects everyone else.
    expect(await canGenerateFor("heavy-user", "cheap")).toBe(false);
    expect(await canGenerateFor("heavy-user", "expensive")).toBe(false);

    // Everyone else is untouched, on both paths.
    expect(await canGenerateFor("light-user", "cheap")).toBe(true);
    expect(await canGenerateFor("light-user", "expensive")).toBe(true);

    // And the global breaker has not moved: $0.60 of $25 is normal.
    expect((await budgetState()).level).toBe("normal");
  });

  it("closes at exactly the cap, not past it", async () => {
    await recordSpendFor("edge-user", 0.5);
    expect((await userBudgetState("edge-user")).exhausted).toBe(true);
  });

  it("records against the global counter and the user's slice in one call", async () => {
    // Micro-dollars per user too: 1,000 explanations at $0.00009 must not
    // round to zero while the pool drains.
    for (let i = 0; i < 1_000; i++) await recordSpendFor("counting-user", 0.00009);
    expect(await userSpentUsd("counting-user")).toBeCloseTo(0.09, 4);
    expect(await currentSpendUsd()).toBeCloseTo(0.09, 4);
  });

  it("keeps each user's day separate", async () => {
    const yesterday = new Date("2026-08-06T12:00:00Z");
    const today = new Date("2026-08-07T12:00:00Z");
    await recordSpendFor("day-user", 0.6, yesterday);

    expect(await userSpentUsd("day-user", yesterday)).toBeCloseTo(0.6, 6);
    expect(await userSpentUsd("day-user", today)).toBe(0);
    expect(await canGenerateFor("day-user", "expensive", today)).toBe(true);
  });

  it("keeps the global breaker as the backstop for under-cap users", async () => {
    process.env.AI_USER_DAILY_BUDGET_USD = "10";
    await recordSpend(BUDGET);

    // A user who has spent nothing is still stopped by the global hard cap.
    expect(await userSpentUsd("innocent-user")).toBe(0);
    expect(await canGenerateFor("innocent-user", "cheap")).toBe(false);
    expect(await canGenerateFor("innocent-user", "expensive")).toBe(false);
  });

  it("still degrades by feature at the global soft cap for under-cap users", async () => {
    await recordSpend(BUDGET * 0.85);

    expect(await canGenerateFor("under-cap-user", "cheap")).toBe(false);
    expect(await canGenerateFor("under-cap-user", "expensive")).toBe(true);
  });

  it("treats a zero or negative user budget as hard-closed, never unlimited", async () => {
    for (const value of ["0", "-1"]) {
      process.env.AI_USER_DAILY_BUDGET_USD = value;
      expect(userDailyBudgetUsd()).toBe(0);
      // A user with NO spend is still closed: 0 >= 0. Fails toward spending
      // nothing, and the product stays usable on templates by design.
      expect((await userBudgetState("fresh-user")).exhausted).toBe(true);
      expect(await canGenerateFor("fresh-user", "expensive")).toBe(false);
    }
  });

  it("treats an EXPLICIT zero global budget as hard, not as the default", async () => {
    // The 4.5 notes always promised this; the old parse folded "0" into the
    // unset case and quietly ran on the $25 default.
    process.env.AI_DAILY_BUDGET_USD = "0";
    expect(dailyBudgetUsd()).toBe(0);
    expect((await budgetState()).level).toBe("hard");

    delete process.env.AI_DAILY_BUDGET_USD;
    expect(dailyBudgetUsd()).toBe(25);
  });
});

describe("a Redis outage", () => {
  it("does not throw from any budget call", async () => {
    __setRedisForTests({
      get: () => Promise.reject(new Error("down")),
      set: () => Promise.reject(new Error("down")),
      del: () => Promise.reject(new Error("down")),
      incrBy: () => Promise.reject(new Error("down")),
      expire: () => Promise.reject(new Error("down")),
    });

    await expect(recordSpend(1)).resolves.toBeDefined();
    await expect(currentSpendUsd()).resolves.toBe(0);
    await expect(budgetState()).resolves.toBeDefined();
    await expect(recordSpendFor("outage-user", 1)).resolves.toBeUndefined();
    await expect(userSpentUsd("outage-user")).resolves.toBe(0);
    // Fails open, like the global counter: an outage costs bounded dollars,
    // failing closed would cost every user their coach.
    await expect(canGenerateFor("outage-user", "expensive")).resolves.toBe(true);
  });
});

/* ── the property that actually matters ──────────────────────────────────── */

describe("THE PRODUCT STILL WORKS WITH AI COMPLETELY OFF", () => {
  const grade = (over: Partial<Grade> = {}): Grade =>
    ({
      grade: "blunder",
      chosenAction: "call",
      bestAction: "fold",
      evLoss: 3.2,
      displayMode: "clear",
      frequencies: { fold: 1 },
      ...over,
    }) as Grade;

  it("every explanation surface returns real prose from the solution data", () => {
    for (const name of ["best", "sharp", "solid", "inaccuracy", "mistake", "blunder"] as const) {
      for (const tier of ["never", "videos", "charts", "solver"] as const) {
        const text = templateExplanation(grade({ grade: name }), tier);
        expect(text.trim().length, `${name}/${tier} is empty`).toBeGreaterThan(30);
        // Never an error message. The user must not be able to tell that the
        // model is off — only that the answer is plainer.
        expect(text.toLowerCase()).not.toContain("error");
        expect(text.toLowerCase()).not.toContain("unavailable");
        expect(text.toLowerCase()).not.toContain("try again");
      }
    }
  });

  it("every hint level returns real prose, and levels 1 and 2 still name no action", () => {
    const view = {
      heroPos: "BTN" as const,
      street: "preflop" as const,
      potBb: 1.5,
      effStackBb: 100,
      actionHistory: [],
      legalActions: ["fold", "call", "raise"],
      handClass: null,
      boardCards: 0,
      preflop: { situation: "rfi" as const, villainPos: null },
    };

    for (const level of [1, 2, 3] as const) {
      const text = templateHint(level, view, level === 3 ? "raise" : null);
      expect(text.trim().length, `level ${level} is empty`).toBeGreaterThan(20);
    }

    // The one property a pre-decision hint must have.
    for (const level of [1, 2] as const) {
      const text = templateHint(level, view, null).toLowerCase();
      for (const action of ["fold", "call", "raise", "check", "bet"]) {
        expect(text, `level ${level} names "${action}"`).not.toContain(action);
      }
    }
  });

  it("chat says something useful rather than apologising", () => {
    expect(CHAT_UNAVAILABLE.length).toBeGreaterThan(40);
    // It points at the panel that IS still there.
    expect(CHAT_UNAVAILABLE.toLowerCase()).toMatch(/frequenc|ev|panel/);
    expect(CHAT_UNAVAILABLE.toLowerCase()).not.toContain("error");
  });

  it("prints the degradation matrix", async () => {
    await __resetBudgetForTests();
    const rows: string[] = [];
    for (const fraction of [0, 0.5, 0.8, 0.95, 1, 1.5]) {
      const level = levelFor(BUDGET * fraction, BUDGET);
      rows.push(
        `  ${String(Math.round(fraction * 100)).padStart(4)}%  ${level.padEnd(7)} hints:${
          allowsGeneration(level, "cheap") ? "AI      " : "template"
        }  explain-correct:${allowsGeneration(level, "cheap") ? "AI      " : "template"}  explain-mistake:${
          allowsGeneration(level, "expensive") ? "AI      " : "template"
        }  chat:${allowsGeneration(level, "expensive") ? "AI" : "template"}`,
      );
    }
    console.log(
      `\n${"=".repeat(100)}\nAI BUDGET DEGRADATION\n${"=".repeat(100)}\n${rows.join("\n")}\n`,
    );
  });
});
