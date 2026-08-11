/**
 * Bot-realism bench report. Run: npx tsx scripts/sim-bench.ts [hands]
 *
 * Plays N hands per preset with a scripted hero (opens 2.5bb, c-bets 2/3 pot,
 * never folds) and prints the table the realism gate asserts against. The
 * numbers are deterministic per seed, so a before/after diff of this output is
 * evidence rather than anecdote.
 *
 * BEFORE (4,000 hands per preset, at the pre-repair vs_rfi ranges and the
 * pre-price-aware bots — the run that motivated this pass):
 *
 *   preset      hands  opens  fold-around  flop-seen  cbet-takedown  fold-to-cbet  showdown   bot f/x/c/r
 *   home_game    4000   2105         9.8%      93.7%          35.9%         52.0%     72.0%   42/13/24/21
 *   cardroom     4000   2562        11.1%      91.5%          31.5%         49.3%     67.3%   42/19/27/12
 *   online       4000   2260        54.0%      65.1%          65.2%         68.7%     33.0%   63/9/8/20
 *   boss         4000   2217        51.8%      69.0%          59.9%         65.0%     39.2%   65/8/9/18
 *
 * AFTER: see the table printed by `npx tsx scripts/sim-bench.ts`, and the
 * asserted bounds in tests/unit/poker/bots-realism.test.ts.
 */

import {
  BENCH_PRESETS,
  formatBenchTable,
  loadBenchBotData,
  runBench,
  type BenchMetrics,
} from "../tests/unit/poker/helpers/sim-bench";

const hands = Number(process.argv[2] ?? 4000);
if (!Number.isInteger(hands) || hands <= 0) {
  console.error(`hands must be a positive integer, got ${process.argv[2]}`);
  process.exit(1);
}

const data = loadBenchBotData();
const metrics: BenchMetrics[] = [];

for (const [preset, villains] of Object.entries(BENCH_PRESETS)) {
  metrics.push(runBench(preset, villains, hands, "sim-bench-v1", data));
}

console.log(formatBenchTable(metrics));

const drift = metrics.filter((m) => m.chipDrift !== 0);
if (drift.length > 0) {
  console.error(`\nCHIP DRIFT: ${drift.map((m) => `${m.preset}=${m.chipDrift}`).join(", ")}`);
  process.exit(1);
}
