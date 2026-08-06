/**
 * Where roughly 60% of the AI bill is decided.
 *
 * `best` and `solid` must not open a stream. They are the majority of answers,
 * the user who just played the right hand wants the next hand rather than three
 * sentences, and the "Why?" button is there for the minority who do. `sharp` is
 * the opposite: rare by construction and the moment the product feels worth the
 * money, so it always speaks.
 *
 * These are component tests because the decision lives in the client — the
 * cheapest request is the one never sent.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Explanation } from "../../src/components/poker/Explanation";
import { GRADE_NAMES, type GradeName } from "../../src/poker/grader";

afterEach(cleanup);

/** A fetch that returns an NDJSON stream of the given events. */
function streamingFetch(lines: object[]): typeof fetch {
  return vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        }
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

const CLEAN = [
  { type: "text", text: "Raising keeps the pressure on. " },
  { type: "text", text: "Calling gives up too much." },
  { type: "done", source: "model", redactedFor: null, inputTokens: 0, outputTokens: 0, costUsd: 0 },
];

function renderFor(grade: GradeName, fetcher: typeof fetch) {
  return render(<Explanation spotId="s1" action="call" grade={grade} fetcher={fetcher} />);
}

/**
 * Each word is its own span so it can fade in independently, which means
 * `findByText` never matches a phrase. The rendered text is what matters, so
 * assert on that.
 */
async function expectText(container: HTMLElement, pattern: RegExp): Promise<void> {
  await waitFor(() => expect(container.textContent ?? "").toMatch(pattern));
}

describe("what opens a stream", () => {
  it.each(["best", "solid"] as const)("%s does NOT call the model", async (grade) => {
    const fetcher = streamingFetch(CLEAN);
    renderFor(grade, fetcher);

    // The button is the whole affordance — nothing has been requested yet.
    expect(await screen.findByRole("button", { name: "Why?" })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["sharp", "inaccuracy", "mistake", "blunder"] as const)(
    "%s calls the model without being asked",
    async (grade) => {
      const fetcher = streamingFetch(CLEAN);
      renderFor(grade, fetcher);

      await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("button", { name: "Why?" })).not.toBeInTheDocument();
    },
  );

  it("covers every grade — a new one cannot slip through unclassified", () => {
    const auto = ["sharp", "inaccuracy", "mistake", "blunder"];
    const manual = ["best", "solid"];
    expect([...auto, ...manual].sort()).toEqual([...GRADE_NAMES].sort());
  });
});

describe("the Why? button", () => {
  it("opens the stream on click and renders what arrives", async () => {
    const user = userEvent.setup();
    const fetcher = streamingFetch(CLEAN);
    const renderResult = renderFor("best", fetcher);

    const { container } = renderResult;
    await user.click(await screen.findByRole("button", { name: "Why?" }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await expectText(container, /Calling gives up too much/);
  });

  it("does not fire twice on a double click", async () => {
    // Every duplicate request is a duplicate model call and a duplicate bill.
    const user = userEvent.setup();
    const fetcher = streamingFetch(CLEAN);
    renderFor("best", fetcher);

    const button = await screen.findByRole("button", { name: "Why?" });
    await user.dblClick(button);

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });
});

describe("rendering the stream", () => {
  it("shows the text that arrived", async () => {
    const { container } = renderFor("blunder", streamingFetch(CLEAN));
    await expectText(container, /Raising keeps the pressure on/);
    await expectText(container, /Calling gives up too much/);
  });

  it("discards everything before a reset", async () => {
    // The server sends `reset` when the guard trips partway. Anything already
    // on screen must go — a half explanation is not one.
    const { container } = renderFor(
      "blunder",
      streamingFetch([
        { type: "text", text: "Your hand has real value here. " },
        { type: "reset" },
        { type: "text", text: "raise is the highest-EV action here." },
        {
          type: "done",
          source: "template",
          redactedFor: "contradicts_best_action",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        },
      ]),
    );

    await expectText(container, /highest-EV action here/);
    expect(container.textContent ?? "").not.toMatch(/Your hand has real value/);
  });

  it("renders nothing rather than an error when the request fails", async () => {
    // The one-line template above this is already true and already on screen,
    // so silence is the honest fallback. An error state would be a lie about
    // how much broke.
    const failing = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as never;
    const { container } = render(
      <Explanation spotId="s1" action="call" grade="blunder" fetcher={failing} />,
    );

    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
