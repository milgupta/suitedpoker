"use client";

import { useMemo } from "react";
import {
  ActionDock,
  BoardBand,
  GameSurface,
  HeroDock,
  OpponentStrip,
  type OpponentSeatView,
} from "@/components/poker";
import { botNamesFor } from "@/poker/bot-names";
import { cardsFromString, type Card } from "@/poker/cards";
import { handStrength } from "@/poker/hand-strength";

/**
 * Every meaningful game-surface state, as SCRIPTED PROPS.
 *
 * The surface components are deliberately presentational — they hold no game
 * state and cannot compute legality — so there is no
 * engine to drive them from without rebuilding a screen's whole client here.
 * The trade is explicit: these states show every prop combination the
 * components accept, and the engine-driven integration arrives when the
 * screens migrate.
 */

const NAMES = botNamesFor("styleguide-surface", 5);

const noop = () => undefined;

function name(i: number): string {
  return NAMES[i] ?? "Bot";
}

function seat(i: number, position: string, over: Partial<OpponentSeatView> = {}): OpponentSeatView {
  return { name: name(i), position, stackBb: 100, ...over };
}

function Frame({
  title,
  note,
  width = 390,
  height = 620,
  children,
}: {
  title: string;
  note?: string;
  width?: number;
  height?: number;
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
        className="border-border bg-canvas overflow-hidden rounded-lg border"
        style={{ width, maxWidth: "100%", height }}
      >
        {children}
      </div>
    </section>
  );
}

function hero(cards: readonly Card[], board: readonly Card[]) {
  return handStrength(cards, board);
}

export function SurfaceStates() {
  const preflopHero = useMemo(() => cardsFromString("As Ks"), []);
  const preflopStrength = hero(preflopHero, []);

  const threeBetHero = useMemo(() => cardsFromString("Qh Qd"), []);
  const threeBetStrength = hero(threeBetHero, []);

  const simHero = useMemo(() => cardsFromString("Jh Th"), []);
  const simBoard = useMemo(() => cardsFromString("9h 8c 2h"), []);
  const simStrength = hero(simHero, simBoard);

  const midHero = useMemo(() => cardsFromString("Ac Jc"), []);
  const midBoard = useMemo(() => cardsFromString("Jd 7s 2c 5c"), []);
  const midStrength = hero(midHero, midBoard);

  const foldedHero = useMemo(() => cardsFromString("7d 2s"), []);
  const foldedBoard = useMemo(() => cardsFromString("Kd 9c 4h"), []);
  const foldedStrength = hero(foldedHero, foldedBoard);

  const showdownHero = useMemo(() => cardsFromString("Ah 9h"), []);
  const showdownBoard = useMemo(() => cardsFromString("Kh 5h 2h 8c 3d"), []);
  const showdownStrength = hero(showdownHero, showdownBoard);
  const winningFive = useMemo(
    () => new Set<Card>(showdownStrength.bestFive),
    [showdownStrength.bestFive],
  );

  const shortHero = useMemo(() => cardsFromString("8s 8d"), []);
  const shortStrength = hero(shortHero, []);

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <Frame
        title="Preflop — hero to act"
        note="Two folds to the hero in the cutoff. Blinds have chips in front; the hero dock carries the accent halo, never the grade green."
      >
        <GameSurface
          opponents={
            <OpponentStrip
              seats={[
                seat(0, "UTG", { folded: true }),
                seat(1, "MP", { folded: true }),
                seat(2, "BTN", { isDealer: true }),
                seat(3, "SB", { betBb: 0.5, stackBb: 99.5 }),
                seat(4, "BB", { betBb: 1, stackBb: 99 }),
              ]}
            />
          }
          board={<BoardBand board={[]} potBb={1.5} />}
          hero={
            <HeroDock
              cards={preflopHero}
              strengthLabel={preflopStrength.label}
              bestFive={preflopStrength.bestFive}
              stackBb={100}
              toAct
            />
          }
          actions={
            <ActionDock
              kind="actions"
              onAction={noop}
              actions={[
                { id: "fold", label: "Fold" },
                { id: "call", label: "Call 1" },
                { id: "raise_small", label: "Raise to 2.5" },
              ]}
            />
          }
        />
      </Frame>

      <Frame
        title="Facing a 3-bet"
        note="The hero opened the button to 2.5bb and the small blind made it 11bb. Bet badges are neutral chrome — never amber, never the grade ramp."
      >
        <GameSurface
          opponents={
            <OpponentStrip
              seats={[
                seat(0, "UTG", { folded: true }),
                seat(1, "MP", { folded: true }),
                seat(2, "CO", { folded: true }),
                seat(3, "SB", { betBb: 11, stackBb: 89 }),
                seat(4, "BB", { folded: true }),
              ]}
            />
          }
          board={<BoardBand board={[]} potBb={4.5} />}
          hero={
            <HeroDock
              cards={threeBetHero}
              strengthLabel={threeBetStrength.label}
              bestFive={threeBetStrength.bestFive}
              stackBb={97.5}
              betBb={2.5}
              toAct
            />
          }
          actions={
            <ActionDock
              kind="actions"
              onAction={noop}
              actions={[
                { id: "fold", label: "Fold" },
                { id: "call", label: "Call 11" },
                { id: "raise_pot", label: "Raise to 24" },
                { id: "allin", label: "All in" },
              ]}
            />
          }
        />
      </Frame>

      <Frame
        title="Sizing expander open (sim only)"
        note="The expander swaps the button row in place — no modal, no sheet. Presets clamp into the engine's legal min/max; the slider steps by 0.5bb."
        height={660}
      >
        <GameSurface
          opponents={
            <OpponentStrip
              seats={[
                seat(0, "UTG", { folded: true }),
                seat(1, "MP", { folded: true }),
                seat(2, "BTN", { isDealer: true, folded: true }),
                seat(3, "SB", { folded: true }),
                seat(4, "BB", { isActing: false, stackBb: 97 }),
              ]}
            />
          }
          board={<BoardBand board={simBoard} potBb={6.5} />}
          hero={
            <HeroDock
              cards={simHero}
              strengthLabel={simStrength.label}
              bestFive={simStrength.bestFive}
              stackBb={97}
              toAct
            />
          }
          actions={
            <ActionDock
              kind="actions"
              onAction={noop}
              defaultExpanded
              sizing={{ minTo: 2, maxTo: 97, potBb: 6.5, onConfirm: noop }}
              actions={[
                { id: "check", label: "Check" },
                { id: "bet_33", label: "Bet 2" },
                { id: "bet_66", label: "Bet 4.5" },
              ]}
            />
          }
        />
      </Frame>

      <Frame
        title="Mid-hand — bets in front, bot thinking"
        note="The turn, a bet and a raise in front, one seat pulsing while it acts. A subtle opacity pulse and never a timer — not for bots, not for the hero."
      >
        <GameSurface
          opponents={
            <OpponentStrip
              seats={[
                seat(0, "UTG", { folded: true }),
                seat(1, "MP", { betBb: 5, stackBb: 88 }),
                seat(2, "CO", { isActing: true, stackBb: 92 }),
                seat(3, "BTN", { isDealer: true, folded: true }),
                seat(4, "SB", { folded: true }),
              ]}
            />
          }
          board={<BoardBand board={midBoard} potBb={13.5} />}
          hero={
            <HeroDock
              cards={midHero}
              strengthLabel={midStrength.label}
              bestFive={midStrength.bestFive}
              stackBb={88}
              betBb={5}
            />
          }
          actions={<ActionDock kind="waiting" label="Waiting for your turn" />}
        />
      </Frame>

      <Frame
        title="Folded hero, waiting"
        note="Folded cards become dim outlines; the waiting pill is exactly the height of the button row, so the swap never shifts the layout."
      >
        <GameSurface
          opponents={
            <OpponentStrip
              seats={[
                seat(0, "UTG", { betBb: 6, stackBb: 91 }),
                seat(1, "MP", { folded: true }),
                seat(2, "CO", { isActing: true, stackBb: 94 }),
                seat(3, "BTN", { isDealer: true, folded: true }),
                seat(4, "SB", { folded: true }),
              ]}
            />
          }
          board={<BoardBand board={foldedBoard} potBb={9} />}
          hero={
            <HeroDock
              cards={foldedHero}
              folded
              strengthLabel={foldedStrength.label}
              bestFive={foldedStrength.bestFive}
              stackBb={99}
            />
          }
          actions={<ActionDock kind="waiting" />}
        />
      </Frame>

      <Frame
        title="Showdown — winning five highlighted"
        note="The winning five stay at full brightness and every non-contributing card dims. Villain cards reveal only at a showdown they reached unfolded."
      >
        <GameSurface
          opponents={
            <OpponentStrip
              handName={showdownStrength.label}
              seats={[
                seat(0, "UTG", { folded: true }),
                seat(1, "MP", { folded: true }),
                seat(2, "CO", {
                  revealed: cardsFromString("Kc Qd"),
                  stackBb: 84,
                }),
                seat(3, "BTN", { isDealer: true, folded: true }),
                seat(4, "SB", { folded: true }),
              ]}
            />
          }
          board={<BoardBand board={showdownBoard} potBb={32.5} highlight={winningFive} />}
          hero={
            <HeroDock
              cards={showdownHero}
              strengthLabel={showdownStrength.label}
              bestFive={showdownStrength.bestFive}
              stackBb={116}
            />
          }
          actions={<ActionDock kind="waiting" />}
        />
      </Frame>

      <Frame
        title="Short-handed — two opponents"
        note="The strip breathes rather than stretches: seats keep their width discipline whether there are two opponents or five."
      >
        <GameSurface
          opponents={
            <OpponentStrip
              seats={[
                seat(0, "SB", { betBb: 0.5, stackBb: 99.5 }),
                seat(1, "BB", { betBb: 1, stackBb: 99 }),
              ]}
            />
          }
          board={<BoardBand board={[]} potBb={1.5} />}
          hero={
            <HeroDock
              cards={shortHero}
              strengthLabel={shortStrength.label}
              bestFive={shortStrength.bestFive}
              stackBb={100}
              toAct
            />
          }
          actions={
            <ActionDock
              kind="actions"
              onAction={noop}
              actions={[
                { id: "fold", label: "Fold" },
                { id: "call", label: "Call 1" },
                { id: "raise_small", label: "Raise to 3" },
              ]}
            />
          }
        />
      </Frame>
    </div>
  );
}
