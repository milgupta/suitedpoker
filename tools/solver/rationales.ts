/**
 * Rationale drafting.
 *
 * Same rule as the runtime coach, and it is not negotiable: the model EXPLAINS
 * ground truth, it never determines it. It is handed the computed numbers and
 * asked to put them in a sentence. If the sentence it returns names a
 * different action than the one the numbers name, that is a bug in the output
 * and it is regenerated once, then rejected.
 *
 * Every drafted rationale is marked `reviewed: false`. 2.10 flips that.
 */

import { type BucketRow } from "./bucket";

export interface RationaleContext {
  handClass: string;
  board: string;
  street: string;
  heroPos: string;
  villainPos: string;
  potBb: number;
  strategy: Record<string, number>;
  ev: Record<string, number>;
  topAction: string;
  comboCount: number;
  topActionStdDev: number;
}

export interface RationaleClient {
  /** Returns prose only. Never asked for, and never trusted for, numbers. */
  draft(prompt: string): Promise<string>;
  readonly name: string;
}

export interface Rationale {
  text: string;
  reviewed: boolean;
  /** Which generator produced it, for the manifest. */
  source: string;
  /** True when the model contradicted the numbers and the fallback was used. */
  fellBack: boolean;
}

export function contextFrom(
  row: BucketRow,
  spot: Omit<RationaleContext, keyof BucketRowFields>,
): RationaleContext {
  return {
    ...spot,
    handClass: row.handClass,
    strategy: row.strategy,
    ev: row.ev,
    topAction: row.topAction,
    comboCount: row.comboCount,
    topActionStdDev: row.topActionStdDev,
  };
}

type BucketRowFields = {
  handClass: string;
  strategy: Record<string, number>;
  ev: Record<string, number>;
  topAction: string;
  comboCount: number;
  topActionStdDev: number;
};

export function buildPrompt(context: RationaleContext): string {
  const mix = Object.entries(context.strategy)
    .filter(([, frequency]) => frequency > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([action, frequency]) => `${action} ${(frequency * 100).toFixed(0)}%`)
    .join(", ");

  return [
    `You are writing one or two sentences of plain English for a poker beginner.`,
    ``,
    `Spot: ${context.heroPos} versus ${context.villainPos}, ${context.street}, pot ${context.potBb}bb.`,
    `Board: ${context.board}`,
    `Hand class: ${context.handClass}`,
    `Solver strategy: ${mix}`,
    `Most frequent action: ${context.topAction}`,
    ``,
    `Explain WHY that strategy makes sense. Rules:`,
    `- Do not state any number other than the ones given above.`,
    `- Name "${context.topAction}" as the main action. Do not name a different one.`,
    `- No jargon a beginner would not know.`,
    `- One or two sentences. No preamble.`,
  ].join("\n");
}

/**
 * A deterministic rationale built only from the numbers.
 *
 * Not a placeholder to be replaced later — it is the floor. It can never
 * contradict the data because it is generated from it, so a missing API key,
 * a rate limit or a model that ignores its instructions degrades to something
 * correct rather than to something wrong.
 */
export function deterministicRationale(context: RationaleContext): string {
  const sorted = Object.entries(context.strategy)
    .filter(([, frequency]) => frequency > 0)
    .sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  const topPct = Math.round((top?.[1] ?? 0) * 100);

  const readable = (action: string) =>
    action.startsWith("bet_")
      ? `bet ${action.slice(4)}% of the pot`
      : action.startsWith("raise_")
        ? `raise ${action.slice(6)}`
        : action;

  const opening =
    topPct >= 95
      ? `Always ${readable(top?.[0] ?? "check")} here`
      : `${readable(top?.[0] ?? "check")} about ${topPct}% of the time`;

  const balance =
    second !== undefined
      ? `, and ${readable(second[0])} the rest — both are part of one balanced strategy, not a right and a wrong answer.`
      : `.`;

  const caveat =
    context.topActionStdDev > 0.15
      ? ` Note that the solver treats hands inside this class quite differently, so this average is a rough guide.`
      : ``;

  return `${opening} with ${context.handClass.replace(/_/g, " ")} on ${context.board}${balance}${caveat}`;
}

const ACTION_VOCABULARY = ["check", "bet", "fold", "call", "raise", "all-in", "allin"] as const;

function spokenForm(action: string): string {
  if (action.startsWith("bet_")) return "bet";
  if (action.startsWith("raise_")) return "raise";
  return action;
}

/** Does the prose name an action other than the computed best one? */
export function contradictsNumbers(text: string, context: RationaleContext): boolean {
  const lower = text.toLowerCase();
  const named = Object.keys(context.strategy).filter((action) =>
    lower.includes(spokenForm(action)),
  );
  if (named.length === 0) return true;

  const topSpoken = spokenForm(context.topAction);
  if (!lower.includes(topSpoken)) return true;

  const supported = new Set<string>();
  for (const [action, frequency] of Object.entries(context.strategy)) {
    if ((frequency ?? 0) <= 0) continue;
    supported.add(spokenForm(action));
  }

  // An action this node offers but never takes, named anywhere: a real
  // contradiction of the data.
  for (const action of Object.keys(context.strategy)) {
    const spoken = spokenForm(action);
    if (supported.has(spoken) || spoken === topSpoken) continue;
    if (new RegExp(`\\b${spoken}\\b`, "i").test(lower)) return true;
  }

  // An action the node does not offer at all, but ONLY when it reads as a
  // recommendation. Flagging every mention was tried and rejected: it threw
  // out "most of their range can still call", which describes the OPPONENT.
  // A false positive here is not harmless — it silently downgrades good prose
  // to the deterministic fallback, so the narrower test is the right trade.
  for (const word of ACTION_VOCABULARY) {
    if (supported.has(word)) continue;
    if (
      new RegExp(
        `\\b(?:or|and|instead of|rather than)\\s+(?:you\\s+(?:can|should)\\s+)?${word}\\b`,
        "i",
      ).test(lower)
    ) {
      return true;
    }
    if (new RegExp(`(?:^|[.!?]\\s+)${word}\\b`, "i").test(text.trim())) return true;
  }
  return false;
}

/**
 * Drafts one rationale. Tries the model, checks it against the numbers,
 * regenerates once, then falls back to the deterministic version rather than
 * shipping prose that argues with its own data.
 */
export async function draftRationale(
  context: RationaleContext,
  client?: RationaleClient,
): Promise<Rationale> {
  if (client === undefined) {
    return {
      text: deterministicRationale(context),
      reviewed: false,
      source: "deterministic",
      fellBack: false,
    };
  }

  const prompt = buildPrompt(context);
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      text = (await client.draft(prompt)).trim();
    } catch {
      break;
    }
    if (text.length >= 20 && !contradictsNumbers(text, context)) {
      return { text, reviewed: false, source: client.name, fellBack: false };
    }
  }

  return {
    text: deterministicRationale(context),
    reviewed: false,
    source: "deterministic",
    fellBack: true,
  };
}

export async function draftAll(
  rows: readonly BucketRow[],
  spot: Omit<RationaleContext, keyof BucketRowFields>,
  client?: RationaleClient,
): Promise<Map<string, Rationale>> {
  const out = new Map<string, Rationale>();
  for (const row of rows) {
    out.set(row.handClass, await draftRationale(contextFrom(row, spot), client));
  }
  return out;
}
