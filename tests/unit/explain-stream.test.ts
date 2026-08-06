/**
 * The streamed explanation.
 *
 * The interesting property is not that text arrives in pieces — it is that the
 * guard runs BEFORE any piece leaves the server. A token-by-token stream would
 * put a wrong claim on screen and retract it 200ms later, which is worse than
 * not streaming at all in a product whose whole claim is accuracy.
 *
 * So the stream is sentence-gated: a sentence is held until it is complete,
 * checked against the ground truth, and only then emitted.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Grade } from "../../src/poker/grader";
import type { ExplainEvent } from "../../src/lib/ai/coach";

const streamTextMock = vi.hoisted(() => vi.fn());
const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ streamText: streamTextMock, generateText: generateTextMock }));
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

const spotBase = {
  handKey: "A5s",
  heroPos: "BTN",
  potBb: 1.5,
  effStackBb: 100,
  actionHistory: [] as string[],
} as const;

/** A model that emits `chunks`, optionally pausing `delayMs` before each. */
function mockStream(chunks: string[], delayMs = 0): void {
  streamTextMock.mockImplementation(() => ({
    textStream: (async function* () {
      for (const chunk of chunks) {
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        yield chunk;
      }
    })(),
    usage: Promise.resolve({ inputTokens: 420, outputTokens: 70 }),
  }));
}

async function collect(nodeRef: string): Promise<ExplainEvent[]> {
  const { streamExplanation } = await import("../../src/lib/ai/coach");
  const events: ExplainEvent[] = [];
  for await (const event of streamExplanation({ ...spotBase, nodeRef }, grade, {
    skillTier: "never",
    leaks: [],
  })) {
    events.push(event);
  }
  return events;
}

function textOf(events: ExplainEvent[]): string {
  let out = "";
  for (const event of events) {
    if (event.type === "text") out += event.text;
    if (event.type === "reset") out = "";
  }
  return out;
}

beforeEach(async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key-not-a-real-one";
  const { __resetServerEnvForTests } = await import("../../src/lib/env.server");
  __resetServerEnvForTests();
  streamTextMock.mockReset();
  generateTextMock.mockReset();
});

afterEach(async () => {
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const { __resetServerEnvForTests } = await import("../../src/lib/env.server");
  __resetServerEnvForTests();
});

describe("sentence gating", () => {
  it("emits nothing until a sentence is complete", async () => {
    // Six chunks, one sentence. Anything emitted before the terminator has not
    // been checked against the ground truth yet.
    mockStream(["Raising ", "keeps ", "the ", "pressure ", "on ", "the blinds. "]);
    const events = await collect("stream:one");

    const texts = events.filter((e) => e.type === "text");
    expect(texts).toHaveLength(1);
    expect(textOf(events).trim()).toBe("Raising keeps the pressure on the blinds.");
  });

  it("emits each sentence as it completes", async () => {
    mockStream(["Raising is best. ", "It keeps the pressure on. ", "Calling is too passive."]);
    const events = await collect("stream:three");

    const texts = events.filter((e) => e.type === "text");
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(textOf(events)).toContain("Calling is too passive.");
  });

  it("does not lose a trailing fragment with no terminator", async () => {
    mockStream(["Raising is best. ", "and this never ends"]);
    expect(textOf(await collect("stream:tail"))).toContain("and this never ends");
  });

  it("reports the model as the source and prices the call", async () => {
    mockStream(["Raising keeps the pressure on the blinds. "]);
    const done = (await collect("stream:cost")).at(-1);

    expect(done?.type).toBe("done");
    if (done?.type !== "done") throw new Error("no done event");
    expect(done.source).toBe("model");
    expect(done.inputTokens).toBe(420);
    expect(done.costUsd).toBeGreaterThan(0);
  });
});

describe("the guard, mid-stream", () => {
  it("never lets a contradicting sentence reach the client", async () => {
    // The first sentence is fine. The second names a different best action.
    mockStream(["Your hand has real value here. ", "The correct play here is to fold. "]);
    const events = await collect("stream:poison");

    const emitted = events.filter((e) => e.type === "text").map((e) => e.text);
    expect(
      emitted.some((t) => /the correct play here is to fold/i.test(t)),
      "a contradicting sentence was emitted",
    ).toBe(false);

    // And the user is left with something TRUE, not with half an explanation.
    expect(events.some((e) => e.type === "reset")).toBe(true);
    expect(textOf(events)).toContain("raise");

    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("no done event");
    expect(done.source).toBe("template");
    expect(done.redactedFor).toBe("contradicts_best_action");
  });

  it("catches a contradiction that only appears in the final fragment", async () => {
    mockStream(["Your hand plays well here. ", "You should fold"]);
    const events = await collect("stream:tailpoison");

    expect(events.some((e) => e.type === "reset")).toBe(true);
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("no done event");
    expect(done.source).toBe("template");
  });

  it("replaces a half explanation when the stream dies mid-flight", async () => {
    streamTextMock.mockImplementation(() => ({
      textStream: (async function* () {
        yield "Raising is best. ";
        throw new Error("connection reset");
      })(),
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    }));

    const events = await collect("stream:died");
    expect(events.some((e) => e.type === "reset")).toBe(true);

    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("no done event");
    expect(done.source).toBe("template");
    expect(done.redactedFor).toBe("stream_failed");
  });
});

describe("cache", () => {
  it("serves the repeat from cache without touching the model", async () => {
    mockStream(["Raising keeps the pressure on the blinds. "]);
    const first = await collect("stream:cached");
    expect((first.at(-1) as { source?: string }).source).toBe("model");

    const startedAt = performance.now();
    const second = await collect("stream:cached");
    const elapsed = performance.now() - startedAt;

    const done = second.at(-1);
    if (done?.type !== "done") throw new Error("no done event");
    expect(done.source).toBe("cache");
    expect(done.costUsd).toBe(0);
    // The cache stores the canonical trimmed form; the live stream carries the
    // inter-sentence whitespace it was emitted with. The text itself must match.
    expect(textOf(second)).toBe(textOf(first).trim());
    expect(streamTextMock, "the repeat reached the model").toHaveBeenCalledTimes(1);

    console.log(`\nCACHE HIT: ${elapsed.toFixed(1)}ms vs a live model round trip\n`);
    expect(elapsed).toBeLessThan(50);
  });

  it("does not cache a redacted stream", async () => {
    mockStream(["The correct play here is to fold. "]);
    await collect("stream:notcached");

    mockStream(["Raising keeps the pressure on the blinds. "]);
    const second = await collect("stream:notcached");

    const done = second.at(-1);
    if (done?.type !== "done") throw new Error("no done event");
    expect(done.source, "a redacted explanation was cached").not.toBe("cache");
  });
});

describe("first token latency", () => {
  it("emits the first sentence as soon as it is complete, not at the end", async () => {
    // Three sentences, 60ms apart. A buffered implementation would deliver the
    // first at ~180ms; a streamed one delivers it at ~60ms.
    mockStream(["First sentence here. ", "Second one follows. ", "Third and last."], 60);

    const { streamExplanation } = await import("../../src/lib/ai/coach");
    const startedAt = performance.now();
    let firstTextAt = 0;
    let lastAt = 0;

    for await (const event of streamExplanation({ ...spotBase, nodeRef: "stream:latency" }, grade, {
      skillTier: "never",
      leaks: [],
    })) {
      if (event.type === "text" && firstTextAt === 0) firstTextAt = performance.now() - startedAt;
      lastAt = performance.now() - startedAt;
    }

    console.log(
      `\nFIRST TEXT: ${firstTextAt.toFixed(0)}ms · STREAM COMPLETE: ${lastAt.toFixed(0)}ms\n`,
    );

    expect(firstTextAt).toBeGreaterThan(0);
    expect(firstTextAt, "the first sentence waited for the whole response").toBeLessThan(lastAt);
    expect(firstTextAt).toBeLessThan(1500);
  });
});

describe("degradation", () => {
  it("falls back to the template when the model is not configured", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const { __resetServerEnvForTests } = await import("../../src/lib/env.server");
    __resetServerEnvForTests();

    const events = await collect("stream:noconfig");
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("no done event");

    expect(done.source).toBe("template");
    expect(done.redactedFor).toBe("not_configured");
    expect(textOf(events)).toContain("raise");
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("falls back to the template when the model refuses to start", async () => {
    streamTextMock.mockImplementation(() => {
      throw new Error("429 quota exceeded");
    });

    const events = await collect("stream:refused");
    const done = events.at(-1);
    if (done?.type !== "done") throw new Error("no done event");

    expect(done.source).toBe("template");
    expect(done.redactedFor).toBe("rate_limited");
    // Never an error. The user still gets something true.
    expect(textOf(events).length).toBeGreaterThan(20);
  });
});
