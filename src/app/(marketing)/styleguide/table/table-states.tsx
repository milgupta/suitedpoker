"use client";

import { useMemo, useState } from "react";
import { PokerTable, type SizedOption } from "@/components/poker";
import { PlayingCard } from "@/components/poker";
import { cardsFromString } from "@/poker/cards";
import {
  advanceUntilAction,
  applyAction,
  createGame,
  legalActions,
  type Action,
  type GameState,
  type Street,
} from "@/poker/gamestate";

/**
 * Every meaningful table state, built from the real engine rather than mocked.
 *
 * Mocked state would let the table render something the engine can never
 * produce, which is exactly the bug this page exists to catch.
 */

const BB = 100;

function base(overrides: Partial<Parameters<typeof createGame>[0]> = {}): GameState {
  return advanceUntilAction(
    createGame({
      seats: 6,
      button: 3,
      smallBlind: 50,
      bigBlind: BB,
      startingStacks: 100 * BB,
      seed: "styleguide",
      ...overrides,
    }),
  );
}

/**
 * Advances by picking a legal action rather than replaying a scripted list.
 *
 * A hand-written sequence encodes an assumption about seating and action order
 * that the engine is free to change, and gets a hard "illegal action" throw at
 * build time when it does. Asking the engine what is legal cannot go stale.
 */
function act(state: GameState, prefer: readonly Action["type"][]): GameState {
  if (state.complete || state.actionOn === null) return state;
  const legal = legalActions(state);

  for (const type of prefer) {
    const match = legal.find((a) => a.type === type);
    if (match !== undefined) {
      return advanceUntilAction(
        applyAction(state, { type: match.type, amount: match.amount ?? match.min }),
      );
    }
  }

  const fallback = legal[0];
  if (fallback === undefined) return state;
  return advanceUntilAction(
    applyAction(state, { type: fallback.type, amount: fallback.amount ?? fallback.min }),
  );
}

/** Plays passively until the target street, so every seat stays in the hand. */
function runToStreet(state: GameState, target: Street): GameState {
  const order: Street[] = ["preflop", "flop", "turn", "river", "showdown"];
  let next = state;
  let guard = 0;

  while (!next.complete && order.indexOf(next.street) < order.indexOf(target) && guard++ < 60) {
    next = act(next, ["check", "call"]);
  }
  return next;
}

const SIZED: SizedOption[] = [
  { label: "Bet 4BB", action: { type: "bet", amount: 4 * BB }, bb: 4, potPct: 33 },
  { label: "Bet 9BB", action: { type: "bet", amount: 9 * BB }, bb: 9, potPct: 75 },
];

function Frame({
  title,
  note,
  width,
  children,
}: {
  title: string;
  note?: string;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-heading-md">{title}</h3>
        {note !== undefined && (
          <p className="text-text-secondary text-body-sm mt-1 max-w-[52ch]">{note}</p>
        )}
      </div>
      <div
        className="border-border bg-canvas overflow-hidden rounded-lg border p-4"
        style={width === undefined ? undefined : { width, maxWidth: "100%" }}
      >
        {children}
      </div>
    </section>
  );
}

export function TableStates() {
  const [live, setLive] = useState<GameState>(() => base());

  const withBoard = useMemo(() => base({ board: cardsFromString("Ah 7d 2c Kh 3s") }), []);

  const preflop = useMemo(() => base(), []);
  const flop = useMemo(() => runToStreet(withBoard, "flop"), [withBoard]);
  const turn = useMemo(() => runToStreet(withBoard, "turn"), [withBoard]);
  const river = useMemo(() => runToStreet(withBoard, "river"), [withBoard]);

  const folded = useMemo(() => {
    // Fold the first two actors, then play on — a real folded-seat state.
    let next = act(base({ board: cardsFromString("Ah 7d 2c") }), ["fold"]);
    next = act(next, ["fold"]);
    return runToStreet(next, "flop");
  }, []);

  const headsUp = useMemo(() => base({ seats: 2, button: 0, startingStacks: 40 * BB }), []);

  const allIn = useMemo(() => {
    // Unequal stacks, everyone in — which is what makes the side pots real.
    let next = base({ seats: 3, button: 0, startingStacks: [20 * BB, 60 * BB, 100 * BB] });
    for (let i = 0; i < 8 && !next.complete && next.actionOn !== null; i++) {
      next = act(next, i === 0 ? ["raise", "bet"] : ["call", "check"]);
    }
    return next;
  }, []);

  const heroSeat = 0;

  return (
    <div className="flex flex-col gap-10">
      <Frame
        title="Interactive"
        note="Driven by the real state machine — every button applies a legal action and re-renders from the engine's output."
      >
        <PokerTable
          state={live}
          heroSeat={live.actionOn ?? heroSeat}
          sizedOptions={live.street === "preflop" ? undefined : SIZED}
          context={{
            preflopAction: "BTN opens 2.5BB, BB calls",
            effectiveStackBb: 100,
            potType: "single raised",
          }}
          onAction={(action) => setLive((s) => advanceUntilAction(applyAction(s, action)))}
        />
        <button
          type="button"
          className="text-accent-bright text-body-sm mt-4 underline"
          onClick={() => setLive(base())}
        >
          Reset hand
        </button>
      </Frame>

      <Frame
        title="Preflop"
        note="No board yet — five dimmed backs hold the space so nothing shifts when the flop lands."
      >
        <PokerTable state={preflop} heroSeat={heroSeat} />
      </Frame>

      <Frame
        title="Flop"
        note="Sized options turn the action bar into a 2x2 grid with real bet sizes."
      >
        <PokerTable state={flop} heroSeat={heroSeat} sizedOptions={SIZED} />
      </Frame>

      <Frame title="Turn">
        <PokerTable state={turn} heroSeat={heroSeat} sizedOptions={SIZED} />
      </Frame>

      <Frame
        title="River"
        note="3-over-2 layout: the flop on the first row, turn and river beneath."
      >
        <PokerTable state={river} heroSeat={heroSeat} sizedOptions={SIZED} />
      </Frame>

      <Frame
        title="Folded players"
        note="Folded seats drop to 40% opacity and their cards disappear."
      >
        <PokerTable state={folded} heroSeat={heroSeat} />
      </Frame>

      <Frame
        title="All-in and side pots"
        note="Three different stack sizes, so the side pots are real."
      >
        <PokerTable state={allIn} heroSeat={heroSeat} />
      </Frame>

      <Frame title="Heads up" note="Two seats changes the blind order — a real case, not an edge.">
        <PokerTable state={headsUp} heroSeat={heroSeat} />
      </Frame>

      <Frame
        title="Mobile frame — 390px"
        width={390}
        note="The width most of this audience arrives on."
      >
        <PokerTable state={flop} heroSeat={heroSeat} sizedOptions={SIZED} />
      </Frame>

      <Frame
        title="The deck"
        note="Classic two colours: red hearts and diamonds, near-black clubs and spades. Corner index and one large pip, the way a real card is laid out."
      >
        <div className="flex flex-wrap items-end gap-3">
          {cardsFromString("Ah Kd Qc Js Th 9d 8c 7s").map((card, i) => (
            <PlayingCard key={i} card={card} size="lg" index={i} dealCount={8} />
          ))}
          <PlayingCard faceDown size="lg" />
          <PlayingCard placeholder size="lg" />
        </div>
        <div className="mt-4 flex items-end gap-3">
          {cardsFromString("Ah Kd Qc").map((card, i) => (
            <PlayingCard key={i} card={card} size="sm" />
          ))}
          {cardsFromString("Ah Kd Qc").map((card, i) => (
            <PlayingCard key={i} card={card} size="md" />
          ))}
        </div>
      </Frame>
    </div>
  );
}
