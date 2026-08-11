/**
 * The game-surface components, rendered.
 *
 * The one structural claim that matters most is the zero-shift swap: the
 * waiting pill and the action row share one height class, so a hand ending
 * never moves the bands above it. That is asserted here against the exported
 * constant rather than eyeballed.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

const { ActionDock, ACTION_DOCK_ROW_CLASS } = await import("./ActionDock");
const { BoardBand } = await import("./BoardBand");
const { GameSurface } = await import("./GameSurface");
const { HeroDock } = await import("./HeroDock");
const { OpponentStrip } = await import("./OpponentStrip");
const { cardsFromString } = await import("@/poker/cards");
const { handStrength } = await import("@/poker/hand-strength");

afterEach(cleanup);

const noop = () => undefined;

const FIVE_SEATS = [
  { name: "Marcus", position: "UTG", stackBb: 100, folded: true },
  { name: "Elena", position: "MP", stackBb: 88, betBb: 5 },
  { name: "Christopher", position: "CO", stackBb: 92, isActing: true },
  { name: "Priya", position: "BTN", stackBb: 100, isDealer: true },
  { name: "Tom", position: "SB", stackBb: 99.5, betBb: 0.5 },
];

describe("ActionDock", () => {
  it("waiting and actions modes share the same height class — the zero-shift claim", () => {
    const { container: waiting } = render(<ActionDock kind="waiting" />);
    const waitingRoot = waiting.querySelector("[data-action-dock='waiting']");
    expect(waitingRoot?.className).toContain(ACTION_DOCK_ROW_CLASS);

    cleanup();

    const { container: actions } = render(
      <ActionDock kind="actions" onAction={noop} actions={[{ id: "fold", label: "Fold" }]} />,
    );
    const actionsRoot = actions.querySelector("[data-action-dock='actions']");
    expect(actionsRoot?.className).toContain(ACTION_DOCK_ROW_CLASS);
  });

  it("waiting defaults to the copy the design names", () => {
    render(<ActionDock kind="waiting" />);
    expect(screen.getByText("Waiting for the next hand")).toBeInTheDocument();
  });

  it("renders a button per action, printing the label and carrying the id on data-action", () => {
    const seen: string[] = [];
    render(
      <ActionDock
        kind="actions"
        onAction={(id) => seen.push(id)}
        actions={[
          { id: "fold", label: "Fold" },
          { id: "call", label: "Call 2" },
          { id: "raise_small", label: "Raise to 6" },
        ]}
      />,
    );

    const call = screen.getByRole("button", { name: "Call 2" });
    expect(call).toHaveAttribute("data-action", "call");
    fireEvent.click(call);
    expect(seen).toEqual(["call"]);
    // The identifier goes on data-action and to the server — never on screen.
    expect(screen.queryByText("raise_small")).not.toBeInTheDocument();
  });

  it("shows the expander only when sizing is provided — its absence IS the drill contract", () => {
    const { rerender } = render(
      <ActionDock kind="actions" onAction={noop} actions={[{ id: "check", label: "Check" }]} />,
    );
    expect(screen.queryByRole("button", { name: "Choose a bet size" })).not.toBeInTheDocument();

    rerender(
      <ActionDock
        kind="actions"
        onAction={noop}
        actions={[{ id: "check", label: "Check" }]}
        sizing={{ minTo: 2, maxTo: 100, potBb: 6, onConfirm: noop }}
      />,
    );
    expect(screen.getByRole("button", { name: "Choose a bet size" })).toBeInTheDocument();
  });

  it("expander swaps the row in place for slider + presets, cancel restores the buttons", () => {
    render(
      <ActionDock
        kind="actions"
        onAction={noop}
        actions={[{ id: "check", label: "Check" }]}
        sizing={{ minTo: 2, maxTo: 100, potBb: 12, onConfirm: noop }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose a bet size" }));
    expect(screen.getByRole("slider", { name: "Bet size in big blinds" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Pot|Min|All-in/ })).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Check" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel bet sizing" }));
    expect(screen.getByRole("button", { name: "Check" })).toBeInTheDocument();
  });

  it("confirms the slider amount as a TO-amount in bb", () => {
    const confirmed: number[] = [];
    render(
      <ActionDock
        kind="actions"
        onAction={noop}
        defaultExpanded
        actions={[{ id: "check", label: "Check" }]}
        sizing={{ minTo: 2, maxTo: 100, potBb: 12, onConfirm: (bb) => confirmed.push(bb) }}
      />,
    );

    const slider = screen.getByRole("slider", { name: "Bet size in big blinds" });
    fireEvent.change(slider, { target: { value: "8.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm bet/ }));
    expect(confirmed).toEqual([8.5]);
  });

  it("preset chips move the amount, clamped into the legal window", () => {
    render(
      <ActionDock
        kind="actions"
        onAction={noop}
        defaultExpanded
        actions={[{ id: "check", label: "Check" }]}
        sizing={{ minTo: 4.5, maxTo: 100, potBb: 12, onConfirm: noop }}
      />,
    );

    const slider = () =>
      screen.getByRole("slider", { name: "Bet size in big blinds" }) as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "½ Pot" }));
    expect(slider().value).toBe("6");

    // A third of a 12bb pot is 4bb — below the 4.5 min, so the chip clamps up.
    fireEvent.click(screen.getByRole("button", { name: "⅓ Pot" }));
    expect(slider().value).toBe("4.5");
  });
});

describe("OpponentStrip", () => {
  it("renders every seat with name, position and stack", () => {
    render(<OpponentStrip seats={FIVE_SEATS} />);
    for (const seat of FIVE_SEATS) {
      expect(screen.getByText(seat.name)).toBeInTheDocument();
      expect(screen.getByText(seat.position)).toBeInTheDocument();
    }
  });

  it("marks folded, acting and dealer seats in the DOM", () => {
    const { container } = render(<OpponentStrip seats={FIVE_SEATS} />);
    expect(container.querySelector("[data-position='UTG']")).toHaveAttribute("data-folded", "true");
    expect(container.querySelector("[data-position='CO']")).toHaveAttribute("data-acting", "true");
    expect(container.querySelector("[data-position='BTN']")?.textContent).toContain("D");
  });

  it("shows a neutral bet badge only for seats with chips in front", () => {
    const { container } = render(<OpponentStrip seats={FIVE_SEATS} />);
    const badges = container.querySelectorAll("[data-bet]");
    expect(badges).toHaveLength(2);
    expect(screen.getByText("5bb")).toBeInTheDocument();
    expect(screen.getByText("0.5bb")).toBeInTheDocument();
  });

  it("shows revealed cards and the hand-name chip on the winner at showdown", () => {
    const { container } = render(
      <OpponentStrip
        handName="Flush"
        seats={[
          {
            name: "Elena",
            position: "CO",
            stackBb: 84,
            revealed: cardsFromString("Kc Qd"),
            isWinner: true,
          },
          { name: "Tom", position: "SB", stackBb: 99, folded: true },
        ]}
      />,
    );
    expect(container.querySelectorAll("[data-revealed] [role='img']")).toHaveLength(2);
    expect(screen.getByText("Flush")).toBeInTheDocument();
  });
});

describe("BoardBand", () => {
  it("always renders five slots — undealt ones as backs, so a runout never shifts layout", () => {
    const { container } = render(<BoardBand board={cardsFromString("Ah 7d 2c")} potBb={6.5} />);
    // Rendered twice (mobile + desktop sizes), five slots each.
    expect(container.querySelectorAll("[role='img'][aria-label='Undealt card']")).toHaveLength(4);
    expect(container.querySelectorAll("[role='img']").length).toBeGreaterThanOrEqual(10);
  });

  it("dims every face-up card outside the highlight set and none inside it", () => {
    const board = cardsFromString("Kh 5h 2h 8c 3d");
    const highlight = new Set(board.slice(0, 3));
    const { container } = render(<BoardBand board={board} potBb={20} highlight={highlight} />);

    const dimmed = container.querySelectorAll("[data-board-slot][data-dimmed='true']");
    const bright = container.querySelectorAll("[data-board-slot][data-dimmed='false']");
    // Two renders of the band: 2 dimmed and 3 bright in each.
    expect(dimmed).toHaveLength(4);
    expect(bright).toHaveLength(6);
  });
});

describe("HeroDock", () => {
  const cards = cardsFromString("Ah 9h");
  const board = cardsFromString("Kh 5h 2h");
  const s = handStrength(cards, board);

  it("prints the strength label with the best five ghosted beneath", () => {
    const { container } = render(
      <HeroDock cards={cards} strengthLabel={s.label} bestFive={s.bestFive} stackBb={97} />,
    );
    expect(screen.getByText("Flush")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-best-five] [role='img']")).toHaveLength(5);
    expect(screen.getByText("97bb")).toBeInTheDocument();
  });

  it("carries the accent halo only when the hero is to act", () => {
    const { container, rerender } = render(
      <HeroDock cards={cards} strengthLabel={s.label} stackBb={97} toAct />,
    );
    expect(container.querySelector("[data-hero-dock]")?.className).toContain("halo");

    rerender(<HeroDock cards={cards} strengthLabel={s.label} stackBb={97} />);
    expect(container.querySelector("[data-hero-dock]")?.className).not.toContain("halo");
  });

  it("folded renders dim outlines, not card faces", () => {
    const { container } = render(
      <HeroDock cards={cards} folded strengthLabel={s.label} stackBb={97} />,
    );
    const heroCards = container.querySelector("[data-hero-cards]");
    expect(heroCards).toHaveAttribute("data-folded", "true");
    expect(heroCards?.querySelectorAll("[role='img']")).toHaveLength(0);
  });
});

describe("GameSurface", () => {
  it("lays out the four bands in order", () => {
    const { container } = render(
      <GameSurface
        opponents={<div>opponents</div>}
        board={<div>board</div>}
        hero={<div>hero</div>}
        actions={<div>actions</div>}
      />,
    );
    const bands = [...container.querySelectorAll("[data-band]")].map((el) =>
      el.getAttribute("data-band"),
    );
    expect(bands).toEqual(["opponents", "board", "hero"]);
    // Hero dock and action dock share the bottom band.
    expect(container.querySelector("[data-band='hero']")?.textContent).toBe("heroactions");
  });
});
