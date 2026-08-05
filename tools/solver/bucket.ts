/**
 * The bucketer — where 1,326 combos become 12 rows.
 *
 * `classifyHand` is IMPORTED from 2.5, never reimplemented. If the two ever
 * diverged, the product would grade against a strategy that describes
 * different hands than the ones it names, and nothing would fail loudly.
 *
 * The interesting output here is not the averages, it is the WITHIN-BUCKET
 * VARIANCE. A hand class whose combos are played very differently by the solver
 * is a class that is too coarse for that spot, and averaging it produces a
 * strategy that is wrong for both halves. Those rows are flagged for a human.
 */

import { cardsFromString } from "@/poker/cards";
import { boardTexture, classifyHand, type HandClass, HAND_CLASSES } from "@/poker/handclass";
import { type PostflopTemplateFile } from "@/poker/solutions";
import { type Scenario } from "@/content/solver/schema";

import { type SolveResult } from "./types";

/** Above this, the average describes neither half of the bucket. */
export const VARIANCE_FLAG_THRESHOLD = 0.15;

export interface BucketRow {
  handClass: HandClass;
  comboCount: number;
  strategy: Record<string, number>;
  ev: Record<string, number>;
  /** Standard deviation of the TOP action's frequency across the combos. */
  topActionStdDev: number;
  topAction: string;
  flagged: boolean;
}

export interface BucketReport {
  scenarioId: string;
  board: string;
  rows: BucketRow[];
  /** Combos actually seen in the solve output. */
  totalCombos: number;
  flagged: BucketRow[];
}

/**
 * Rounds to `places` while preserving the sum. Naive rounding of three
 * frequencies to two decimals routinely produces 0.99 or 1.01, and the 2.5
 * schema rejects anything outside 1.0 +/- 0.001 — so the residue goes on the
 * largest entry, which is the one least distorted by it.
 */
export function roundPreservingSum(
  values: Record<string, number>,
  places: number,
): Record<string, number> {
  const factor = 10 ** places;
  const entries = Object.entries(values);
  if (entries.length === 0) return {};

  const rounded = entries.map(
    ([key, value]) => [key, Math.round(value * factor) / factor] as const,
  );
  const target = Math.round(entries.reduce((sum, [, v]) => sum + v, 0) * factor) / factor;
  const actual = rounded.reduce((sum, [, v]) => sum + v, 0);
  const residue = Math.round((target - actual) * factor) / factor;

  const out: Record<string, number> = {};
  for (const [key, value] of rounded) out[key] = value;

  if (residue !== 0) {
    let largestKey = rounded[0]![0];
    for (const [key, value] of rounded) {
      if (value > (out[largestKey] ?? -Infinity)) largestKey = key;
    }
    out[largestKey] = Math.round((out[largestKey]! + residue) * factor) / factor;
  }
  return out;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Splits "AhKh" into its two cards. */
function comboCards(
  combo: string,
): [ReturnType<typeof cardsFromString>[number], ReturnType<typeof cardsFromString>[number]] {
  const cards = cardsFromString(combo);
  if (cards.length !== 2) throw new RangeError(`"${combo}" is not a two-card combo`);
  return [cards[0]!, cards[1]!];
}

export function bucketSolve(result: SolveResult, board: string, scenarioId: string): BucketReport {
  const boardCards = cardsFromString(board);
  const byClass = new Map<HandClass, ComboBucket>();

  interface ComboBucket {
    combos: number;
    frequencySums: Record<string, number>;
    evSums: Record<string, number>;
    perCombo: Array<Record<string, number>>;
  }

  for (const entry of result.hero) {
    const [a, b] = comboCards(entry.combo);
    const handClass = classifyHand([a, b], boardCards);

    let bucket = byClass.get(handClass);
    if (bucket === undefined) {
      bucket = { combos: 0, frequencySums: {}, evSums: {}, perCombo: [] };
      byClass.set(handClass, bucket);
    }

    // Every combo in the output is a specific two-card holding that survived
    // card removal, so each carries weight 1. The weight check in the tests is
    // that these sum to hero's live combo count on this board.
    bucket.combos += 1;
    bucket.perCombo.push(entry.frequencies);
    for (const action of result.actions) {
      bucket.frequencySums[action] =
        (bucket.frequencySums[action] ?? 0) + (entry.frequencies[action] ?? 0);
      bucket.evSums[action] = (bucket.evSums[action] ?? 0) + (entry.evs[action] ?? 0);
    }
  }

  const rows: BucketRow[] = [];
  for (const handClass of HAND_CLASSES) {
    const bucket = byClass.get(handClass);
    if (bucket === undefined || bucket.combos === 0) continue;

    const meanFrequencies: Record<string, number> = {};
    const meanEvs: Record<string, number> = {};
    for (const action of result.actions) {
      meanFrequencies[action] = (bucket.frequencySums[action] ?? 0) / bucket.combos;
      meanEvs[action] = (bucket.evSums[action] ?? 0) / bucket.combos;
    }

    let topAction = result.actions[0]!;
    for (const action of result.actions) {
      if ((meanFrequencies[action] ?? 0) > (meanFrequencies[topAction] ?? 0)) topAction = action;
    }
    const topActionStdDev = standardDeviation(
      bucket.perCombo.map((frequencies) => frequencies[topAction] ?? 0),
    );

    // Rounded to 2dp for frequencies and 3dp for EVs, and deliberately NOT to
    // clean fractions: values like 0.63/0.37 are the visible evidence that
    // this is real solve output rather than someone's opinion.
    rows.push({
      handClass,
      comboCount: bucket.combos,
      strategy: roundPreservingSum(meanFrequencies, 2),
      ev: Object.fromEntries(
        Object.entries(meanEvs).map(([k, v]) => [k, Math.round(v * 1000) / 1000]),
      ),
      topAction,
      topActionStdDev: Math.round(topActionStdDev * 1000) / 1000,
      flagged: topActionStdDev > VARIANCE_FLAG_THRESHOLD,
    });
  }

  return {
    scenarioId,
    board,
    rows,
    totalCombos: result.hero.length,
    flagged: rows.filter((row) => row.flagged),
  };
}

export interface TemplateOptions {
  rationaleFor: (row: BucketRow) => { text: string; reviewed: boolean };
  solutionSet?: string;
}

/**
 * Emits a template conforming to the 2.5 zod schema, so the existing importer
 * ingests solver output with no changes at all.
 */
export function toPostflopTemplate(
  scenario: Scenario,
  report: BucketReport,
  result: SolveResult,
  options: TemplateOptions,
): PostflopTemplateFile {
  const flaggedCount = report.flagged.length;
  const suspect = result.stopReason === "iteration-cap";

  return {
    id: `${scenario.id}--${report.board.replace(/\s+/g, "")}`,
    solutionSet: options.solutionSet ?? "suitedpoker-6max-100bb-v1",
    // The whole point of the pipeline. 2.10 is what decides this claim holds.
    provenance: "solver-verified",
    label: `${scenario.label} — ${report.board}`,
    street: scenario.street,
    heroPos: scenario.heroPos,
    villainPos: scenario.villainPos,
    potBb: scenario.potBb,
    effStackBb: scenario.effStackBb,
    heroRange: scenario.heroRange,
    villainRange: scenario.villainRange,
    boardTags: boardTexture(cardsFromString(report.board).slice(0, 3)),
    exampleBoards: [report.board, report.board, report.board],
    actionHistory: scenario.actionHistory.map((a) => `${a.actor} ${a.action} to ${a.toBb}bb`),
    actions: result.actions as PostflopTemplateFile["actions"],
    confidence: {
      // Confidence is DERIVED from the solve rather than asserted. A solve that
      // hit the iteration cap, or a spot where the buckets disagree internally,
      // says so here instead of shipping a clean-looking template.
      rangeShape: "high",
      frequencies: suspect ? "low" : flaggedCount > 0 ? "medium" : "high",
      ev: suspect ? "low" : "high",
      note:
        `Solver output. Exploitability ${result.exploitability.toFixed(3)}% of pot after ` +
        `${result.iterations} iterations, stopped on ${result.stopReason}. ` +
        (suspect
          ? `THIS SOLVE DID NOT CONVERGE — it hit the iteration cap. Do not treat these numbers as solved. `
          : ``) +
        (flaggedCount > 0
          ? `${flaggedCount} hand class(es) have a top-action standard deviation above ` +
            `${VARIANCE_FLAG_THRESHOLD}, meaning the solver plays combos inside one class very ` +
            `differently and the average describes neither: ` +
            `${report.flagged.map((r) => r.handClass).join(", ")}. Review those rows first.`
          : `No hand class exceeded the within-bucket variance threshold.`),
    },
    strategies: report.rows.map((row) => {
      const rationale = options.rationaleFor(row);
      return {
        handClass: row.handClass,
        strategy: row.strategy,
        ev: row.ev,
        rationale: rationale.text,
        reviewed: rationale.reviewed,
        topActionStdDev: row.topActionStdDev,
        comboCount: row.comboCount,
      };
    }),
  };
}

/** The report the plan asks to be printed for a human. */
export function formatVarianceReport(reports: readonly BucketReport[]): string {
  const lines: string[] = [];
  let flagged = 0;
  for (const report of reports) {
    for (const row of report.rows) {
      if (!row.flagged) continue;
      flagged++;
      lines.push(
        `  ${report.scenarioId} ${report.board.padEnd(14)} ${row.handClass.padEnd(22)} ` +
          `top=${row.topAction.padEnd(8)} sd=${row.topActionStdDev.toFixed(3)} n=${row.comboCount}`,
      );
    }
  }
  if (flagged === 0) return "  (no hand class exceeded the variance threshold)";
  return lines.join("\n");
}
