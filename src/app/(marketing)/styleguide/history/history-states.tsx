"use client";

import { useMemo, useState } from "react";
import { ChoiceGrid, HandHistory } from "@/components/poker";
import { cardsFromString } from "@/poker/cards";
import {
  advanceUntilAction,
  applyAction,
  createGame,
  legalActions,
  toHandHistory,
  type GameState,
} from "@/poker/gamestate";

const BB = 100;

function playOut(seed: string, steps: number): GameState {
  let state = advanceUntilAction(
    createGame({
      seats: 6,
      button: 3,
      smallBlind: 50,
      bigBlind: BB,
      startingStacks: 100 * BB,
      seed,
      board: cardsFromString("Ks Jd 8d 4d 5d"),
    }),
  );

  for (let i = 0; i < steps && !state.complete && state.actionOn !== null; i++) {
    const legal = legalActions(state);
    const prefer =
      legal.find((a) => a.type === "bet") ??
      legal.find((a) => a.type === "call") ??
      legal.find((a) => a.type === "check") ??
      legal[0];
    if (prefer === undefined) break;
    state = advanceUntilAction(
      applyAction(state, { type: prefer.type, amount: prefer.amount ?? prefer.min }),
    );
  }
  return state;
}

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

export function HistoryStates() {
  const [choice, setChoice] = useState<string | undefined>(undefined);
  const [answered, setAnswered] = useState(false);

  const shallow = useMemo(() => toHandHistory(playOut("sg-shallow", 7)), []);
  const deep = useMemo(() => toHandHistory(playOut("sg-deep", 22)), []);

  return (
    <div className="flex flex-col gap-10">
      <Frame
        title="A four-street hand at 390px"
        width={390}
        note="The whole hand on one phone screen — what the graphical table cannot do. Leading is tightened rather than the font shrunk."
      >
        <HandHistory hand={deep} heroSeat={0} trailOff />
      </Frame>

      <Frame title="A shallow hand" note="Preflop and flop only.">
        <HandHistory hand={shallow} heroSeat={0} trailOff />
      </Frame>

      <Frame
        title="ChoiceGrid — hand_choice"
        note="Arrow keys move, Enter or Space picks. After answering, the correct option gets a --grade-best border and a wrong pick takes its EV-loss colour."
      >
        <ChoiceGrid
          options={[
            { value: "A5s", label: "A5s", handKey: "A5s" },
            { value: "KQo", label: "KQo", handKey: "KQo" },
            { value: "76s", label: "76s", handKey: "76s" },
            { value: "T9s", label: "T9s", handKey: "T9s" },
          ]}
          selected={choice}
          correct={answered ? "A5s" : undefined}
          evLossByValue={{ KQo: 1.4, "76s": 0.3, T9s: 3.1 }}
          onSelect={(value) => {
            setChoice(value);
            setAnswered(true);
          }}
        />
        <button
          type="button"
          className="text-accent-bright text-body-sm mt-4 underline"
          onClick={() => {
            setChoice(undefined);
            setAnswered(false);
          }}
        >
          Reset
        </button>
      </Frame>

      <Frame title="ChoiceGrid — sizing" note="Same component, no cards.">
        <ChoiceGrid
          options={[
            { value: "33", label: "33% pot" },
            { value: "66", label: "66% pot" },
            { value: "100", label: "Pot" },
            { value: "allin", label: "All-in" },
          ]}
          onSelect={() => undefined}
        />
      </Frame>
    </div>
  );
}
