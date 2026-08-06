import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cardsFromString, createRng, FULL_DECK } from "@/poker/cards";
import { classifyHand, HAND_CLASSES } from "@/poker/handclass";
import { combosOf, HAND_KEYS, Range } from "@/poker/range";
import { parsePostflopTemplate } from "@/poker/solutions";
import { buildMatrix } from "@/content/solver/matrix";
import { type Scenario } from "@/content/solver/schema";
import {
  bucketSolve,
  formatVarianceReport,
  roundPreservingSum,
  toPostflopTemplate,
  VARIANCE_FLAG_THRESHOLD,
} from "../../../tools/solver/bucket";
import {
  buildPrompt,
  contradictsNumbers,
  deterministicRationale,
  draftRationale,
  type RationaleClient,
} from "../../../tools/solver/rationales";
import {
  buildSolverInput,
  hashJobInput,
  isComplete,
  lastNumber,
  normaliseAction,
  planBatch,
  runBatch,
  solverRange,
} from "../../../tools/solver/run-batch";
import { type SolveJob, type SolveResult, type SolverRunner } from "../../../tools/solver/types";

import { loadPreflopNodes } from "./helpers/load-solutions";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

const scenarios: Scenario[] = buildMatrix(loadPreflopNodes());
const ACTIONS = ["check", "bet_33", "bet_66"];

/**
 * A stub runner that returns an ALREADY-PARSED result.
 *
 * It deliberately never produces raw solver text, so no test in this file
 * exercises `parseSolverOutput`. A stub emitting a format I invented would
 * only prove the parser matches my guess — which is the one thing that must be
 * proven against the real solver instead.
 */
function stubRunner(options: { failOn?: string; seed?: string } = {}): SolverRunner {
  return {
    solverCommit: "stub-0000000",
    async solve(job: SolveJob): Promise<SolveResult> {
      if (options.failOn === job.id) throw new Error(`simulated crash on ${job.id}`);
      return syntheticResult(job, options.seed ?? "stub");
    },
  };
}

/** Deterministic combo-level strategy for a job. Our shape, not the solver's. */
function syntheticResult(job: SolveJob, seed: string): SolveResult {
  const rng = createRng(`${seed}:${job.id}`);
  const board = cardsFromString(job.board);
  const dead = new Set<number>(board);
  const range = Range.parse(job.heroRange);

  const hero: SolveResult["hero"] = [];
  for (const key of range.keys()) {
    for (const combo of combosOf(key)) {
      if (dead.has(combo[0]) || dead.has(combo[1])) continue;
      const bet = rng();
      const rest = 1 - bet;
      const split = rng();
      const frequencies = {
        check: Number(bet.toFixed(4)),
        bet_33: Number((rest * split).toFixed(4)),
        bet_66: Number((rest * (1 - split)).toFixed(4)),
      };
      hero.push({
        combo: `${cardText(combo[0])}${cardText(combo[1])}`,
        frequencies,
        evs: { check: rng() * 4, bet_33: rng() * 4, bet_66: rng() * 4 },
      });
    }
  }

  return {
    jobId: job.id,
    inputHash: job.inputHash,
    solverCommit: "stub-0000000",
    exploitability: 0.21,
    iterations: 137,
    stopReason: "exploitability",
    wallMs: 4200,
    memoryHighWaterMb: 812,
    actions: ACTIONS,
    hero,
  };
}

function cardText(card: number): string {
  return `${"23456789TJQKA"[card >> 2]}${"cdhs"[card & 3]}`;
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "solver-batch-"));
}

// ── Planning and hashing ──────────────────────────────────────────────────────

describe("planning", () => {
  it("plans one job per scenario x board", () => {
    const jobs = planBatch(scenarios);
    expect(jobs.length).toBe(scenarios.reduce((sum, s) => sum + s.boards.length, 0));
    expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
    record("batch plan", `${jobs.length} jobs from ${scenarios.length} scenarios, all ids unique`);
  });

  it("reduces smoke mode to a single solve with a loose target", () => {
    const jobs = planBatch(scenarios, { smoke: true, limit: 1 });
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    expect(job.betTree.flop).toHaveLength(1);
    expect(job.accuracyTargetPctPot).toBeGreaterThan(scenarios[0]!.accuracyTargetPctPot);
    expect(job.maxIterations).toBeLessThan(100);
    record(
      "smoke plan",
      `1 solve, ${job.betTree.flop.length} flop size, ${job.accuracyTargetPctPot}% target`,
    );
  });

  it("hashes everything that changes the answer", () => {
    const [job] = planBatch(scenarios, { limit: 1 });
    const base = { ...job! };
    const original = hashJobInput(base);
    expect(hashJobInput({ ...base })).toBe(original);

    // Each of these changes the question being asked, so each must re-solve.
    expect(hashJobInput({ ...base, board: "2c 3d 4h" })).not.toBe(original);
    expect(hashJobInput({ ...base, heroRange: "AA" })).not.toBe(original);
    expect(hashJobInput({ ...base, potBb: 99 })).not.toBe(original);
    expect(hashJobInput({ ...base, accuracyTargetPctPot: 1 })).not.toBe(original);
    expect(hashJobInput({ ...base, betTree: { ...base.betTree, flop: [0.1] } })).not.toBe(original);
    expect(hashJobInput({ ...base, rake: { percent: 0.01, capBb: 1 } })).not.toBe(original);
    record("input hashing", "board, ranges, pot, targets, bet tree and rake all change the hash");
  });

  it("builds a solver input matching the sample's structure and order", () => {
    const [job] = planBatch(scenarios, { limit: 1 });
    const input = buildSolverInput(job!, "/work/out.json");
    expect(input).toContain(`set_board ${job!.board.replace(/\s+/g, ",")}`);
    expect(input).toContain(`set_accuracy ${job!.accuracyTargetPctPot}`);
    expect(input).toContain(`set_max_iteration ${job!.maxIterations}`);
    expect(input).toContain("start_solve");
    // Order matters to the solver: sizes before build_tree, solve before dump.
    expect(input.indexOf("set_bet_sizes")).toBeLessThan(input.indexOf("build_tree"));
    expect(input.indexOf("start_solve")).toBeLessThan(input.indexOf("dump_result"));
  });

  it("expands ranges to the explicit form the solver parses", () => {
    // Verified against resources/text/commandline_sample_input.txt: the solver
    // enumerates every hand. Handing it our `22-88` / `A2s+` shorthand yields a
    // silently wrong or empty range, not a parse error.
    expect(solverRange("77+,AKs")).toBe("AA,AKs,KK,QQ,JJ,TT,99,88,77");
    expect(solverRange("AKs:0.5,AA")).toBe("AA,AKs:0.5");
    const [job] = planBatch(scenarios, { limit: 1 });
    const input = buildSolverInput(job!, "/work/out.json");
    expect(input).not.toMatch(/set_range_(ip|oop) [^\n]*[+-]/);
    record("range expansion", "shorthand is expanded; no + or - reaches the solver");
  });

  it("puts hero's range on the correct side of the table", () => {
    // Hero is BTN here — in position. Feeding heroRange to set_range_oop
    // solves a hand nobody plays, and it did until a real solve exposed it.
    const job = planBatch(scenarios, { limit: 1 })[0]!;
    expect(job.heroPos).toBe("BTN");
    const input = buildSolverInput(job, "/work/out.json");
    const ip = /set_range_ip (.+)/.exec(input)?.[1];
    expect(ip).toBe(solverRange(job.heroRange));
    record("position assignment", "the in-position seat gets the in-position range");
  });

  it("normalises solver action names by pot fraction", () => {
    // Real names from commit 42313c9c: "CHECK", "BET 3.000000".
    expect(normaliseAction("CHECK", 5.5)).toBe("check");
    expect(normaliseAction("CALL", 5.5)).toBe("call");
    expect(normaliseAction("BET 3.000000", 5.5)).toBe("bet_66");
    expect(normaliseAction("BET 1.815", 5.5)).toBe("bet_33");
    expect(normaliseAction("BET 5.5", 5.5)).toBe("bet_100");
    expect(normaliseAction("BET 97.000000", 5.5)).toBe("allin");
    expect(normaliseAction("RAISE 32.000000", 5.5)).toBe("raise_pot");
    expect(() => normaliseAction("SHRUG", 5.5)).toThrow();
    record("action normalisation", "solver action names map onto the 2.5 vocabulary");
  });

  it("reads the LAST stdout match, not the first", () => {
    // stdout prints a per-player exploitability line before each total, and one
    // block per iteration. Reading the first match reported 0 iterations and
    // the wrong exploitability from a real run.
    const stdout = [
      "Iter: 21",
      "player 0 exploitability 1.8136742",
      "Total exploitability 28.572405 precent",
      "Iter: 31",
      "player 0 exploitability 1.1003702",
      "Total exploitability 15.751698 precent",
    ].join("\n");
    expect(lastNumber(stdout, /Iter:\s*(\d+)/gi)).toBe(31);
    expect(lastNumber(stdout, /Total\s+exploitability\s+(-?[\d.]+)/gi)).toBe(15.751698);
    expect(lastNumber(stdout, /nothing(\d+)/gi)).toBeUndefined();
    record("stdout parsing", "last match wins — validated against a real solver log");
  });
});

// ── The queue, checkpointing and resume ───────────────────────────────────────

describe("the job queue", () => {
  it("checkpoints every solve to disk as it finishes", async () => {
    const out = tempDir();
    try {
      const jobs = planBatch(scenarios, { limit: 4 });
      await runBatch(jobs, stubRunner(), { outDir: out });
      const written = readdirSync(join(out, "solves"));
      expect(written).toHaveLength(4);
      expect(existsSync(join(out, "manifest.json"))).toBe(true);
      record("checkpointing", "one file per solve, written as each completes");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("survives a crash and resumes byte-identically", async () => {
    const uninterrupted = tempDir();
    const interrupted = tempDir();
    try {
      const jobs = planBatch(scenarios, { limit: 6 });

      // Reference run.
      await runBatch(jobs, stubRunner(), { outDir: uninterrupted });

      // Crash on job 4, then restart with resume.
      const crashing = await runBatch(jobs, stubRunner({ failOn: jobs[3]!.id }), {
        outDir: interrupted,
      });
      expect(crashing.failures).toHaveLength(1);
      expect(readdirSync(join(interrupted, "solves"))).toHaveLength(5);

      const resumed = await runBatch(jobs, stubRunner(), { outDir: interrupted, resume: true });
      expect(resumed.manifest.skipped).toBe(5);
      expect(resumed.failures).toHaveLength(0);

      // Every solve file must match the uninterrupted run exactly.
      for (const name of readdirSync(join(uninterrupted, "solves"))) {
        expect(
          readFileSync(join(interrupted, "solves", name), "utf8"),
          `${name} differs after resume`,
        ).toBe(readFileSync(join(uninterrupted, "solves", name), "utf8"));
      }
      record(
        "kill and resume",
        "crash at solve 4 of 6, restart skips the 5 finished and output is byte-identical",
      );
    } finally {
      rmSync(uninterrupted, { recursive: true, force: true });
      rmSync(interrupted, { recursive: true, force: true });
    }
  });

  it("re-solves when the input hash changes, and only then", async () => {
    const out = tempDir();
    try {
      const jobs = planBatch(scenarios, { limit: 2 });
      await runBatch(jobs, stubRunner(), { outDir: out });
      expect(isComplete(out, jobs[0]!)).toBe(true);

      // Same id, different question — must not be treated as done.
      const edited: SolveJob = { ...jobs[0]!, heroRange: "AA", inputHash: "deadbeefdeadbeef" };
      expect(isComplete(out, edited)).toBe(false);
      record("stale detection", "an edited bet tree or range re-solves instead of reusing output");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("is deterministic across two full runs", async () => {
    const a = tempDir();
    const b = tempDir();
    try {
      const jobs = planBatch(scenarios, { limit: 3 });
      await runBatch(jobs, stubRunner(), { outDir: a });
      await runBatch(jobs, stubRunner(), { outDir: b });
      for (const name of readdirSync(join(a, "solves"))) {
        expect(readFileSync(join(b, "solves", name), "utf8")).toBe(
          readFileSync(join(a, "solves", name), "utf8"),
        );
      }
      record("determinism", "the same inputs produce byte-identical solve files twice");
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("flags a solve that hit the iteration cap instead of hiding it", async () => {
    const out = tempDir();
    try {
      const jobs = planBatch(scenarios, { limit: 1 });
      const capped: SolverRunner = {
        solverCommit: "stub-0000000",
        async solve(job) {
          return {
            ...syntheticResult(job, "capped"),
            stopReason: "iteration-cap",
            exploitability: 4.2,
          };
        },
      };
      const outcome = await runBatch(jobs, capped, { outDir: out });
      expect(outcome.manifest.suspect).toBe(1);
      expect(outcome.manifest.entries[0]?.suspect).toBe(true);
      record(
        "non-convergence flagged",
        "an iteration-capped solve is marked suspect in the manifest",
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("records the solver commit in the manifest", async () => {
    const out = tempDir();
    try {
      const outcome = await runBatch(planBatch(scenarios, { limit: 1 }), stubRunner(), {
        outDir: out,
      });
      expect(outcome.manifest.solverCommit).toBe("stub-0000000");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

// ── Bucketing ─────────────────────────────────────────────────────────────────

describe("bucketing 1,326 combos into hand classes", () => {
  const [job] = planBatch(scenarios, { limit: 1 });
  const result = syntheticResult(job!, "bucket");
  const report = bucketSolve(result, job!.board, job!.scenarioId);

  it("uses classifyHand from 2.5 rather than its own logic", () => {
    // The import is the guarantee; this asserts the two agree combo by combo.
    const board = cardsFromString(job!.board);
    const counts = new Map<string, number>();
    for (const entry of result.hero) {
      const cards = cardsFromString(entry.combo);
      const handClass = classifyHand([cards[0]!, cards[1]!], board);
      counts.set(handClass, (counts.get(handClass) ?? 0) + 1);
    }
    for (const row of report.rows) {
      expect(row.comboCount, `${row.handClass} count disagrees with classifyHand`).toBe(
        counts.get(row.handClass),
      );
    }
    record("classifyHand shared", "every bucket count reproduces from 2.5's classifier directly");
  });

  it("has no duplicated classification logic in the tools tree", () => {
    const source = readFileSync(join(process.cwd(), "tools/solver/bucket.ts"), "utf8");
    expect(source).toContain('from "@/poker/handclass"');
    // The tell-tales of a reimplementation.
    expect(source).not.toMatch(/top_pair_good_kicker\s*[:=]/);
    expect(source).not.toMatch(/function\s+classify/i);
    record("no reimplementation", "bucket.ts imports classifyHand and defines no classifier");
  });

  it("accounts for every live combo exactly once", () => {
    const bucketed = report.rows.reduce((sum, row) => sum + row.comboCount, 0);
    expect(bucketed).toBe(result.hero.length);

    // And the solve output itself covers hero's range after card removal.
    const live = Range.parse(job!.heroRange).combosBlocked(cardsFromString(job!.board)).length;
    expect(result.hero.length).toBe(live);
    record(
      "combo weights sum",
      `${bucketed} combos bucketed = ${live} in hero's range after card removal`,
    );
  });

  it("only emits classes the engine knows", () => {
    for (const row of report.rows) expect(HAND_CLASSES).toContain(row.handClass);
  });

  it("keeps frequencies summing to 1 after rounding", () => {
    for (const row of report.rows) {
      const sum = Object.values(row.strategy).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1), `${row.handClass} sums to ${sum}`).toBeLessThan(0.001);
    }
    record("rounding preserves sums", "2dp rounding never breaks the schema's 1.0 +/- 0.001 rule");
  });

  it("rounds to 2dp without snapping to clean fractions", () => {
    const values = Object.values(report.rows.flatMap((r) => Object.values(r.strategy)));
    const clean = values.filter((v) => [0, 0.25, 0.5, 0.75, 1].includes(v)).length;
    expect(clean / values.length).toBeLessThan(0.5);
  });

  it("preserves sums even in the adversarial rounding cases", () => {
    expect(
      Object.values(roundPreservingSum({ a: 1 / 3, b: 1 / 3, c: 1 / 3 }, 2)).reduce(
        (x, y) => x + y,
      ),
    ).toBeCloseTo(1, 9);
    expect(
      Object.values(roundPreservingSum({ a: 0.005, b: 0.005, c: 0.99 }, 2)).reduce((x, y) => x + y),
    ).toBeCloseTo(1, 9);
    expect(roundPreservingSum({}, 2)).toEqual({});
  });

  it("flags a bucket whose combos are played very differently", () => {
    // Construct a class the solver splits: half always check, half always bet.
    const board = "Ah 7d 2c";
    const split: SolveResult = {
      ...result,
      hero: HAND_KEYS.slice(0, 40).flatMap((key, index) =>
        combosOf(key)
          .filter(
            ([a, b]) => !cardsFromString(board).includes(a) && !cardsFromString(board).includes(b),
          )
          .slice(0, 1)
          .map(([a, b]) => ({
            combo: `${cardText(a)}${cardText(b)}`,
            frequencies:
              index % 2 === 0
                ? { check: 1, bet_33: 0, bet_66: 0 }
                : { check: 0, bet_33: 1, bet_66: 0 },
            evs: { check: 1, bet_33: 1, bet_66: 0 },
          })),
      ),
    };
    const splitReport = bucketSolve(split, board, "variance-test");
    expect(splitReport.flagged.length).toBeGreaterThan(0);
    for (const row of splitReport.flagged) {
      expect(row.topActionStdDev).toBeGreaterThan(VARIANCE_FLAG_THRESHOLD);
    }
    console.log(
      `\nvariance report (constructed split-strategy bucket):\n${formatVarianceReport([splitReport])}`,
    );
    record(
      "variance flag fires",
      `${splitReport.flagged.length} bucket(s) flagged above sd ${VARIANCE_FLAG_THRESHOLD}`,
    );
  });

  it("emits a template the 2.5 importer accepts unchanged", () => {
    const scenario = scenarios.find((s) => s.id === job!.scenarioId)!;
    const template = toPostflopTemplate(scenario, report, result, {
      rationaleFor: (row) => ({
        text: deterministicRationale({
          handClass: row.handClass,
          board: job!.board,
          street: scenario.street,
          heroPos: scenario.heroPos,
          villainPos: scenario.villainPos,
          potBb: scenario.potBb,
          strategy: row.strategy,
          ev: row.ev,
          topAction: row.topAction,
          comboCount: row.comboCount,
          topActionStdDev: row.topActionStdDev,
        }),
        reviewed: false,
      }),
    });

    // The real assertion: it parses under the schema written in 2.5.
    const parsed = parsePostflopTemplate(template, "generated");
    expect(parsed.provenance).toBe("solver-verified");
    expect(parsed.strategies.length).toBe(report.rows.length);
    for (const entry of parsed.strategies) expect(entry.reviewed).toBe(false);
    record("importer compatibility", "generated templates parse under the 2.5 schema unchanged");
  });

  it("says so in the confidence note when a solve did not converge", () => {
    const scenario = scenarios.find((s) => s.id === job!.scenarioId)!;
    const notConverged = { ...result, stopReason: "iteration-cap" as const };
    const template = toPostflopTemplate(scenario, report, notConverged, {
      rationaleFor: () => ({ text: "x".repeat(30), reviewed: false }),
    });
    expect(template.confidence.note).toMatch(/DID NOT CONVERGE/);
    expect(template.confidence.frequencies).toBe("low");
    record("non-convergence surfaces", "a capped solve downgrades its own confidence and says why");
  });
});

// ── Rationales ────────────────────────────────────────────────────────────────

describe("rationales explain the numbers, never determine them", () => {
  const context = {
    handClass: "top_pair_good_kicker",
    board: "Ah 7d 2c",
    street: "flop",
    heroPos: "BTN",
    villainPos: "BB",
    potBb: 5.5,
    strategy: { check: 0.15, bet_33: 0.85, bet_66: 0 },
    ev: { check: 2.4, bet_33: 2.72, bet_66: 2.42 },
    topAction: "bet_33",
    comboCount: 12,
    topActionStdDev: 0.04,
  };

  it("builds a prompt that hands over the numbers and forbids inventing more", () => {
    const prompt = buildPrompt(context);
    expect(prompt).toContain("bet_33 85%");
    expect(prompt).toContain("Do not state any number other than the ones given above");
    expect(prompt).toContain('Name "bet_33" as the main action');
  });

  it("never contradicts the numbers when generated deterministically", () => {
    const text = deterministicRationale(context);
    expect(contradictsNumbers(text, context)).toBe(false);
    expect(text.length).toBeGreaterThan(20);
  });

  it("detects prose that names the wrong action", () => {
    expect(contradictsNumbers("You should check here every time.", context)).toBe(true);
    expect(contradictsNumbers("Bet a third of the pot with this hand.", context)).toBe(false);
    // Naming an action the solver never takes reads as advice the data denies.
    expect(contradictsNumbers("Bet 33%, or raise for value.", context)).toBe(true);
  });

  it("regenerates once, then falls back rather than shipping a contradiction", async () => {
    let calls = 0;
    const stubborn: RationaleClient = {
      name: "stub",
      async draft() {
        calls++;
        return "Just check it down, always.";
      },
    };
    const rationale = await draftRationale(context, stubborn);
    expect(calls).toBe(2);
    expect(rationale.fellBack).toBe(true);
    expect(rationale.source).toBe("deterministic");
    expect(contradictsNumbers(rationale.text, context)).toBe(false);
    record(
      "contradiction guard",
      "a model that argues with the data is retried once then overridden",
    );
  });

  it("accepts good prose on the first try", async () => {
    let calls = 0;
    const good: RationaleClient = {
      name: "stub",
      async draft() {
        calls++;
        return "Bet small with top pair here — most of their range can still call.";
      },
    };
    const rationale = await draftRationale(context, good);
    expect(calls).toBe(1);
    expect(rationale.fellBack).toBe(false);
    expect(rationale.source).toBe("stub");
  });

  it("falls back when the model throws", async () => {
    const broken: RationaleClient = {
      name: "stub",
      async draft() {
        throw new Error("rate limited");
      },
    };
    const rationale = await draftRationale(context, broken);
    expect(rationale.source).toBe("deterministic");
  });

  it("marks everything unreviewed", async () => {
    const rationale = await draftRationale(context);
    expect(rationale.reviewed).toBe(false);
    record("reviewed flag", "every drafted rationale ships reviewed:false for 2.10 to flip");
  });

  it("warns in the prose when the bucket is internally inconsistent", () => {
    const text = deterministicRationale({ ...context, topActionStdDev: 0.4 });
    expect(text).toMatch(/quite differently/);
  });
});

// ── The parser is deliberately untested ───────────────────────────────────────

describe("the parser", () => {
  it("is NOT verified by any test in this file, on purpose", () => {
    // Documenting the hole rather than papering over it. The only test that
    // could live here would assert parseSolverOutput handles a fixture we
    // invented, which proves it matches our guess about TexasSolver's format
    // and nothing else. A wrong guess does not throw — it produces plausible
    // numbers that are silently wrong, stamped `solver-verified`.
    //
    // Verification is one real solve through the whole path. Until that has
    // run, 2.9 is not done.
    const pipelineSource = readFileSync(join(process.cwd(), "tools/solver/run-batch.ts"), "utf8");
    expect(pipelineSource).toContain("THE ONE UNVERIFIED COMPONENT");
    // Grepping this file for the function name would be self-defeating — the
    // literal appears in this very comment. Assert on the import list instead,
    // which is the property that actually matters: the parser is not reachable
    // from any test in this file.
    const thisFile = readFileSync(
      join(process.cwd(), "tests/unit/poker/solver-pipeline.test.ts"),
      "utf8",
    );
    const importBlock = thisFile.slice(0, thisFile.indexOf("const results"));
    expect(importBlock).not.toMatch(/parseSolverOutput/);
    record(
      "parser left unverified",
      "no fixture test exists for parseSolverOutput — it needs a real solve",
    );
  });
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(
      `\n2.9 — solver batch pipeline (everything except the parser)\n${table.join("\n")}\n`,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(FULL_DECK).toHaveLength(52);
  });
});
