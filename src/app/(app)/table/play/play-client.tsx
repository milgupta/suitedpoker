"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AnimatedNumber, Shimmer } from "@/components/motion";
import {
  ActionDock,
  BoardBand,
  GameSurface,
  HeroDock,
  OpponentStrip,
  type ActionDockSizing,
  type DockAction,
  type OpponentSeatView,
} from "@/components/poker";
import { capture } from "@/lib/analytics-client";
import { isGradedDepth, UNGRADED_DEPTH_NOTICE, type BotMove, type ClientSimState } from "@/lib/sim";
import { handStrength } from "@/poker/hand-strength";
import type { Card } from "@/poker/cards";
import { evColor } from "@/lib/ev-color";
import { cn } from "@/lib/utils";

/**
 * The session, on the game surface (DESIGN.md §6): opponents strip, board
 * band, hero dock, action dock. No oval, no ring, at any viewport size.
 *
 * The client is a RENDERER. It holds no authoritative state: every action goes
 * to the server with the version it was decided against, and the server's
 * answer replaces everything. What the client adds is pacing — bot actions
 * arrive as a batch and are played one at a time with human-feeling delays,
 * pulsing the acting seat, and the showdown is staged rather than dumped.
 */

/** A bot "thinks" for 500–900ms. Randomised so the table never metronomes. */
const BOT_MOVE_MIN_MS = 500;
const BOT_MOVE_JITTER_MS = 400;

/** The showdown story: reveal, then highlight, then the pot moves. */
const SHOWDOWN_HIGHLIGHT_MS = 700;
const SHOWDOWN_POT_MS = 1400;

type Phase = "loading" | "playing" | "error";

export function TablePlayClient() {
  const params = useSearchParams();
  const sessionId = params.get("session");
  const reduced = useReducedMotion() ?? false;

  const [state, setState] = useState<ClientSimState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  // Bot pacing: the queue still to play, the seat currently "thinking", and
  // the moves already shown. Purely presentational — the state underneath is
  // already final, so nothing here can block or double anything.
  const [animating, setAnimating] = useState(false);
  const [actingSeat, setActingSeat] = useState<number | null>(null);
  const [shownMoves, setShownMoves] = useState<BotMove[]>([]);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 0 = villains revealed · 1 = winning five highlighted · 2 = pot moved.
  const [showdownStage, setShowdownStage] = useState(0);

  const submitting = useRef(false);

  const playMoves = useCallback(
    (moves: BotMove[]) => {
      if (moveTimer.current !== null) clearTimeout(moveTimer.current);
      // Every server response starts a fresh presentation: the showdown story
      // restarts from its first beat once the new moves finish playing.
      setShowdownStage(0);
      setShownMoves([]);
      if (moves.length === 0 || reduced) {
        setShownMoves(moves);
        setActingSeat(null);
        setAnimating(false);
        return;
      }
      setAnimating(true);
      let index = 0;
      const step = () => {
        const move = moves[index];
        if (move === undefined) {
          setActingSeat(null);
          setAnimating(false);
          return;
        }
        setActingSeat(move.seat);
        moveTimer.current = setTimeout(
          () => {
            index += 1;
            setShownMoves(moves.slice(0, index));
            step();
          },
          BOT_MOVE_MIN_MS + Math.random() * BOT_MOVE_JITTER_MS,
        );
      };
      step();
    },
    [reduced],
  );

  useEffect(() => {
    return () => {
      if (moveTimer.current !== null) clearTimeout(moveTimer.current);
    };
  }, []);

  // Stage the showdown once the bot moves have finished playing. The reset to
  // stage 0 happens in `playMoves` — an event-handler concern, since every new
  // server response starts a fresh presentation. This effect only SCHEDULES:
  // under reduced motion the end state lands on the next tick instead of
  // stepping through beats.
  const handComplete = state?.handComplete === true;
  const handNumber = state?.handNumber ?? 0;
  useEffect(() => {
    if (!handComplete || animating) return;
    const timers = reduced
      ? [setTimeout(() => setShowdownStage(2), 0)]
      : [
          setTimeout(() => setShowdownStage(1), SHOWDOWN_HIGHLIGHT_MS),
          setTimeout(() => setShowdownStage(2), SHOWDOWN_POT_MS),
        ];
    return () => timers.forEach(clearTimeout);
  }, [handComplete, handNumber, animating, reduced]);

  const refresh = useCallback(async () => {
    if (sessionId === null) return;
    try {
      const response = await fetch(`/api/sim/state?sessionId=${sessionId}`);
      if (!response.ok) {
        setPhase("error");
        return;
      }
      const body = (await response.json()) as { state: ClientSimState };
      setState(body.state);
      setPhase("playing");
    } catch {
      setPhase("error");
    }
  }, [sessionId]);

  useEffect(() => {
    // Deferred to a microtask so the fetch's setState never runs synchronously
    // inside the effect — the same pattern as the arena client.
    void Promise.resolve().then(refresh);
  }, [refresh]);

  async function post(path: string, payload: object): Promise<void> {
    // One in flight, ever. A double-tap on Raise must not commit chips twice —
    // the server's version check catches it too, but the first defence is not
    // sending the duplicate at all.
    if (submitting.current || state === null) return;
    submitting.current = true;

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, version: state.version, ...payload }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        state?: ClientSimState;
        botMoves?: BotMove[];
      };

      // A 409 carries the current state; adopting it is the recovery.
      if (body.state !== undefined) {
        setState(body.state);
        playMoves(body.botMoves ?? []);
      }
    } catch {
      // A dropped request leaves the old state; the next tap retries.
    } finally {
      submitting.current = false;
    }
  }

  if (sessionId === null) {
    return (
      <p className="text-text-secondary text-body-lg">
        No session.{" "}
        <Link className="text-accent-bright underline" href="/table">
          Pick a table
        </Link>
        .
      </p>
    );
  }

  if (phase === "error") {
    return (
      <p role="alert" className="text-danger-bright text-body-lg">
        Could not load the session.{" "}
        <Link className="underline" href="/table">
          Back to setup
        </Link>
        .
      </p>
    );
  }

  if (phase === "loading" || state === null) {
    return (
      <div className="flex flex-col gap-3">
        <Shimmer className="h-14 w-full" />
        <Shimmer className="h-96 w-full" />
        <Shimmer className="h-14 w-full" />
      </div>
    );
  }

  if (state.sessionComplete) {
    return <SessionSummary state={state} />;
  }

  return (
    <div
      className="flex min-h-[max(30rem,calc(100dvh-14rem))] flex-col gap-3"
      data-sim-hand={state.handNumber}
    >
      <Hud state={state} />

      <div className="min-h-0 flex-1">
        <Surface
          state={state}
          animating={animating}
          actingSeat={actingSeat}
          shownMoves={shownMoves}
          showdownStage={showdownStage}
          onAction={(action) => void post("/api/sim/action", { action })}
          onNext={() => void post("/api/sim/next", {})}
        />
      </div>

      <div className="flex items-center justify-between">
        <HistoryDrawer state={state} />
        <Link href="/table" className="text-text-tertiary text-caption hover:text-text-secondary">
          Leave table
        </Link>
      </div>
    </div>
  );
}

/* ── The surface itself ──────────────────────────────────────────────────── */

interface SurfaceProps {
  state: ClientSimState;
  animating: boolean;
  actingSeat: number | null;
  shownMoves: BotMove[];
  showdownStage: number;
  onAction: (action: { type: string; amount?: number }) => void;
  onNext: () => void;
}

function Surface({
  state,
  animating,
  actingSeat,
  shownMoves,
  showdownStage,
  onAction,
  onNext,
}: SurfaceProps) {
  const hero = state.seats.find((s) => s.isHero);
  const heroCards = (hero?.holeCards ?? []) as readonly Card[];
  const heroFolded = hero?.status === "folded";
  const board = state.board as readonly Card[];

  // The showdown is presented only once the bot moves have finished playing —
  // revealing a villain's cards while their last action is still "thinking"
  // would spoil the story the pacing exists to tell.
  const settled = state.handComplete && !animating;

  // Winner(s) from the engine's payouts — never re-derived by comparing hands.
  const winners = new Set(state.payoutsBb.flatMap((paid, seat) => (paid > 0 ? [seat] : [])));

  // The named hand and the winning five, computed from cards the client
  // legitimately holds: the hero's, or a villain's revealed at showdown.
  let winnerStrength: { label: string; bestFive: Card[] } | null = null;
  if (settled && state.wentToShowdown) {
    let bestPaid = 0;
    let winnerCards: readonly Card[] | null = null;
    for (const seat of state.seats) {
      const paid = state.payoutsBb[seat.seat] ?? 0;
      if (paid > bestPaid && seat.holeCards !== null && seat.holeCards.length === 2) {
        bestPaid = paid;
        winnerCards = seat.holeCards as readonly Card[];
      }
    }
    if (winnerCards !== null && board.length >= 3) {
      winnerStrength = handStrength(winnerCards, board);
    }
  }

  const highlight =
    settled && showdownStage >= 1 && winnerStrength !== null
      ? new Set<Card>(winnerStrength.bestFive)
      : null;

  // The pot counts across once the story reaches its last beat. Before the
  // hand ends, the bare number is the pot EXCLUDING live street bets — those
  // sit as badges under the seats and sweep in when the street closes.
  const committedSum = state.seats.reduce((sum, seat) => sum + seat.committedBb, 0);
  const potMoved = settled && showdownStage >= 2;
  const displayPot = state.handComplete
    ? potMoved
      ? 0
      : state.potBb
    : Math.max(0, Math.round((state.potBb - committedSum) * 10) / 10);

  // A winner's stack holds at its pre-pot value until the pot moves to it.
  const stackFor = (seat: number, stackBb: number): number =>
    winners.has(seat) && state.handComplete && !potMoved
      ? Math.round((stackBb - (state.payoutsBb[seat] ?? 0)) * 10) / 10
      : stackBb;

  const opponents: OpponentSeatView[] = state.seats
    .filter((seat) => !seat.isHero)
    .map((seat) => ({
      name: seat.botName ?? seat.position,
      position: seat.position,
      stackBb: stackFor(seat.seat, seat.stackBb),
      isDealer: seat.seat === state.buttonSeat,
      folded: seat.status === "folded",
      isActing: animating
        ? seat.seat === actingSeat
        : !state.handComplete && state.actionOn === seat.seat,
      betBb: !state.handComplete && seat.committedBb > 0 ? seat.committedBb : null,
      revealed:
        settled && seat.holeCards !== null && seat.holeCards.length === 2
          ? (seat.holeCards as readonly Card[])
          : null,
      isWinner: settled && winners.has(seat.seat),
    }));

  const heroStrength =
    heroCards.length === 2 ? handStrength(heroCards, board) : { label: "", bestFive: [] };

  const heroToAct = !animating && !state.handComplete && state.actionOn === state.heroSeat;

  const latestMove = shownMoves[shownMoves.length - 1];

  return (
    <GameSurface
      className="px-0"
      opponents={
        <OpponentStrip
          seats={opponents}
          handName={settled && winnerStrength !== null ? winnerStrength.label : null}
        />
      }
      board={
        <div className="flex flex-col gap-2">
          <BoardBand board={board} potBb={displayPot} highlight={highlight} />
          {/* One line of table talk: the latest bot action, or the result. */}
          <div className="flex min-h-[1.75rem] items-center justify-center" aria-live="polite">
            {settled ? (
              <ResultLine state={state} />
            ) : latestMove !== undefined ? (
              <p className="text-text-secondary text-body-sm" data-bot-move>
                {latestMove.label}
              </p>
            ) : null}
          </div>
        </div>
      }
      hero={
        <>
          <div className="flex items-center justify-between">
            <span className="text-caption text-text-secondary flex items-center gap-1.5 font-medium">
              You
              {hero !== undefined && (
                <span className="text-text-tertiary text-overline font-mono uppercase">
                  {hero.position}
                </span>
              )}
              {hero !== undefined && hero.seat === state.buttonSeat && (
                <span
                  aria-hidden
                  className="bg-text-primary text-canvas text-overline flex size-4 items-center justify-center rounded-full font-bold"
                >
                  D
                </span>
              )}
            </span>
            {!isGradedDepth(state.stackBb) && (
              <span className="text-text-tertiary text-caption" data-depth-notice>
                {UNGRADED_DEPTH_NOTICE}
              </span>
            )}
          </div>
          <HeroDock
            cards={heroCards}
            folded={heroFolded}
            strengthLabel={heroStrength.label}
            bestFive={heroStrength.bestFive}
            stackBb={hero === undefined ? 0 : stackFor(hero.seat, hero.stackBb)}
            betBb={
              !state.handComplete && hero !== undefined && hero.committedBb > 0
                ? hero.committedBb
                : null
            }
            toAct={heroToAct}
          />
        </>
      }
      actions={
        <Dock
          state={state}
          animating={animating}
          heroFolded={heroFolded === true}
          heroToAct={heroToAct}
          settled={settled}
          onAction={onAction}
          onNext={onNext}
        />
      }
    />
  );
}

/** "Won 12.5bb with a flush", with the divergence dot when the chart differed. */
function ResultLine({ state }: { state: ClientSimState }) {
  const result = state.lastResult;
  return (
    <p className="text-body-md flex items-center gap-2" data-result-line>
      <span>{result?.resultLine ?? "Hand over"}</span>
      {result?.heroEvLoss != null && result.heroEvLoss > 0.25 && (
        <span
          title={`vs chart: ${result.grade ?? ""}`}
          data-grade-dot
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: evColor(result.heroEvLoss) }}
        />
      )}
    </p>
  );
}

/* ── The action dock states ──────────────────────────────────────────────── */

interface DockProps {
  state: ClientSimState;
  animating: boolean;
  heroFolded: boolean;
  heroToAct: boolean;
  settled: boolean;
  onAction: (action: { type: string; amount?: number }) => void;
  onNext: () => void;
}

/** "2", "2.5" — a whole number never carries a decimal it does not need. */
function bareBb(amountBb: number): string {
  const rounded = Math.round(amountBb * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function Dock({ state, animating, heroFolded, heroToAct, settled, onAction, onNext }: DockProps) {
  if (settled) {
    return (
      <ActionDock kind="actions" actions={[{ id: "next", label: "Next hand" }]} onAction={onNext} />
    );
  }

  if (heroToAct) {
    const hero = state.seats.find((s) => s.isHero);
    const heroCommittedChips = Math.round((hero?.committedBb ?? 0) * 2);

    const actions: DockAction[] = [];
    let sizing: ActionDockSizing | undefined;

    for (const legal of state.legalActions) {
      if (legal.type === "fold") actions.push({ id: "fold", label: "Fold" });
      if (legal.type === "check") actions.push({ id: "check", label: "Check" });
      if (legal.type === "call" && legal.amount !== undefined) {
        // The wire amount is a TO-amount in chips; what a person weighs is the
        // COST — the chips still to put in.
        const costBb = (legal.amount - heroCommittedChips) / 2;
        actions.push({ id: "call", label: `Call ${bareBb(costBb)}` });
      }
      if ((legal.type === "bet" || legal.type === "raise") && legal.min !== undefined) {
        actions.push({
          id: legal.type,
          label: legal.type === "bet" ? "Bet" : "Raise",
          opensSizing: true,
        });
        sizing = {
          minTo: legal.min / 2,
          maxTo: (legal.max ?? legal.min) / 2,
          potBb: state.potBb,
          onConfirm: (amountBb) => onAction({ type: legal.type, amount: Math.round(amountBb * 2) }),
        };
      }
    }

    return (
      <ActionDock
        kind="actions"
        actions={actions}
        sizing={sizing}
        onAction={(id) => {
          if (id === "fold" || id === "check") onAction({ type: id });
          if (id === "call") {
            const call = state.legalActions.find((a) => a.type === "call");
            onAction({ type: "call", amount: call?.amount });
          }
        }}
      />
    );
  }

  return (
    <ActionDock
      kind="waiting"
      label={
        heroFolded
          ? "You folded — the hand plays out"
          : animating
            ? "Waiting for the table"
            : "Waiting for your turn"
      }
    />
  );
}

/* ── HUD, history, summary ───────────────────────────────────────────────── */

function Hud({ state }: { state: ClientSimState }) {
  const bb100 = state.handsPlayed === 0 ? 0 : (state.netBbTotal / state.handsPlayed) * 100;
  return (
    <div className="border-border bg-surface-1 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-2.5">
      <HudStat label="Hand" value={`${state.handNumber}/${state.totalHands}`} />
      <HudStat
        label="Net bb"
        value={
          <span style={{ color: state.netBbTotal < 0 ? "var(--color-grade-mistake)" : undefined }}>
            <AnimatedNumber value={state.netBbTotal} decimals={1} />
          </span>
        }
      />
      {/* Only once the sample can carry it — a per-100 rate over a dozen
          hands swings hundreds of bb and reads as the grader being broken. */}
      {state.handsPlayed >= 50 && (
        <HudStat label="bb/100" value={<AnimatedNumber value={bb100} decimals={1} />} />
      )}
    </div>
  );
}

function HudStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="text-overline text-text-tertiary uppercase">{label}</span>
      <span className="text-body-md font-mono font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function HistoryDrawer({ state }: { state: ClientSimState }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="bare" size="sm">
          Hand history
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>This session</SheetTitle>
        </SheetHeader>
        <ul className="flex flex-col gap-2 px-4 pb-6">
          {state.records.length === 0 && (
            <li className="text-text-tertiary text-body-sm">No hands finished yet.</li>
          )}
          {[...state.records].reverse().map((record) => (
            <li
              key={record.handNumber}
              className="border-border flex items-center justify-between gap-3 border-b pb-2"
            >
              <span className="text-text-tertiary text-caption font-mono">
                #{record.handNumber}
              </span>
              <span className="text-body-sm flex-1">{record.resultLine}</span>
              <span
                className={cn("text-body-sm font-mono tabular-nums")}
                style={{
                  color:
                    record.netBb < 0 ? "var(--color-grade-mistake)" : "var(--color-grade-best)",
                }}
              >
                {record.netBb >= 0 ? "+" : ""}
                {record.netBb.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function SessionSummary({ state }: { state: ClientSimState }) {
  const bb100 = state.handsPlayed === 0 ? 0 : (state.netBbTotal / state.handsPlayed) * 100;

  useEffect(() => {
    capture("sim_session_ended", { hands: state.handsPlayed, netBb: state.netBbTotal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="border-border bg-surface-1 flex flex-col gap-6 rounded-lg border p-5">
      <h2 className="text-display-md">Session over</h2>
      <div className="grid grid-cols-3 gap-4">
        <HudStat label="Hands" value={state.handsPlayed} />
        <HudStat label="Net bb" value={state.netBbTotal.toFixed(1)} />
        <HudStat label="bb/100" value={state.handsPlayed >= 50 ? bb100.toFixed(1) : "—"} />
      </div>
      <div className="flex gap-3">
        <Button variant="accent" size="lg" asChild>
          <Link href={`/table/review?session=${state.sessionId}`}>Review session</Link>
        </Button>
        <Button variant="primary" size="lg" asChild>
          <Link href="/table">Play again</Link>
        </Button>
      </div>
    </section>
  );
}
