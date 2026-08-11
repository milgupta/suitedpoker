/**
 * One solve, settings overridden from the command line, stdout streamed to a
 * log file so the convergence trajectory can be watched WHILE it runs.
 *
 * This exists because the batch runner's spawnSync only surfaces stdout after
 * the solver exits — useless for answering "is this configuration converging
 * or stalling", which is a question about the curve, not the endpoint.
 *
 *   npx tsx tools/solver/tune.ts --accuracy=0.5 --iterations=400
 *   npx tsx tools/solver/tune.ts --job=srp-btn-vs-bb-flop-pfr--AcKdTh \
 *     --sizes=0.33,0.66 --accuracy=0.5 --iterations=400 --threads=10
 *
 * Results land in tools/solver/out/tune/, never in out/solves/ — a tuning run
 * must not be mistakable for batch output.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { parsePreflopNode, type PreflopNode } from "@/poker/solutions";
import { buildMatrix } from "@/content/solver/matrix";

import {
  buildSolverInput,
  hashJobInput,
  lastNumber,
  parseSolverOutput,
  planBatch,
  SOLVER_BINARY,
  SOLVER_IMAGE,
} from "./run-batch";
import { type SolveJob } from "./types";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

function numberArg(name: string): number | undefined {
  const raw = arg(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new RangeError(`--${name} must be a number, got "${raw}"`);
  return value;
}

function loadScenarios() {
  const dir = resolve(process.cwd(), "src/content/solutions/preflop");
  const nodes: PreflopNode[] = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((name) => parsePreflopNode(JSON.parse(readFileSync(join(dir, name), "utf8")), name));
  return buildMatrix(nodes);
}

async function main(): Promise<void> {
  const scenarios = loadScenarios();
  // Full-tree jobs as the base so the bet tree is the REAL one unless
  // overridden — a tuning run against the smoke tree proves the wrong thing.
  const jobs = planBatch(scenarios, {});
  const jobId = arg("job") ?? jobs[0]?.id;
  const base = jobs.find((j) => j.id === jobId);
  if (base === undefined) {
    console.error(`no job "${jobId}". First few:`);
    for (const j of jobs.slice(0, 8)) console.error(`  ${j.id}`);
    process.exit(1);
  }

  const sizes = arg("sizes")
    ?.split(",")
    .map((s) => Number(s));
  const raise = numberArg("raise");
  const betTree = {
    ...base.betTree,
    ...(sizes === undefined ? {} : { flop: sizes, turn: sizes, river: sizes }),
    ...(raise === undefined ? {} : { raiseSizes: [raise] }),
  };

  const overridden = {
    ...base,
    betTree,
    accuracyTargetPctPot: numberArg("accuracy") ?? base.accuracyTargetPctPot,
    maxIterations: numberArg("iterations") ?? base.maxIterations,
  };
  // hashJobInput reads only the answer-affecting fields, so the stale hash on
  // `overridden` cannot leak into the new one.
  const job: SolveJob = { ...overridden, inputHash: hashJobInput(overridden) };

  const threads = numberArg("threads");
  const workDir = resolve(process.cwd(), "tools/solver/out/tune");
  mkdirSync(workDir, { recursive: true });

  let input = buildSolverInput(job, `/work/${job.id}.solve.json`);
  if (threads !== undefined) {
    input = input.replace(/^set_thread_num \d+$/m, `set_thread_num ${threads}`);
  }
  const inputPath = join(workDir, `${job.id}.txt`);
  const logPath = join(workDir, `${job.id}.stdout.txt`);
  writeFileSync(inputPath, input, "utf8");

  console.log(`job        ${job.id}`);
  console.log(`board      ${job.board}   pot ${job.potBb}bb   stack ${job.effStackBb}bb`);
  console.log(
    `tree       flop [${job.betTree.flop}] turn [${job.betTree.turn}] river [${job.betTree.river}] raise [${job.betTree.raiseSizes}] allin=${job.betTree.allowAllIn}`,
  );
  console.log(
    `target     ${job.accuracyTargetPctPot}% of pot, cap ${job.maxIterations} iterations`,
  );
  console.log(`log        ${logPath}`);

  const started = Date.now();
  const proc = spawn(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${workDir}:/work`,
      SOLVER_IMAGE,
      SOLVER_BINARY,
      "-i",
      `/work/${job.id}.txt`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let stdout = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
    writeFileSync(logPath, stdout, "utf8");
  });
  let stderr = "";
  proc.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const code: number = await new Promise((resolveExit) => proc.on("close", resolveExit));
  const wallMs = Date.now() - started;
  writeFileSync(logPath, stdout, "utf8");

  if (code !== 0) {
    console.error(`solver exited ${code}\n${(stderr || stdout).slice(0, 1000)}`);
    process.exit(1);
  }

  const outputPath = join(workDir, `${job.id}.solve.json`);
  const exploitability = lastNumber(stdout, /Total\s+exploitability\s+(-?[\d.]+)/gi) ?? Number.NaN;
  const iterations = lastNumber(stdout, /Iter:\s*(\d+)/gi) ?? 0;
  const converged = exploitability <= job.accuracyTargetPctPot;

  console.log(`\n── outcome ──`);
  console.log(
    `exploitability   ${exploitability.toFixed(4)}% of pot (target ${job.accuracyTargetPctPot}%)`,
  );
  console.log(`iterations       ${iterations}`);
  console.log(
    `wall             ${(wallMs / 1000).toFixed(1)}s  (${(wallMs / 1000 / Math.max(iterations, 1)).toFixed(2)}s/iter)`,
  );
  console.log(`converged        ${converged ? "YES" : "NO — hit the iteration cap"}`);

  if (existsSync(outputPath)) {
    // Round-trip through the real parser so a tuning run also re-proves the
    // parse path against whatever this configuration dumped.
    const result = parseSolverOutput(
      job,
      { stdout, strategyJson: readFileSync(outputPath, "utf8"), wallMs, memoryHighWaterMb: 0 },
      "tune-run",
    );
    console.log(`combos parsed    ${result.hero.length}`);
  } else {
    console.log(`NOTE: no dump at ${outputPath}`);
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
