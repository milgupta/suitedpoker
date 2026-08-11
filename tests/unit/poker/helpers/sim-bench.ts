/**
 * The bot-realism bench: a scripted hero against each preset's villains.
 *
 * This exists because "the bots feel scripted" is not a failing test until it
 * is a number. The hero opens every unopened pot to 2.5bb and c-bets 2/3 pot —
 * the single most common line a beginner takes — and the bench measures what
 * the table does back: how often the open wins instantly, how often the c-bet
 * ends the hand, how often anyone is still there at showdown.
 *
 * Pure engine + bots, no HTTP and no sim-server, so 4,000 hands run in
 * seconds and the numbers are deterministic per seed. Shared by
 * `scripts/sim-bench.ts` (the report) and `bots-realism.test.ts` (the gate).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createRng, type Rng } from "@/poker/cards";
import {
  advanceStreet,
  applyAction,
  awardPot,
  createGame,
  isHandComplete,
  legalActions,
  type Action,
  type GameState,
  type LegalAction,
} from "@/poker/gamestate";
import { type BotData, type BotId, getBot } from "@/poker/bots";
import { isServableNode } from "@/poker/node-status";
import {
  buildSolutionIndex,
  parsePostflopTemplate,
  parsePreflopNode,
  type PostflopTemplate,
  type PreflopNode,
} from "@/poker/solutions";

const SOLUTIONS_ROOT = resolve(process.cwd(), "src/content/solutions");

/**
 * The SERVABLE set, matching what `sim-server` hands the bots in production.
 * The test helper `load-solutions.ts` loads everything including quarantined
 * nodes; a bench against data the product never serves measures nothing.
 */
export function loadBenchBotData(): BotData {
  const preflop: PreflopNode[] = readdirSync(join(SOLUTIONS_ROOT, "preflop"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      parsePreflopNode(
        JSON.parse(readFileSync(join(SOLUTIONS_ROOT, "preflop", name), "utf8")),
        name,
      ),
    )
    .filter((node) => isServableNode(node.ref));

  const templates: PostflopTemplate[] = readdirSync(join(SOLUTIONS_ROOT, "postflop"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      parsePostflopTemplate(
        JSON.parse(readFileSync(join(SOLUTIONS_ROOT, "postflop", name), "utf8")),
        name,
      ),
    );

  return { solutions: buildSolutionIndex(preflop), templates };
}

/** Mirrors `PRESETS` in src/lib/sim.ts without importing the app layer. */
export const BENCH_PRESETS: Record<string, readonly BotId[]> = {
  home_game: ["station", "station", "nit", "maniac", "tag"],
  cardroom: ["station", "station", "station", "nit", "tag"],
  online: ["tag", "tag", "tag", "tag"],
  boss: ["gto", "gto", "gto", "gto", "gto"],
};

export interface BenchMetrics {
  preset: string;
  hands: number;
  /** Hands where the hero got to open-raise an unopened pot. */
  heroOpens: number;
  /** Of hero opens: the hand ended preflop with everyone folding. */
  instantFoldAroundPct: number;
  /** Of all hands: a flop was dealt. */
  flopSeenPct: number;
  /** Hero flop c-bets made. */
  cbets: number;
  /** Of hero c-bets: every remaining player folded on the flop. */
  cbetTakedownPct: number;
  /** Of bot decisions facing the hero's flop c-bet: folds. */
  foldToCbetPct: number;
  /** Of all hands: two or more players were still in at completion. */
  showdownPct: number;
  /** Distribution over every bot decision in the run. */
  botActionPct: { fold: number; check: number; call: number; raiseOrBet: number };
  /** Largest chip-conservation error seen. Must be 0. */
  chipDrift: number;
}

function clampAmount(wanted: number, option: LegalAction): number {
  const min = option.min ?? 0;
  const max = option.max ?? 0;
  return Math.max(min, Math.min(max, wanted));
}

/**
 * The scripted hero. Opens every unopened pot to 2.5bb, c-bets 2/3 pot on the
 * flop, and otherwise check-calls to showdown — deliberately never folds, so
 * every fold in the measurements is a bot's.
 */
export function scriptedHeroAction(state: GameState, legal: readonly LegalAction[]): Action {
  const bigBlind = state.config.bigBlind;

  if (state.street === "preflop") {
    const raise = legal.find((a) => a.type === "raise");
    if (raise !== undefined && state.currentBet <= bigBlind) {
      return { type: "raise", amount: clampAmount(Math.round(2.5 * bigBlind), raise) };
    }
    const call = legal.find((a) => a.type === "call");
    if (call !== undefined) return { type: "call", amount: call.amount };
    return { type: "check" };
  }

  if (state.street === "flop") {
    const bet = legal.find((a) => a.type === "bet");
    if (bet !== undefined) {
      return { type: "bet", amount: clampAmount(Math.round((state.pot * 2) / 3), bet) };
    }
  }

  const call = legal.find((a) => a.type === "call");
  if (call !== undefined) return { type: "call", amount: call.amount };
  return { type: "check" };
}

export function runBench(
  preset: string,
  villains: readonly BotId[],
  hands: number,
  seedPrefix: string,
  data: BotData,
): BenchMetrics {
  const seats = villains.length + 1;
  const rng: Rng = createRng(`${seedPrefix}:${preset}`);

  let heroOpens = 0;
  let instantFoldArounds = 0;
  let flopsSeen = 0;
  let cbets = 0;
  let cbetTakedowns = 0;
  let facedCbet = 0;
  let foldedToCbet = 0;
  let showdowns = 0;
  let chipDrift = 0;
  const botActions = { fold: 0, check: 0, call: 0, raiseOrBet: 0 };

  for (let hand = 0; hand < hands; hand++) {
    let state = createGame({
      seats,
      button: hand % seats,
      smallBlind: 1,
      bigBlind: 2,
      startingStacks: 200,
      seed: `${seedPrefix}:${preset}:${hand}`,
    });
    const startingChips = state.players.reduce((sum, p) => sum + p.stack + p.totalCommitted, 0);

    let heroOpened = false;
    let heroCbet = false;
    let sawFlop = false;
    let guard = 0;

    while (!isHandComplete(state)) {
      if (++guard > 400) throw new Error(`bench hand ${preset}:${hand} did not terminate`);
      if (state.actionOn === null) {
        state = advanceStreet(state);
        if (state.street === "flop") sawFlop = true;
        continue;
      }

      const seat = state.actionOn;
      const legal = legalActions(state);

      if (seat === 0) {
        const action = scriptedHeroAction(state, legal);
        if (
          state.street === "preflop" &&
          action.type === "raise" &&
          state.currentBet <= state.config.bigBlind
        ) {
          heroOpened = true;
        }
        if (state.street === "flop" && action.type === "bet") {
          cbets += 1;
          heroCbet = true;
        }
        state = applyAction(state, action);
        continue;
      }

      const botId = villains[seat - 1]!;
      const action = getBot(botId).decide(state, seat, data, rng);

      // Facing the hero's flop c-bet specifically: a call is legal and the
      // last aggressor is the hero. Bot-vs-bot flop bets are excluded so the
      // number answers "what happens to MY c-bet", which is the audit's claim.
      if (
        state.street === "flop" &&
        heroCbet &&
        state.lastAggressor === 0 &&
        legal.some((a) => a.type === "call")
      ) {
        facedCbet += 1;
        if (action.type === "fold") foldedToCbet += 1;
      }

      if (action.type === "fold") botActions.fold += 1;
      else if (action.type === "check") botActions.check += 1;
      else if (action.type === "call") botActions.call += 1;
      else botActions.raiseOrBet += 1;

      state = applyAction(state, action);
    }

    const live = state.players.filter((p) => p.status !== "folded").length;
    if (heroOpened) {
      heroOpens += 1;
      if (state.street === "preflop" && live === 1) instantFoldArounds += 1;
    }
    if (sawFlop) flopsSeen += 1;
    if (heroCbet && state.street === "flop" && live === 1) cbetTakedowns += 1;
    if (live > 1) showdowns += 1;

    const settled = awardPot(state);
    const finalChips = settled.players.reduce((sum, p) => sum + p.stack, 0);
    chipDrift = Math.max(chipDrift, Math.abs(finalChips - startingChips));
  }

  const totalBotActions = Object.values(botActions).reduce((a, b) => a + b, 0) || 1;
  const pct = (n: number, of: number): number => (of === 0 ? 0 : (100 * n) / of);

  return {
    preset,
    hands,
    heroOpens,
    instantFoldAroundPct: pct(instantFoldArounds, heroOpens),
    flopSeenPct: pct(flopsSeen, hands),
    cbets,
    cbetTakedownPct: pct(cbetTakedowns, cbets),
    foldToCbetPct: pct(foldedToCbet, facedCbet),
    showdownPct: pct(showdowns, hands),
    botActionPct: {
      fold: pct(botActions.fold, totalBotActions),
      check: pct(botActions.check, totalBotActions),
      call: pct(botActions.call, totalBotActions),
      raiseOrBet: pct(botActions.raiseOrBet, totalBotActions),
    },
    chipDrift,
  };
}

export function formatBenchTable(metrics: readonly BenchMetrics[]): string {
  const header =
    "preset      hands  opens  fold-around  flop-seen  cbet-takedown  fold-to-cbet  showdown   bot f/x/c/r";
  const rows = metrics.map((m) => {
    const acts = m.botActionPct;
    return (
      `${m.preset.padEnd(10)} ${String(m.hands).padStart(6)} ${String(m.heroOpens).padStart(6)}  ` +
      `${m.instantFoldAroundPct.toFixed(1).padStart(10)}%  ` +
      `${m.flopSeenPct.toFixed(1).padStart(8)}%  ` +
      `${m.cbetTakedownPct.toFixed(1).padStart(12)}%  ` +
      `${m.foldToCbetPct.toFixed(1).padStart(11)}%  ` +
      `${m.showdownPct.toFixed(1).padStart(7)}%   ` +
      `${acts.fold.toFixed(0)}/${acts.check.toFixed(0)}/${acts.call.toFixed(0)}/${acts.raiseOrBet.toFixed(0)}`
    );
  });
  return [header, ...rows].join("\n");
}
