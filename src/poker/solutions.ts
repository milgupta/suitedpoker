/**
 * The solution data model — the precomputed GTO source of truth.
 *
 * Pure TypeScript. Nothing here reads a file or a database; the loader takes
 * already-parsed JSON and the query helpers take an already-loaded node. The
 * importer in scripts/ does the I/O and hands the results in.
 *
 * PROVENANCE is required on every node and is the honest part of this file.
 * The preflop set shipped with 2.4 is an `authored-approximation` — ranges
 * derived from published solver-derived charts, with frequencies and EVs built
 * from an indifference model rather than read out of a solver. 2.8–2.10 replace
 * the same files with `solver-verified` data. That swap must be a DATA change:
 * nothing in this module branches on the provenance value, and no code path
 * assumes either one. The only thing provenance drives is what the UI is
 * allowed to claim and where a reviewer should spend their time.
 */

import { z } from "zod";

import { HAND_KEYS, type HandKey, isHandKey } from "./range";

export const PREFLOP_ACTIONS = ["fold", "call", "raise", "allin"] as const;
export type PreflopActionName = (typeof PREFLOP_ACTIONS)[number];

export const HERO_POSITIONS = ["UTG", "MP", "CO", "BTN", "SB", "BB"] as const;
export type HeroPosition = (typeof HERO_POSITIONS)[number];

/**
 * `raise` means the aggressive action available AT THIS NODE — an open at an
 * `rfi` node, a 3bet at a `vs_rfi_*` node, a 4bet at a `vs_3bet_*` node. The UI
 * labels it from `actionSeq`. Four action names rather than a name per street
 * keeps the drill's action bar to three buttons, which is the whole beginner UX.
 */
export const PROVENANCE_VALUES = ["authored-approximation", "solver-verified"] as const;
export type Provenance = (typeof PROVENANCE_VALUES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

const actionNameSchema = z.enum(PREFLOP_ACTIONS);

const frequencyMapSchema = z.record(z.string(), z.number());

/**
 * Split three ways on purpose. "This node is approximate" is useless to a
 * reviewer; "the range shape is solid but the 4bet-bluff frequencies are a
 * guess" tells them exactly which twenty numbers to look at.
 */
const confidenceSchema = z.object({
  rangeShape: z.enum(CONFIDENCE_LEVELS),
  frequencies: z.enum(CONFIDENCE_LEVELS),
  ev: z.enum(CONFIDENCE_LEVELS),
  note: z.string().min(20),
});

export type NodeConfidence = z.infer<typeof confidenceSchema>;

export const preflopNodeSchema = z
  .object({
    solutionSet: z.string().min(1),
    provenance: z.enum(PROVENANCE_VALUES, {
      error: "provenance is required and must be 'authored-approximation' or 'solver-verified'",
    }),
    heroPos: z.enum(HERO_POSITIONS),
    actionSeq: z.string().min(1),
    potBb: z.number().nonnegative(),
    effStackBb: z.number().positive(),
    /** Every action a hero can take here. `ev` must cover all of them. */
    actions: z.array(actionNameSchema).min(2),
    strategy: z.record(z.string(), frequencyMapSchema),
    ev: z.record(z.string(), frequencyMapSchema),
    confidence: confidenceSchema,
    notes: z.string().optional(),
  })
  .superRefine((node, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });

    const actionSet = new Set<string>(node.actions);
    if (actionSet.size !== node.actions.length) fail(`duplicate action in actions[]`);

    for (const handKey of HAND_KEYS) {
      const strategy = node.strategy[handKey];
      if (strategy === undefined) {
        fail(`${handKey}: missing from strategy — all 169 hands are required`);
        continue;
      }
      const ev = node.ev[handKey];
      if (ev === undefined) {
        fail(`${handKey}: missing from ev — all 169 hands are required`);
        continue;
      }

      let sum = 0;
      for (const [action, frequency] of Object.entries(strategy)) {
        if (!actionSet.has(action)) {
          fail(`${handKey}: strategy names "${action}", which is not in actions[]`);
        }
        if (frequency < 0 || frequency > 1) {
          fail(`${handKey}: frequency for "${action}" is ${frequency}, must be in [0,1]`);
        }
        if (ev[action] === undefined) {
          fail(`${handKey}: "${action}" appears in strategy but not in ev`);
        }
        sum += frequency;
      }
      if (Math.abs(sum - 1) > 0.001) {
        fail(`${handKey}: frequencies sum to ${sum.toFixed(4)}, must be 1.0 ±0.001`);
      }

      // Grading needs an EV for every action the user COULD take, not only the
      // ones the solution plays. Without it, evLoss on a wrong action is
      // undefined and the grader silently scores it zero.
      for (const action of node.actions) {
        if (ev[action] === undefined) {
          fail(`${handKey}: ev is missing "${action}", which is in actions[]`);
        }
      }
    }

    for (const handKey of Object.keys(node.strategy)) {
      if (!isHandKey(handKey)) fail(`strategy has "${handKey}", which is not one of the 169 hands`);
    }
    for (const handKey of Object.keys(node.ev)) {
      if (!isHandKey(handKey)) fail(`ev has "${handKey}", which is not one of the 169 hands`);
    }
  });

export type PreflopNodeFile = z.infer<typeof preflopNodeSchema>;

export interface PreflopNode extends PreflopNodeFile {
  /** `UTG:rfi`, `BB:vs_rfi_BTN` — stable, and the key the drill layer uses. */
  readonly ref: string;
}

export function nodeRefOf(heroPos: HeroPosition, actionSeq: string): string {
  return `${heroPos}:${actionSeq}`;
}

/** Throws a SyntaxError naming the exact hand and rule that failed. */
export function parsePreflopNode(input: unknown, source = "<inline>"): PreflopNode {
  const result = preflopNodeSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new SyntaxError(`${source} is not a valid preflop node:\n${issues}`);
  }
  return { ...result.data, ref: nodeRefOf(result.data.heroPos, result.data.actionSeq) };
}

export interface NodeValidationResult {
  ok: boolean;
  source: string;
  ref?: string;
  errors: string[];
}

/** Never throws — the importer needs to report every bad file, not just the first. */
export function validatePreflopNode(input: unknown, source: string): NodeValidationResult {
  const result = preflopNodeSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      source,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  return {
    ok: true,
    source,
    ref: nodeRefOf(result.data.heroPos, result.data.actionSeq),
    errors: [],
  };
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export function getStrategy(
  node: PreflopNode,
  handKey: HandKey,
): Readonly<Partial<Record<PreflopActionName, number>>> {
  const strategy = node.strategy[handKey];
  if (strategy === undefined) throw new RangeError(`${node.ref} has no strategy for ${handKey}`);
  return strategy as Partial<Record<PreflopActionName, number>>;
}

export function getEv(
  node: PreflopNode,
  handKey: HandKey,
): Readonly<Partial<Record<PreflopActionName, number>>> {
  const ev = node.ev[handKey];
  if (ev === undefined) throw new RangeError(`${node.ref} has no ev for ${handKey}`);
  return ev as Partial<Record<PreflopActionName, number>>;
}

export function frequencyOf(
  node: PreflopNode,
  handKey: HandKey,
  action: PreflopActionName,
): number {
  return getStrategy(node, handKey)[action] ?? 0;
}

export function evOf(node: PreflopNode, handKey: HandKey, action: PreflopActionName): number {
  const ev = getEv(node, handKey)[action];
  if (ev === undefined) {
    throw new RangeError(`${node.ref} has no ev for ${handKey} / ${action}`);
  }
  return ev;
}

/**
 * Highest EV, ties broken by frequency then by the canonical action order, so
 * the same node always names the same best action.
 */
export function bestAction(node: PreflopNode, handKey: HandKey): PreflopActionName {
  let best: PreflopActionName | undefined;
  let bestEv = -Infinity;
  let bestFrequency = -1;
  for (const action of PREFLOP_ACTIONS) {
    if (!node.actions.includes(action)) continue;
    const ev = evOf(node, handKey, action);
    const frequency = frequencyOf(node, handKey, action);
    if (ev > bestEv || (ev === bestEv && frequency > bestFrequency)) {
      best = action;
      bestEv = ev;
      bestFrequency = frequency;
    }
  }
  if (best === undefined) throw new RangeError(`${node.ref} has no actions`);
  return best;
}

/** Always >= 0. A negative EV loss means the EV table is inconsistent. */
export function evLoss(
  node: PreflopNode,
  handKey: HandKey,
  chosenAction: PreflopActionName,
): number {
  const best = evOf(node, handKey, bestAction(node, handKey));
  const chosen = evOf(node, handKey, chosenAction);
  return Math.max(0, best - chosen);
}

export function provenanceOf(node: PreflopNode): Provenance {
  return node.provenance;
}

// ── Solution index ────────────────────────────────────────────────────────────

export interface SolutionIndex {
  readonly nodes: ReadonlyMap<string, PreflopNode>;
  readonly refs: readonly string[];
  /** The weakest provenance across the set — what the UI is allowed to claim. */
  readonly provenance: Provenance;
}

export function buildSolutionIndex(nodes: readonly PreflopNode[]): SolutionIndex {
  const map = new Map<string, PreflopNode>();
  for (const node of nodes) {
    if (map.has(node.ref)) throw new Error(`duplicate node ref: ${node.ref}`);
    map.set(node.ref, node);
  }
  const everySolverVerified =
    nodes.length > 0 && nodes.every((n) => n.provenance === "solver-verified");
  return {
    nodes: map,
    refs: [...map.keys()].sort(),
    provenance: everySolverVerified ? "solver-verified" : "authored-approximation",
  };
}

export function getNode(index: SolutionIndex, ref: string): PreflopNode {
  const node = index.nodes.get(ref);
  if (node === undefined) throw new RangeError(`no solution node for ${ref}`);
  return node;
}

// ── Review risk ───────────────────────────────────────────────────────────────

const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 };

export interface ReviewRisk {
  ref: string;
  score: number;
  drivers: string[];
}

/**
 * Ranks nodes by how much a human reviewer should distrust them. Weighted
 * toward range shape, because a wrong range teaches a wrong fold every time the
 * node is drilled, whereas a slightly wrong EV only misprices the feedback.
 */
export function reviewRisk(node: PreflopNode): ReviewRisk {
  const { rangeShape, frequencies, ev } = node.confidence;
  const drivers: string[] = [];
  if (rangeShape !== "high") drivers.push(`range shape ${rangeShape}`);
  if (frequencies !== "high") drivers.push(`frequencies ${frequencies}`);
  if (ev !== "high") drivers.push(`ev ${ev}`);
  if (node.provenance === "authored-approximation") drivers.push("not solver-verified");

  const score =
    CONFIDENCE_WEIGHT[rangeShape] * 3 +
    CONFIDENCE_WEIGHT[frequencies] * 2 +
    CONFIDENCE_WEIGHT[ev] * 1 +
    (node.provenance === "authored-approximation" ? 1 : 0);

  return { ref: node.ref, score, drivers };
}

export function rankByReviewRisk(nodes: readonly PreflopNode[]): ReviewRisk[] {
  return nodes.map(reviewRisk).sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
}

// ── Postflop templates ────────────────────────────────────────────────────────

/**
 * Postflop strategy is stored over HAND CLASSES within curated scenario
 * templates, not as a solver tree. That is a deliberate simplification and the
 * UI is required to label it as one — see PROVENANCE above, which applies here
 * identically.
 */
export const POSTFLOP_ACTIONS = [
  "check",
  "bet_33",
  "bet_66",
  "bet_100",
  "fold",
  "call",
  "raise_small",
  "raise_pot",
  "allin",
] as const;

export type PostflopActionName = (typeof POSTFLOP_ACTIONS)[number];

export const STREETS = ["flop", "turn", "river"] as const;
export type Street = (typeof STREETS)[number];

const postflopStrategySchema = z.object({
  handClass: z.string().min(1),
  strategy: z.record(z.string(), z.number()),
  ev: z.record(z.string(), z.number()),
  rationale: z.string().min(20),
});

export const postflopTemplateSchema = z
  .object({
    id: z.string().min(1),
    solutionSet: z.string().min(1),
    provenance: z.enum(PROVENANCE_VALUES, {
      error: "provenance is required and must be 'authored-approximation' or 'solver-verified'",
    }),
    label: z.string().min(1),
    street: z.enum(STREETS),
    heroPos: z.enum(HERO_POSITIONS),
    villainPos: z.enum(HERO_POSITIONS),
    potBb: z.number().positive(),
    effStackBb: z.number().positive(),
    heroRange: z.string().min(1),
    villainRange: z.string().min(1),
    boardTags: z.array(z.string()).min(1),
    exampleBoards: z.array(z.string()).min(3).max(5),
    actionHistory: z.array(z.string()),
    actions: z.array(z.enum(POSTFLOP_ACTIONS)).min(2),
    confidence: confidenceSchema,
    strategies: z.array(postflopStrategySchema).min(1),
  })
  .superRefine((template, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const actionSet = new Set<string>(template.actions);
    const seen = new Set<string>();

    for (const entry of template.strategies) {
      if (seen.has(entry.handClass)) fail(`${entry.handClass}: appears twice`);
      seen.add(entry.handClass);

      let sum = 0;
      for (const [action, frequency] of Object.entries(entry.strategy)) {
        if (!actionSet.has(action)) {
          fail(`${entry.handClass}: strategy names "${action}", which is not in actions[]`);
        }
        if (frequency < 0 || frequency > 1) {
          fail(`${entry.handClass}: frequency for "${action}" is ${frequency}, must be in [0,1]`);
        }
        if (entry.ev[action] === undefined) {
          fail(`${entry.handClass}: "${action}" appears in strategy but not in ev`);
        }
        sum += frequency;
      }
      if (Math.abs(sum - 1) > 0.001) {
        fail(`${entry.handClass}: frequencies sum to ${sum.toFixed(4)}, must be 1.0 ±0.001`);
      }
      for (const action of template.actions) {
        if (entry.ev[action] === undefined) {
          fail(`${entry.handClass}: ev is missing "${action}", which is in actions[]`);
        }
      }
    }
  });

export type PostflopTemplateFile = z.infer<typeof postflopTemplateSchema>;

export interface PostflopTemplate extends PostflopTemplateFile {
  readonly ref: string;
}

export function parsePostflopTemplate(input: unknown, source = "<inline>"): PostflopTemplate {
  const result = postflopTemplateSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new SyntaxError(`${source} is not a valid postflop template:\n${issues}`);
  }
  return { ...result.data, ref: result.data.id };
}

export function validatePostflopTemplate(input: unknown, source: string): NodeValidationResult {
  const result = postflopTemplateSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      source,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, source, ref: result.data.id, errors: [] };
}

export function getPostflopStrategy(
  template: PostflopTemplate,
  handClass: string,
): PostflopTemplateFile["strategies"][number] | undefined {
  return template.strategies.find((s) => s.handClass === handClass);
}

export function postflopBestAction(
  template: PostflopTemplate,
  handClass: string,
): PostflopActionName {
  const entry = getPostflopStrategy(template, handClass);
  if (entry === undefined) throw new RangeError(`${template.ref} has no strategy for ${handClass}`);
  let best: PostflopActionName | undefined;
  let bestEv = -Infinity;
  let bestFrequency = -1;
  for (const action of POSTFLOP_ACTIONS) {
    if (!template.actions.includes(action)) continue;
    const ev = entry.ev[action];
    if (ev === undefined) continue;
    const frequency = entry.strategy[action] ?? 0;
    if (ev > bestEv || (ev === bestEv && frequency > bestFrequency)) {
      best = action;
      bestEv = ev;
      bestFrequency = frequency;
    }
  }
  if (best === undefined) throw new RangeError(`${template.ref} has no actions`);
  return best;
}

export function postflopEvLoss(
  template: PostflopTemplate,
  handClass: string,
  chosenAction: PostflopActionName,
): number {
  const entry = getPostflopStrategy(template, handClass);
  if (entry === undefined) throw new RangeError(`${template.ref} has no strategy for ${handClass}`);
  const best = entry.ev[postflopBestAction(template, handClass)];
  const chosen = entry.ev[chosenAction];
  if (best === undefined || chosen === undefined) {
    throw new RangeError(`${template.ref} / ${handClass} has no ev for ${chosenAction}`);
  }
  return Math.max(0, best - chosen);
}
