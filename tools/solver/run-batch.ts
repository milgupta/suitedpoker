/**
 * The batch runner: plan, solve, checkpoint, resume, bucket, write.
 *
 *   npx tsx tools/solver/run-batch.ts --dry-run      print the plan, run nothing
 *   npx tsx tools/solver/run-batch.ts --smoke        ONE solve, loose target
 *   npx tsx tools/solver/run-batch.ts --resume       skip finished solves
 *
 * A full batch is ~230 solves and will take hours, so every solve is
 * checkpointed to disk the moment it finishes. A crash at solve 200 loses one
 * solve, not 199.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { parsePreflopNode, type PreflopNode } from "@/poker/solutions";
import { Range } from "@/poker/range";
import { buildMatrix } from "@/content/solver/matrix";
import { type Scenario } from "@/content/solver/schema";

import { type PostflopActionName } from "@/poker/solutions";

import { bucketSolve, formatVarianceReport, toPostflopTemplate, type BucketReport } from "./bucket";
import { draftAll, type RationaleClient } from "./rationales";
import {
  type Manifest,
  type ManifestEntry,
  type SolveJob,
  type SolveResult,
  type SolverRunner,
} from "./types";

/** Later index acts last postflop, i.e. is in position. */
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "MP", "CO", "BTN"];

// 600, not 200: the one MEASURED convergence (2026-08-10, see README) reached a
// 0.5%-of-pot target at iteration 201 — the old cap of 200 would have stopped
// one iteration short and stamped the solve `suspect`. The cap is a safety net
// against a stalled solve, not a budget; convergence should stop the solver.
const DEFAULT_MAX_ITERATIONS = 600;
const SMOKE_MAX_ITERATIONS = 40;
const SMOKE_ACCURACY_PCT_POT = 2.0;

// ── Planning ──────────────────────────────────────────────────────────────────

export function hashJobInput(job: Omit<SolveJob, "inputHash">): string {
  // Everything that changes the answer, in a stable order. The board and the
  // ranges obviously; the bet tree, rake and targets because they change what
  // the solver is even being asked.
  const canonical = JSON.stringify({
    board: job.board,
    heroRange: job.heroRange,
    villainRange: job.villainRange,
    potBb: job.potBb,
    effStackBb: job.effStackBb,
    betTree: job.betTree,
    rake: job.rake,
    accuracyTargetPctPot: job.accuracyTargetPctPot,
    maxIterations: job.maxIterations,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export interface PlanOptions {
  smoke?: boolean;
  limit?: number;
  maxIterations?: number;
}

export function planBatch(scenarios: readonly Scenario[], options: PlanOptions = {}): SolveJob[] {
  const jobs: SolveJob[] = [];

  for (const scenario of scenarios) {
    // Smoke mode: one flop, the smallest bet tree that is still a real tree,
    // and a loose accuracy target. The point is to prove the PATH works, not
    // to produce usable strategy.
    const boards = options.smoke ? scenario.boards.slice(0, 1) : scenario.boards;
    const betTree = options.smoke
      ? { ...scenario.betTree, flop: [0.66], turn: [0.66], river: [0.66], raiseSizes: [2.5] }
      : scenario.betTree;
    const accuracy = options.smoke ? SMOKE_ACCURACY_PCT_POT : scenario.accuracyTargetPctPot;
    const maxIterations =
      options.maxIterations ?? (options.smoke ? SMOKE_MAX_ITERATIONS : DEFAULT_MAX_ITERATIONS);

    for (const board of boards) {
      const base = {
        id: `${scenario.id}--${board.replace(/\s+/g, "")}`,
        scenarioId: scenario.id,
        street: scenario.street,
        board,
        heroPos: scenario.heroPos,
        villainPos: scenario.villainPos,
        heroRange: scenario.heroRange,
        villainRange: scenario.villainRange,
        potBb: scenario.potBb,
        effStackBb: scenario.effStackBb,
        betTree,
        rake: scenario.rake,
        accuracyTargetPctPot: accuracy,
        maxIterations,
      };
      jobs.push({ ...base, inputHash: hashJobInput(base) });
      if (options.limit !== undefined && jobs.length >= options.limit) return jobs;
    }
  }
  return jobs;
}

// ── Checkpointing and resume ──────────────────────────────────────────────────

export function resultPath(outDir: string, jobId: string): string {
  return join(outDir, "solves", `${jobId}.json`);
}

/**
 * A job is already done when its output exists AND records the same input
 * hash. Comparing the hash rather than just the filename is what makes an
 * edited bet tree or range re-solve instead of silently reusing stale output.
 */
export function isComplete(outDir: string, job: SolveJob): boolean {
  const path = resultPath(outDir, job.id);
  if (!existsSync(path)) return false;
  try {
    const previous = JSON.parse(readFileSync(path, "utf8")) as SolveResult;
    return previous.inputHash === job.inputHash;
  } catch {
    return false;
  }
}

export function readResult(outDir: string, jobId: string): SolveResult {
  return JSON.parse(readFileSync(resultPath(outDir, jobId), "utf8")) as SolveResult;
}

function writeResult(outDir: string, result: SolveResult): void {
  mkdirSync(join(outDir, "solves"), { recursive: true });
  writeFileSync(resultPath(outDir, result.jobId), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

export interface BatchOptions {
  outDir: string;
  resume?: boolean;
  onProgress?: (message: string) => void;
}

export interface BatchOutcome {
  manifest: Manifest;
  results: SolveResult[];
  failures: Array<{ jobId: string; error: string }>;
}

export async function runBatch(
  jobs: readonly SolveJob[],
  runner: SolverRunner,
  options: BatchOptions,
): Promise<BatchOutcome> {
  const { outDir, resume = true } = options;
  const log = options.onProgress ?? (() => {});
  mkdirSync(join(outDir, "solves"), { recursive: true });

  const startedAt = new Date().toISOString();
  const results: SolveResult[] = [];
  const entries: ManifestEntry[] = [];
  const failures: Array<{ jobId: string; error: string }> = [];
  let skipped = 0;

  for (const [index, job] of jobs.entries()) {
    const position = `[${index + 1}/${jobs.length}]`;

    if (resume && isComplete(outDir, job)) {
      const previous = readResult(outDir, job.id);
      results.push(previous);
      entries.push(manifestEntryFor(job, previous));
      skipped++;
      log(`${position} skip ${job.id} (already solved)`);
      continue;
    }

    log(`${position} solve ${job.id}`);
    try {
      const result = await runner.solve(job);
      // Checkpoint immediately. Anything that happens after this point — a
      // crash, a kill, a full disk — costs this solve and no others.
      writeResult(outDir, result);
      results.push(result);
      entries.push(manifestEntryFor(job, result));
      if (result.stopReason === "iteration-cap") {
        log(
          `${position} ⚠ ${job.id} hit the iteration cap at ${result.exploitability.toFixed(3)}% — NOT converged`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ jobId: job.id, error: message });
      log(`${position} ✗ ${job.id}: ${message}`);
    }
  }

  const manifest: Manifest = {
    solverCommit: runner.solverCommit,
    startedAt,
    finishedAt: new Date().toISOString(),
    totalJobs: jobs.length,
    completed: results.length,
    skipped,
    failed: failures.length,
    suspect: entries.filter((e) => e.suspect).length,
    entries,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { manifest, results, failures };
}

function manifestEntryFor(job: SolveJob, result: SolveResult): ManifestEntry {
  return {
    jobId: job.id,
    scenarioId: job.scenarioId,
    board: job.board,
    inputHash: result.inputHash,
    exploitability: result.exploitability,
    iterations: result.iterations,
    stopReason: result.stopReason,
    wallMs: result.wallMs,
    memoryHighWaterMb: result.memoryHighWaterMb,
    suspect: result.stopReason === "iteration-cap",
  };
}

// ── Bucketing and emit ────────────────────────────────────────────────────────

export async function bucketAndEmit(
  scenarios: readonly Scenario[],
  results: readonly SolveResult[],
  outDir: string,
  client?: RationaleClient,
): Promise<{ reports: BucketReport[]; templates: number }> {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const reports: BucketReport[] = [];
  mkdirSync(join(outDir, "templates"), { recursive: true });
  let templates = 0;

  for (const result of results) {
    const scenarioId = result.jobId.split("--")[0]!;
    const scenario = byId.get(scenarioId);
    if (scenario === undefined) continue;
    const board = result.jobId.slice(scenarioId.length + 2);
    const spaced = (board.match(/.{1,2}/g) ?? []).join(" ");

    const report = bucketSolve(result, spaced, scenarioId);
    reports.push(report);

    const rationales = await draftAll(
      report.rows,
      {
        board: spaced,
        street: scenario.street,
        heroPos: scenario.heroPos,
        villainPos: scenario.villainPos,
        potBb: scenario.potBb,
      },
      client,
    );

    let template;
    try {
      template = toPostflopTemplate(scenario, report, result, {
        rationaleFor: (row) => {
          const rationale = rationales.get(row.handClass);
          return { text: rationale?.text ?? "", reviewed: rationale?.reviewed ?? false };
        },
      });
    } catch (error) {
      console.error(`  ✗ ${scenarioId}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    writeFileSync(
      join(outDir, "templates", `${template.id}.json`),
      `${JSON.stringify(template, null, 2)}\n`,
      "utf8",
    );
    templates++;
  }

  return { reports, templates };
}

// ══════════════════════════════════════════════════════════════════════════════
//  THE PARSER — THE ONE UNVERIFIED COMPONENT IN THIS PIPELINE
// ══════════════════════════════════════════════════════════════════════════════
//
// Everything above this line is tested without a solver. This is not, and it
// deliberately has NO unit test, because the only test I could write would
// assert that it parses a fixture I invented — which proves the parser matches
// my guess about TexasSolver's format, not that it matches TexasSolver.
//
// A wrong guess here does not throw. It produces plausible numbers that are
// silently wrong, which then flow into templates stamped `solver-verified`.
// That is precisely the failure the provenance system exists to catch, so the
// only acceptable verification is one real solve through the whole path.
//
// Until that has run, treat this function as unproven.

export interface RawSolveOutput {
  stdout: string;
  strategyJson: string;
  wallMs: number;
  memoryHighWaterMb: number;
}

/**
 * TexasSolver's action names carry their size in chips: "BET 3.000000".
 * Translate to our vocabulary by pot fraction, snapping to the nearest name
 * the 2.5 schema knows. An unrecognised action throws rather than being
 * dropped — a silently discarded action would renormalise the remaining
 * frequencies and produce a strategy nobody solved.
 */
export function normaliseAction(raw: string, potBb: number): PostflopActionName {
  const upper = raw.trim().toUpperCase();
  if (upper === "CHECK") return "check";
  if (upper === "FOLD") return "fold";
  if (upper === "CALL") return "call";

  const match = /^(BET|RAISE|ALLIN|ALL_IN)\s*([\d.]*)$/.exec(upper);
  if (match === null) throw new RangeError(`cannot read solver action "${raw}"`);
  const [, verb, sizeText] = match;
  const size = Number(sizeText);
  if (verb === "ALLIN" || verb === "ALL_IN") return "allin";
  if (!Number.isFinite(size) || potBb <= 0)
    throw new RangeError(`no size in solver action "${raw}"`);

  const fraction = size / potBb;
  if (verb === "RAISE") return fraction >= 1.5 ? "raise_pot" : "raise_small";

  // An "all-in" arrives as a BET larger than the pot by a wide margin.
  if (fraction > 1.6) return "allin";
  const candidates: Array<[PostflopActionName, number]> = [
    ["bet_33", 0.33],
    ["bet_66", 0.66],
    ["bet_100", 1],
  ];
  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (Math.abs(candidate[1] - fraction) < Math.abs(best[1] - fraction)) best = candidate;
  }
  return best[0];
}

/**
 * Parses a real TexasSolver dump. VERIFIED against actual output from commit
 * 42313c9c — see tools/solver/README.md.
 *
 * The shape is a game tree. The root node is the first decision on the street,
 * and its `strategy` block holds `{ actions: [...], strategy: { combo: [freq,
 * ...] } }`, where each combo's array is POSITIONAL against `actions`.
 *
 * NOTE: this dump contains NO EV data — frequencies only. `evs` is therefore
 * left empty and the caller must decide what to do about it. Inventing EVs
 * here would be the worst possible outcome: numbers nobody computed, stamped
 * `solver-verified`.
 */
export function parseSolverOutput(
  job: SolveJob,
  raw: RawSolveOutput,
  solverCommit: string,
): SolveResult {
  const root = JSON.parse(raw.strategyJson) as {
    strategy?: { actions?: string[]; strategy?: Record<string, number[]> };
  };
  const block = root.strategy;
  if (block?.actions === undefined || block.strategy === undefined) {
    throw new SyntaxError(
      `solver output for ${job.id} has no root strategy block — the dump format changed`,
    );
  }

  const actions = block.actions.map((raw) => normaliseAction(raw, job.potBb));
  const hero: SolveResult["hero"] = [];
  for (const [combo, frequencies] of Object.entries(block.strategy)) {
    if (frequencies.length !== actions.length) {
      throw new SyntaxError(
        `${job.id}: combo ${combo} has ${frequencies.length} frequencies for ${actions.length} actions`,
      );
    }
    hero.push({
      combo,
      frequencies: Object.fromEntries(actions.map((action, i) => [action, frequencies[i] ?? 0])),
      evs: {},
    });
  }
  if (hero.length === 0) {
    throw new SyntaxError(`${job.id}: solver output contained no combos`);
  }

  // Both are read from the LAST match, not the first. stdout emits a
  // per-player exploitability line before each total and one block per
  // iteration, so `exec` on the first match reports a player's figure from
  // iteration one — which is how this silently reported 0 iterations and the
  // wrong exploitability the first time round.
  const exploitability =
    lastNumber(raw.stdout, /Total\s+exploitability\s+(-?[\d.]+)/gi) ??
    lastNumber(raw.stdout, /exploitability[^0-9-]*(-?[\d.]+)/gi) ??
    Number.NaN;
  const iterations = lastNumber(raw.stdout, /Iter:\s*(\d+)/gi) ?? 0;

  return {
    jobId: job.id,
    inputHash: job.inputHash,
    solverCommit,
    exploitability,
    iterations,
    stopReason: exploitability <= job.accuracyTargetPctPot ? "exploitability" : "iteration-cap",
    wallMs: raw.wallMs,
    memoryHighWaterMb: raw.memoryHighWaterMb,
    actions,
    hero,
  };
}

/** The last capture of a global pattern, or undefined if it never matched. */
export function lastNumber(text: string, pattern: RegExp): number | undefined {
  let value: number | undefined;
  for (const match of text.matchAll(pattern)) {
    if (match[1] !== undefined) value = Number(match[1]);
  }
  return value;
}

// ── The Docker-backed runner ──────────────────────────────────────────────────

export const SOLVER_IMAGE = "suitedpoker/texassolver:pinned";
/** Built from the `console` branch and run from its install dir (WORKDIR). */
export const SOLVER_BINARY = "/opt/solver/console_solver";

export class DockerSolverRunner implements SolverRunner {
  readonly solverCommit: string;

  constructor(
    private readonly workDir: string,
    solverCommit?: string,
  ) {
    this.solverCommit = solverCommit ?? readSolverCommit();
  }

  async solve(job: SolveJob): Promise<SolveResult> {
    mkdirSync(this.workDir, { recursive: true });
    const inputPath = join(this.workDir, `${job.id}.txt`);
    const outputPath = join(this.workDir, `${job.id}.solve.json`);
    writeFileSync(inputPath, buildSolverInput(job, `/work/${job.id}.solve.json`), "utf8");

    const started = Date.now();
    const proc = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${resolve(this.workDir)}:/work`,
        SOLVER_IMAGE,
        SOLVER_BINARY,
        "-i",
        `/work/${job.id}.txt`,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 256 },
    );
    const wallMs = Date.now() - started;

    if (proc.status !== 0) {
      throw new Error(
        `solver exited ${proc.status}: ${(proc.stderr || proc.stdout || "").slice(0, 500)}`,
      );
    }
    const producedAt = existsSync(outputPath) ? outputPath : join(this.workDir, "out.json");
    if (!existsSync(producedAt)) throw new Error(`solver produced no output for ${job.id}`);

    writeFileSync(join(this.workDir, `${job.id}.stdout.txt`), proc.stdout ?? "", "utf8");
    return parseSolverOutput(
      job,
      {
        stdout: proc.stdout ?? "",
        strategyJson: readFileSync(producedAt, "utf8"),
        wallMs,
        memoryHighWaterMb: 0,
      },
      this.solverCommit,
    );
  }
}

/** Reads the REAL commit baked into the image at build time. Never guessed. */
function readSolverCommit(): string {
  const proc = spawnSync("docker", ["run", "--rm", SOLVER_IMAGE, "cat", "/solver-commit.txt"], {
    encoding: "utf8",
  });
  if (proc.status !== 0) return "unknown";
  return (proc.stdout ?? "").trim() || "unknown";
}

/**
 * Expands our range notation into the explicit comma-separated form
 * TexasSolver's parser accepts.
 *
 * This is NOT cosmetic. Our notation uses `+` and `-` shorthand (`22-88`,
 * `K7s-KTs`, `A2s+`); the solver's sample input enumerates every hand
 * (`AA,KK,QQ,99:0.75`). Handing it the shorthand gets a range that is silently
 * wrong or empty rather than a parse error.
 */
export function solverRange(notation: string): string {
  return Range.parse(notation)
    .entries()
    .map(([key, weight]) => (weight === 1 ? key : `${key}:${weight}`))
    .join(",");
}

/**
 * Mirrors resources/text/commandline_sample_input.txt exactly in structure and
 * order. The solver is order-sensitive: bet sizes must precede `build_tree`,
 * and `start_solve` must precede `dump_result`.
 */
export function buildSolverInput(job: SolveJob, outputPath: string): string {
  const pct = (fractions: readonly number[]) => fractions.map((f) => Math.round(f * 100)).join(",");
  const raise = pct(job.betTree.raiseSizes);
  // Postflop, the later seat acts last and is in position. Feeding hero's range
  // to set_range_oop when hero is the button solves a hand nobody plays.
  const heroIsIp = POSTFLOP_ORDER.indexOf(job.heroPos) > POSTFLOP_ORDER.indexOf(job.villainPos);

  const lines: string[] = [
    `set_pot ${job.potBb}`,
    `set_effective_stack ${job.effStackBb}`,
    `set_board ${job.board.replace(/\s+/g, ",")}`,
    `set_range_ip ${solverRange(heroIsIp ? job.heroRange : job.villainRange)}`,
    `set_range_oop ${solverRange(heroIsIp ? job.villainRange : job.heroRange)}`,
  ];

  for (const street of ["flop", "turn", "river"] as const) {
    const sizes = pct(job.betTree[street]);
    for (const seat of ["oop", "ip"] as const) {
      lines.push(`set_bet_sizes ${seat},${street},bet,${sizes}`);
      lines.push(`set_bet_sizes ${seat},${street},raise,${raise}`);
      if (job.betTree.allowAllIn) lines.push(`set_bet_sizes ${seat},${street},allin`);
    }
  }

  lines.push(
    `set_allin_threshold 0.67`,
    `build_tree`,
    `set_thread_num 8`,
    `set_accuracy ${job.accuracyTargetPctPot}`,
    `set_max_iteration ${job.maxIterations}`,
    `set_print_interval 10`,
    `set_use_isomorphism 1`,
    `start_solve`,
    `set_dump_rounds 2`,
    `dump_result ${outputPath}`,
    ``,
  );
  return lines.join("\n");
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function loadScenarios(): Scenario[] {
  const dir = resolve(process.cwd(), "src/content/solutions/preflop");
  const nodes: PreflopNode[] = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((name) => parsePreflopNode(JSON.parse(readFileSync(join(dir, name), "utf8")), name));
  return buildMatrix(nodes);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const has = (flag: string) => argv.includes(flag);
  const outDir = resolve(process.cwd(), "tools/solver/out");

  const scenarios = loadScenarios();
  const smoke = has("--smoke");
  const jobs = planBatch(scenarios, { smoke, limit: smoke ? 1 : undefined });

  if (has("--dry-run")) {
    const totalIterations = jobs.reduce((sum, j) => sum + j.maxIterations, 0);
    console.log(`solve plan`);
    console.log(`  scenarios         ${scenarios.length}`);
    console.log(`  solves            ${jobs.length}`);
    console.log(`  max iterations    ${totalIterations.toLocaleString("en-US")} across the batch`);
    console.log(`  accuracy target   ${jobs[0]?.accuracyTargetPctPot}% of pot`);
    console.log(
      `  bet tree          ${jobs[0]?.betTree.flop.length} flop / ${jobs[0]?.betTree.turn.length} turn / ${jobs[0]?.betTree.river.length} river`,
    );
    console.log(`\nfirst 5 jobs:`);
    for (const job of jobs.slice(0, 5)) console.log(`  ${job.id}  hash=${job.inputHash}`);
    console.log(`\nNothing was run. Drop --dry-run to solve.`);
    return;
  }

  console.log(`${smoke ? "SMOKE: " : ""}${jobs.length} solve(s) → ${outDir}`);
  const runner = new DockerSolverRunner(join(outDir, "work"));
  console.log(`solver commit: ${runner.solverCommit}`);

  const outcome = await runBatch(jobs, runner, {
    outDir,
    resume: has("--resume"),
    onProgress: (message) => console.log(message),
  });

  const { reports, templates } = await bucketAndEmit(scenarios, outcome.results, outDir);

  console.log(`\n── results ──`);
  for (const entry of outcome.manifest.entries) {
    console.log(
      `  ${entry.jobId}\n` +
        `    exploitability ${entry.exploitability.toFixed(4)}% of pot` +
        `  iterations ${entry.iterations}  stopped on ${entry.stopReason}` +
        `  wall ${(entry.wallMs / 1000).toFixed(1)}s${entry.suspect ? "   ⚠ NOT CONVERGED" : ""}`,
    );
  }
  console.log(`\n── within-bucket variance ──\n${formatVarianceReport(reports)}`);
  console.log(`\n${templates} template(s) written to ${join(outDir, "templates")}`);
  if (outcome.failures.length > 0) {
    console.error(`\n${outcome.failures.length} solve(s) FAILED:`);
    for (const failure of outcome.failures) console.error(`  ${failure.jobId}: ${failure.error}`);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]?.endsWith("run-batch.ts") === true;
if (isDirectRun) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
