/**
 * What happens when Gemini is having a bad day.
 *
 * The drill loop is the product; the explanation is the enhancement. So every
 * model failure — timeout, rate limit, 500, empty body — must cost fluency and
 * nothing else: the user still gets a true explanation, built from the same
 * ground truth, and the request still returns 200.
 *
 * The model is mocked here rather than called. This is the only way to test a
 * timeout deterministically, and the failure modes are the point, not the prose.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grade } from "../../src/poker/grader";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText: generateTextMock }));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ modelId: model }),
}));

const grade: Grade = {
  grade: "inaccuracy",
  evLoss: 0.8,
  chosenEv: 1.2,
  bestEv: 2.0,
  bestAction: "raise",
  chosenAction: "call",
  frequencies: { raise: 0.71, call: 0.2, fold: 0.09 },
  displayMode: "clear",
  topAction: "raise",
  topFreq: 0.71,
  evGap: 0.8,
  alternativeActions: [{ action: "call", freq: 0.2, ev: 1.2, evLoss: 0.8 }],
  isBalancedAlternative: false,
};

const spot = {
  handKey: "A5s",
  heroPos: "BTN",
  potBb: 1.5,
  effStackBb: 100,
  actionHistory: [] as string[],
} as const;

beforeEach(async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key-not-a-real-one";
  const { __resetServerEnvForTests } = await import("../../src/lib/env.server");
  __resetServerEnvForTests();
  generateTextMock.mockReset();
});

afterEach(async () => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const { __resetServerEnvForTests } = await import("../../src/lib/env.server");
  __resetServerEnvForTests();
  vi.useRealTimers();
});

describe("generateCoached never throws", () => {
  it("classifies a timeout and does not retry it", async () => {
    vi.useFakeTimers();
    const { generateCoached } = await import("../../src/lib/ai/client");

    generateTextMock.mockImplementation(
      (options: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.abortSignal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const pending = generateCoached({ system: "s", prompt: "p" });
    await vi.advanceTimersByTimeAsync(9_000);
    const result = await pending;

    expect(result).toEqual({ ok: false, reason: "timeout" });
    // Retrying a timeout inside a request the user is waiting on just spends
    // their patience twice.
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("classifies a rate limit", async () => {
    const { generateCoached } = await import("../../src/lib/ai/client");
    generateTextMock.mockRejectedValue(new Error("429 Too Many Requests: quota exceeded"));

    const result = await generateCoached({ system: "s", prompt: "p" });
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("retries a transient API error and gives up cleanly", async () => {
    const { generateCoached } = await import("../../src/lib/ai/client");
    generateTextMock.mockRejectedValue(new Error("500 Internal Server Error"));

    const result = await generateCoached({ system: "s", prompt: "p" });
    expect(result).toEqual({ ok: false, reason: "api_error" });
    expect(generateTextMock).toHaveBeenCalledTimes(3);
  });

  it("recovers when a retry succeeds", async () => {
    const { generateCoached } = await import("../../src/lib/ai/client");
    generateTextMock
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValueOnce({
        text: "Raising keeps the pressure on the blinds.",
        usage: { inputTokens: 400, outputTokens: 60 },
      });

    const result = await generateCoached({ system: "s", prompt: "p" });
    expect(result.ok).toBe(true);
    expect(result.ok && result.inputTokens).toBe(400);
  });

  it("treats an empty body as a failure rather than an explanation", async () => {
    const { generateCoached } = await import("../../src/lib/ai/client");
    generateTextMock.mockResolvedValue({ text: "   ", usage: {} });

    const result = await generateCoached({ system: "s", prompt: "p" });
    expect(result).toEqual({ ok: false, reason: "empty" });
  });
});

describe("explainDecision degrades to the template", () => {
  it.each([
    ["a timeout", new Error("aborted")],
    ["a rate limit", new Error("429 quota")],
    ["a server error", new Error("500 boom")],
  ])("still returns a true explanation on %s", async (_label, error) => {
    const { explainDecision } = await import("../../src/lib/ai/coach");
    const { redact } = await import("../../src/lib/ai/redact");
    generateTextMock.mockRejectedValue(error);

    const result = await explainDecision({ ...spot, nodeRef: `degrade:${_label}` }, grade, {
      skillTier: "beginner",
      leaks: [],
    });

    expect(result.source).toBe("template");
    expect(result.costUsd).toBe(0);
    expect(result.text).toContain("raise");
    expect(redact(result.text, grade).safe).toBe(true);
  });

  it("does not cache a redacted explanation", async () => {
    // Caching a fallback would serve the template to everyone who ever hits
    // that spot, for thirty days.
    const { explainDecision } = await import("../../src/lib/ai/coach");
    generateTextMock.mockResolvedValue({
      text: "The correct play here is to fold.",
      usage: { inputTokens: 400, outputTokens: 40 },
    });

    const first = await explainDecision({ ...spot, nodeRef: "degrade:poisoned" }, grade, {
      skillTier: "beginner",
      leaks: [],
    });
    expect(first.source).toBe("template");
    expect(first.redactedFor).toBe("contradicts_best_action");

    const second = await explainDecision({ ...spot, nodeRef: "degrade:poisoned" }, grade, {
      skillTier: "beginner",
      leaks: [],
    });
    expect(second.source, "a redacted explanation was cached").not.toBe("cache");
  });

  it("caches a clean explanation and serves the repeat from it", async () => {
    const { explainDecision } = await import("../../src/lib/ai/coach");
    generateTextMock.mockResolvedValue({
      text: "Raising is best because your hand keeps its equity against a call.",
      usage: { inputTokens: 400, outputTokens: 40 },
    });

    const first = await explainDecision({ ...spot, nodeRef: "degrade:clean" }, grade, {
      skillTier: "beginner",
      leaks: [],
    });
    expect(first.source).toBe("model");

    const startedAt = performance.now();
    const second = await explainDecision({ ...spot, nodeRef: "degrade:clean" }, grade, {
      skillTier: "beginner",
      leaks: [],
    });
    const elapsed = performance.now() - startedAt;

    expect(second.source).toBe("cache");
    expect(second.text).toBe(first.text);
    expect(second.costUsd).toBe(0);
    expect(generateTextMock, "the second call reached the model").toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(50);
  });
});
