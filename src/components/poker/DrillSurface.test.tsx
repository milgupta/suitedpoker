/**
 * The drill flavour of the game surface.
 *
 * The claims that matter: the seat mapping (who dims, who pulses, whose chips
 * show, hero excluded) is pure arithmetic; villains carry NO names; the
 * situation copy survives the migration off the ring; the dock is fixed
 * labeled buttons whose identifiers stay on data-action; and the answered
 * state disables the row, outlines the chart's action and drops the hero glow.
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

const { DrillSurface, drillOpponentSeats } = await import("./DrillSurface");
const { cardsFromString } = await import("@/poker/cards");
const { TRAINER_ACTIONS_CAPTION } = await import("@/lib/spot-situation");

import type { SeatView } from "@/poker/generator";
import type { DrillSpotView } from "./DrillSurface";

afterEach(cleanup);

const noop = () => undefined;

function seatView(over: Partial<SeatView> & Pick<SeatView, "seat" | "position">): SeatView {
  return {
    stackBb: 100,
    isHero: false,
    folded: false,
    toAct: false,
    action: null,
    committedBb: null,
    ...over,
  };
}

/** A vs_rfi spot: UTG opened, hero on the button with queens. */
function sampleSpot(over: Partial<DrillSpotView> = {}): DrillSpotView {
  return {
    seats: [
      seatView({ seat: 0, position: "UTG", action: "opens 5", committedBb: 2.5 }),
      seatView({ seat: 1, position: "MP", folded: true }),
      seatView({ seat: 2, position: "CO", folded: true }),
      seatView({ seat: 3, position: "BTN", isHero: true, toAct: true }),
      seatView({ seat: 4, position: "SB", toAct: true, committedBb: 0.5, stackBb: 99.5 }),
      seatView({ seat: 5, position: "BB", toAct: true, committedBb: 1, stackBb: 99 }),
    ],
    heroPos: "BTN",
    heroCards: cardsFromString("Qh Qd"),
    board: [],
    potBb: 4,
    effStackBb: 100,
    actionHistory: ["UTG opens 5"],
    legalActions: ["fold", "call", "raise_small"],
    ...over,
  };
}

describe("drillOpponentSeats", () => {
  it("maps SeatView onto the strip: hero out, folded dims, toAct pulses, chips become badges", () => {
    const mapped = drillOpponentSeats(sampleSpot().seats);

    expect(mapped.map((seat) => seat.position)).toEqual(["UTG", "MP", "CO", "SB", "BB"]);
    // Villains have no names — position is the label.
    expect(mapped.every((seat) => seat.name === undefined)).toBe(true);

    const byPos = new Map(mapped.map((seat) => [seat.position, seat]));
    expect(byPos.get("MP")?.folded).toBe(true);
    expect(byPos.get("SB")?.isActing).toBe(true);
    expect(byPos.get("UTG")?.isActing).toBe(false);
    expect(byPos.get("UTG")?.betBb).toBe(2.5);
    expect(byPos.get("SB")?.betBb).toBe(0.5);
    expect(byPos.get("CO")?.betBb).toBeNull();
  });

  it("puts the dealer badge on the BTN seat and never elsewhere", () => {
    const seats = sampleSpot({ heroPos: "SB" }).seats.map((seat) =>
      seat.position === "BTN"
        ? { ...seat, isHero: false }
        : seat.position === "SB"
          ? { ...seat, isHero: true }
          : seat,
    );
    const mapped = drillOpponentSeats(seats);
    expect(mapped.filter((seat) => seat.isDealer === true).map((seat) => seat.position)).toEqual([
      "BTN",
    ]);
  });

  it("a folded seat never pulses, even if marked toAct", () => {
    const mapped = drillOpponentSeats([
      seatView({ seat: 0, position: "UTG", folded: true, toAct: true }),
      seatView({ seat: 1, position: "BB", isHero: true }),
    ]);
    expect(mapped[0]?.isActing).toBe(false);
  });
});

describe("DrillSurface", () => {
  it("keeps the situation copy: situation line, history, coach tip, caption", () => {
    const { container } = render(<DrillSurface spot={sampleSpot()} onAction={noop} />);

    expect(container.querySelector("[data-situation]")?.textContent).toContain(
      "under the gun (UTG) opened",
    );
    expect(container.querySelector("[data-history]")?.textContent).toContain("UTG opens 5");
    expect(container.querySelector("[data-coach-tip]")?.textContent).toContain("Someone opened");
    expect(screen.getByText(TRAINER_ACTIONS_CAPTION)).toBeInTheDocument();
    // The ring's aria summary survives as prose.
    expect(container.querySelector("[data-surface-summary]")?.textContent).toContain(
      "You are in BTN",
    );
  });

  it("renders a labeled button per chart action with the identifier on data-action", () => {
    const seen: string[] = [];
    render(<DrillSurface spot={sampleSpot()} onAction={(action) => seen.push(action)} />);

    const raise = screen.getByRole("button", { name: "Raise small" });
    expect(raise).toHaveAttribute("data-action", "raise_small");
    fireEvent.click(raise);
    expect(seen).toEqual(["raise_small"]);
    // The identifier never reaches the screen.
    expect(screen.queryByText("raise_small")).not.toBeInTheDocument();
  });

  it("renders villains by position only — no bot names on a drill", () => {
    const { container } = render(<DrillSurface spot={sampleSpot()} onAction={noop} />);
    const strip = container.querySelector("[data-opponent-strip]");
    expect(strip).not.toBeNull();
    expect(strip?.querySelectorAll("[data-seat]")).toHaveLength(5);
    // The hero's own position appears only in prose, never as a strip seat.
    expect(strip?.querySelector("[data-seat][data-position='BTN']")).toBeNull();
  });

  it("board band always shows five slots and the hero dock carries strength, stack and glow", () => {
    const { container } = render(<DrillSurface spot={sampleSpot()} onAction={noop} />);

    const band = container.querySelector("[data-board-band]");
    expect(band).not.toBeNull();

    const dock = container.querySelector("[data-hero-dock]");
    expect(dock?.getAttribute("data-to-act")).toBe("true");
    expect(container.querySelector("[data-strength-label]")?.textContent).toBe("Pair");
    expect(container.querySelector("[data-hero-stack]")?.textContent).toBe("200");
  });

  it("shows the hero's own committed chips as the dock bet badge", () => {
    const spot = sampleSpot();
    const seats = spot.seats.map((seat) => (seat.isHero ? { ...seat, committedBb: 2.5 } : seat));
    const { container } = render(<DrillSurface spot={{ ...spot, seats }} onAction={noop} />);
    expect(container.querySelector("[data-hero-bet]")?.textContent).toBe("5");
  });

  it("answered: buttons disable, the chart's action is outlined, the glow drops, the gap tip appears", () => {
    const { container } = render(
      <DrillSurface spot={sampleSpot()} onAction={noop} answered topAction="raise_small" />,
    );

    const fold = screen.getByRole("button", { name: "Fold" });
    expect(fold).toBeDisabled();

    const raise = screen.getByRole("button", { name: "Raise small" });
    expect(raise.style.borderColor).toBe("var(--color-accent)");
    expect(fold.style.borderColor).toBe("");

    expect(container.querySelector("[data-hero-dock]")?.getAttribute("data-to-act")).toBe("false");
    // fold/call/raise with no check → the limp tip explains the missing button.
    expect(container.querySelector("[data-missing-action-tip]")).toBeNull();
  });

  it("explains a missing Call/Check after the answer on an open-or-fold node", () => {
    const { container } = render(
      <DrillSurface
        spot={sampleSpot({ legalActions: ["fold", "raise_small"] })}
        onAction={noop}
        answered
      />,
    );
    expect(container.querySelector("[data-missing-action-tip]")?.textContent).toContain("Limping");
  });

  it("never renders a sizing expander — graded actions stay exactly the chart's", () => {
    render(<DrillSurface spot={sampleSpot()} onAction={noop} />);
    expect(screen.queryByRole("button", { name: "Choose a bet size" })).not.toBeInTheDocument();
  });

  it("hides the coach tip when asked, keeps the situation line", () => {
    const { container } = render(<DrillSurface spot={sampleSpot()} onAction={noop} hideCoachTip />);
    expect(container.querySelector("[data-coach-tip]")).toBeNull();
    expect(container.querySelector("[data-situation]")).not.toBeNull();
  });
});
