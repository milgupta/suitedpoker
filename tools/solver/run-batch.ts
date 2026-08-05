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
import { buildMatrix } from "@/content/solver/matrix";
import { type Scenario } from "@/content/solver/schema";

import { bucketSolve, formatVarianceReport, toPostflopTemplate, type BucketReport } from "./bucket";
import { draftAll, type RationaleClient } from "./rationales";
import {
  type Manifest,
  type ManifestEntry,
  type SolveJob,
  type SolveResult,
  type SolverRunner,
} from "./types";

const DEFAULT_MAX_ITERATIONS = 200;
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
      ? { ...scenario.betTree, flop: [0.5], turn: [0.75], river: [0.75], raiseSizes: [2.5] }
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

    const template = toPostflopTemplate(scenario, report, result, {
      rationaleFor: (row) => {
        const rationale = rationales.get(row.handClass);
        return { text: rationale?.text ?? "", reviewed: rationale?.reviewed ?? false };
      },
    });
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

export function parseSolverOutput(
  job: SolveJob,
  raw: RawSolveOutput,
  solverCommit: string,
): SolveResult {
  const parsed = JSON.parse(raw.strategyJson) as Record<string, unknown>;

  const strategy = (parsed.strategy ?? parsed.player_0 ?? parsed) as Record<string, unknown>;
  const actions = extractActions(parsed, strategy);

  const hero: SolveResult["hero"] = [];
  for (const [combo, value] of Object.entries(strategy)) {
    if (!/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/i.test(combo)) continue;
    const record = value as Record<string, unknown>;
    const frequencies: Record<string, number> = {};
    const evs: Record<string, number> = {};
    for (const action of actions) {
      const cell = record[action] as Record<string, unknown> | number | undefined;
      if (typeof cell === "number") frequencies[action] = cell;
      else if (cell !== undefined) {
        frequencies[action] = Number(cell.frequency ?? cell.freq ?? 0);
        evs[action] = Number(cell.ev ?? 0);
      }
    }
    hero.push({ combo, frequencies, evs });
  }

  const exploitability = readNumber(raw.stdout, /exploitability[^0-9-]*(-?[\d.]+)/i) ?? Number.NaN;
  const iterations = readNumber(raw.stdout, /iteration[s]?[^0-9]*(\d+)/i) ?? 0;

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

function extractActions(
  parsed: Record<string, unknown>,
  strategy: Record<string, unknown>,
): string[] {
  if (Array.isArray(parsed.actions)) return parsed.actions.map(String);
  const first = Object.values(strategy)[0];
  if (first !== null && typeof first === "object") return Object.keys(first as object);
  return [];
}

function readNumber(text: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(text);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

// ── The Docker-backed runner ──────────────────────────────────────────────────

export const SOLVER_IMAGE = "suitedpoker/texassolver:pinned";

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
    writeFileSync(inputPath, buildSolverInput(job, "/work/out.json"), "utf8");

    const started = Date.now();
    const proc = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${resolve(this.workDir)}:/work`,
        SOLVER_IMAGE,
        "console_solver",
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

export function buildSolverInput(job: SolveJob, outputPath: string): string {
  const sizes = (fractions: readonly number[]) =>
    fractions.map((f) => Math.round(f * 100)).join(",");
  return [
    `set_pot ${job.potBb}`,
    `set_effective_stack ${job.effStackBb}`,
    `set_board ${job.board.replace(/\s+/g, ",")}`,
    `set_range_ip ${job.heroPos === job.villainPos ? job.heroRange : job.villainRange}`,
    `set_range_oop ${job.heroRange}`,
    `set_bet_sizes oop,flop,bet,${sizes(job.betTree.flop)}`,
    `set_bet_sizes ip,flop,bet,${sizes(job.betTree.flop)}`,
    `set_bet_sizes oop,turn,bet,${sizes(job.betTree.turn)}`,
    `set_bet_sizes ip,turn,bet,${sizes(job.betTree.turn)}`,
    `set_bet_sizes oop,river,bet,${sizes(job.betTree.river)}`,
    `set_bet_sizes ip,river,bet,${sizes(job.betTree.river)}`,
    `set_bet_sizes oop,flop,raise,${sizes(job.betTree.raiseSizes)}`,
    `set_bet_sizes ip,flop,raise,${sizes(job.betTree.raiseSizes)}`,
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
  ].join("\n");
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
