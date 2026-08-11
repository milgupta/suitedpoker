"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AnimatedNumber, Shimmer } from "@/components/motion";
import { PokerTable } from "@/components/poker";
import { capture } from "@/lib/analytics-client";
import { SPRING } from "@/lib/motion";
import type { BotMove, ClientSimState } from "@/lib/sim";
import type { Action, GameState, LegalAction, Player } from "@/poker/gamestate";
import { evColor } from "@/lib/ev-color";
import { cn } from "@/lib/utils";

/**
 * The session.
 *
 * The client is a RENDERER. It holds no authoritative state: every action goes
 * to the server with the version it was decided against, and the server's
 * answer replaces everything. What the client adds is pacing — bot actions
 * arrive as a batch and are shown one at a time with human-feeling delays, as
 * an overlay that never gates the hero's own input.
 */

const BOT_MOVE_MS = 550;

type Phase = "loading" | "playing" | "error";

export function TablePlayClient() {
  const params = useSearchParams();
  const sessionId = params.get("session");
  const reduced = useReducedMotion() ?? false;

  const [state, setState] = useState<ClientSimState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [ticker, setTicker] = useState<BotMove[]>([]);
  const submitting = useRef(false);
  const tickerTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const showMoves = useCallback(
    (moves: BotMove[]) => {
      if (moves.length === 0 || reduced) {
        setTicker(moves);
        return;
      }
      // One label at a time. Purely presentational — the state underneath is
      // already final, so nothing here can block or double anything.
      setTicker([]);
      let shown = 0;
      if (tickerTimer.current !== null) clearInterval(tickerTimer.current);
      tickerTimer.current = setInterval(() => {
        shown += 1;
        setTicker(moves.slice(0, shown));
        if (shown >= moves.length && tickerTimer.current !== null) {
          clearInterval(tickerTimer.current);
        }
      }, BOT_MOVE_MS);
    },
    [reduced],
  );

  useEffect(() => {
    return () => {
      if (tickerTimer.current !== null) clearInterval(tickerTimer.current);
    };
  }, []);

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
        showMoves(body.botMoves ?? []);
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

  if (phase === "loading" || state === null) {
    return (
      <div className="flex flex-col gap-3">
        <Shimmer className="h-72 w-full" />
        <Shimmer className="h-14 w-full" />
      </div>
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

  if (state.sessionComplete) {
    return <SessionSummary state={state} />;
  }

  const game = toRenderableGame(state);

  return (
    <div className="flex flex-col gap-4" data-sim-hand={state.handNumber}>
      <Hud state={state} />

      {game !== null && (
        <PokerTable
          state={game}
          heroSeat={state.heroSeat}
          actionsOverride={state.legalActions as readonly LegalAction[]}
          seatTags={Object.fromEntries(
            state.seats.filter((s) => s.botName !== null).map((s) => [s.seat, s.botName as string]),
          )}
          onAction={(action: Action) => void post("/api/sim/action", { action })}
        />
      )}

      {/* Bot actions, one at a time. An overlay — never a gate. */}
      <div className="min-h-[1.5rem]" aria-live="polite">
        <AnimatePresence>
          {ticker.slice(-3).map((move, i) => (
            <motion.p
              key={`${state.handNumber}-${move.seat}-${move.label}-${i}`}
              className="text-text-tertiary text-caption"
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING.snappy}
            >
              {move.label}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>

      {state.handComplete && (
        <div className="border-border bg-surface-1 flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-body-md">{state.lastResult?.resultLine ?? "Hand over"}</p>
            {state.lastResult?.grade ? (
              <p className="text-text-tertiary text-caption">
                Preflop grade vs chart: {state.lastResult.grade}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {/* The divergence nudge: a dot, not a modal. Flow is the point. */}
            {state.lastResult?.heroEvLoss != null && state.lastResult.heroEvLoss > 0.25 && (
              <span
                title={`vs chart: ${state.lastResult.grade ?? ""}`}
                data-grade-dot
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: evColor(state.lastResult.heroEvLoss) }}
              />
            )}
            <Button variant="primary" size="default" onClick={() => void post("/api/sim/next", {})}>
              Next hand
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <HistoryDrawer state={state} />
        <Link href="/table" className="text-text-tertiary text-caption hover:text-text-secondary">
          Leave table
        </Link>
      </div>
    </div>
  );
}

/**
 * Rebuilds a GameState-shaped object for the renderer from the client view.
 *
 * Only fields the table READS are populated; the ones it cannot know (deck,
 * villain cards) do not exist here at all, which is the point. Legality never
 * comes from this object — `actionsOverride` carries the server's list.
 */
function toRenderableGame(state: ClientSimState): GameState | null {
  if (state.street === null) return null;

  const players: Player[] = state.seats.map((seat) => ({
    seat: seat.seat,
    position: seat.position as Player["position"],
    stack: Math.round(seat.stackBb * 2),
    committedThisStreet: Math.round(seat.committedBb * 2),
    totalCommitted: 0,
    holeCards:
      seat.holeCards !== null && seat.holeCards.length === 2
        ? ([seat.holeCards[0], seat.holeCards[1]] as unknown as Player["holeCards"])
        : null,
    status: seat.status as Player["status"],
    hasActed: false,
    mayRaise: true,
  }));

  return {
    config: {
      seats: players.length,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      startingStacks: 200,
      seed: 0,
    },
    players,
    button: 0,
    street: state.street,
    board: state.board as GameState["board"],
    pot: Math.round(state.potBb * 2),
    sidePots: state.sidePots,
    currentBet: state.currentBet,
    minRaise: 0,
    actionOn: state.actionOn,
    lastAggressor: null,
    history: [],
    complete: state.handComplete,
    payouts: players.map(() => 0),
    deck: [],
    deckIndex: 0,
  };
}

function Hud({ state }: { state: ClientSimState }) {
  const bb100 = state.handsPlayed === 0 ? 0 : (state.netBbTotal / state.handsPlayed) * 100;
  return (
    <div className="border-border bg-surface-1 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-3">
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
