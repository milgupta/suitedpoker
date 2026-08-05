/**
 * The boundary types for the solve pipeline.
 *
 * `SolveResult` is deliberately OUR shape, not TexasSolver's. Everything
 * downstream — bucketing, rationales, the emitted templates — is written
 * against this type and can be tested without a solver anywhere near it. The
 * only code that knows TexasSolver's actual output format is the parser in
 * run-batch.ts, and that isolation is the point: see the warning there.
 */

import { type Scenario, type SolveStreet } from "@/content/solver/schema";

export interface SolveJob {
  /** Stable and filesystem-safe. One output file per job. */
  id: string;
  scenarioId: string;
  street: SolveStreet;
  board: string;
  heroPos: string;
  villainPos: string;
  heroRange: string;
  villainRange: string;
  potBb: number;
  effStackBb: number;
  betTree: Scenario["betTree"];
  rake: Scenario["rake"];
  accuracyTargetPctPot: number;
  maxIterations: number;
  /** Everything that affects the answer. Resume compares this. */
  inputHash: string;
}

/** One specific two-card holding and what the solver does with it. */
export interface ComboStrategy {
  /** "AhKh" — specific cards, not a hand key. */
  combo: string;
  frequencies: Record<string, number>;
  evs: Record<string, number>;
}

export type StopReason = "exploitability" | "iteration-cap";

export interface SolveResult {
  jobId: string;
  inputHash: string;
  /** The real commit of the solver binary that produced this. */
  solverCommit: string;
  /** As a percentage of the pot. Lower is better. */
  exploitability: number;
  iterations: number;
  /**
   * Which bound stopped the solve. `iteration-cap` means it never reached the
   * accuracy target and the result is NOT trustworthy.
   */
  stopReason: StopReason;
  wallMs: number;
  memoryHighWaterMb: number;
  actions: string[];
  hero: ComboStrategy[];
}

export interface SolverRunner {
  /**
   * Returns a PARSED result. Implementations that talk to a real solver own
   * the parsing; test doubles return a result directly and therefore never
   * exercise the parser, which is exactly what we want — a stub that produced
   * raw text would only be testing the format we guessed.
   */
  solve(job: SolveJob): Promise<SolveResult>;
  readonly solverCommit: string;
}

export interface ManifestEntry {
  jobId: string;
  scenarioId: string;
  board: string;
  inputHash: string;
  exploitability: number;
  iterations: number;
  stopReason: StopReason;
  wallMs: number;
  memoryHighWaterMb: number;
  /** True when the solve stopped on the iteration cap without converging. */
  suspect: boolean;
}

export interface Manifest {
  solverCommit: string;
  startedAt: string;
  finishedAt: string;
  totalJobs: number;
  completed: number;
  skipped: number;
  failed: number;
  suspect: number;
  entries: ManifestEntry[];
}
