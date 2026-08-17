/**
 * Variable raise sizing on the preflop tree.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * Every preflop node was authored against exactly ONE price. An open was always
 * 5 chips, a 3bet always 22, a 4bet always 44 — hardcoded constants in the
 * generator. So a player could drill the whole product to exhaustion and never
 * once be asked the single most common question in real poker: *this raise is
 * bigger than the last one, does that change my answer?*
 *
 * It does, and it is the most transferable thing a beginner can learn preflop.
 * A big blind defends about 40% against a 2.5x open and closer to 30% against a
 * 3.5x. That is a bigger swing than most of the distinctions the product
 * already teaches by position.
 *
 * ── EVERY SIZE IS A WHOLE NUMBER OF CHIPS ────────────────────────────────────
 *
 * The product states amounts in the engine's own chip (2 per big blind, see
 * `src/lib/units.ts`), so 5 / 6 / 7 chips ARE 2.5 / 3 / 3.5 big blinds with
 * nothing rounded and no poker changed. Nothing on screen ever shows a decimal,
 * and no sizing here needs one.
 *
 * ── WHY THE STRATEGY IS ADJUSTED RATHER THAN RE-AUTHORED ─────────────────────
 *
 * Authoring 15 vs-open nodes × 3 sizes by hand would be 45 range specs nobody
 * could audit, and the honest confidence in the extra 30 would be far below the
 * 15 that exist. Instead ONE effect is modelled — a higher price means a
 * narrower defence — and it is applied where it belongs: to the boundary of the
 * range, never to the top of it.
 *
 * That targeting is the load-bearing part, and it takes TWO weights, because
 * one was not enough to cover the whole tree:
 *
 * - `resistance`, from the hand's own EV. Under the indifference rule that is
 *   exactly zero for a hand on the boundary and several big blinds for a
 *   premium, so the hands that give way first are the ones that were closest
 *   to folding anyway.
 * - `widthFactor`, from the node's whole range. EV is relative WITHIN a node,
 *   so the bottom of a 4bet-calling range scores the same as the bottom of a
 *   blind defence — and one of those bottoms is AKo. A range with no marginal
 *   tail has nothing to shed.
 *
 * Measured result: the big blind's defence against a button open goes 40.4% →
 * 31.4% across 2.5x → 3.5x, and a 4bet node moves 3% with AA, KK and QQ
 * untouched to three decimal places.
 */

import { deriveIndifferentEv } from "./refine";
import { comboCountOf, HAND_KEYS, type HandKey } from "./range";
import { evOf, getStrategy, type PreflopNode } from "./solutions";
import { CHIPS_PER_BB } from "@/lib/units";

/** The price a node's strategy was authored against, per action family. */
export const BASELINE_OPEN_CHIPS = 5;
export const BASELINE_THREE_BET_CHIPS = 22;
export const BASELINE_FOUR_BET_CHIPS = 44;

/**
 * The sizes hero may face, in whole chips.
 *
 * The baseline is FIRST in each list and is what an unsized spot uses, so a
 * caller that ignores sizing entirely gets exactly the behaviour that existed
 * before this module.
 */
export const OPEN_SIZES: readonly number[] = [5, 6, 7];
export const THREE_BET_SIZES: readonly number[] = [22, 26, 30];
export const FOUR_BET_SIZES: readonly number[] = [44, 52, 60];

export type SizingFamily = "rfi" | "vs_rfi" | "vs_3bet" | "vs_4bet";

export function sizingFamilyOf(actionSeq: string): SizingFamily {
  if (actionSeq.startsWith("vs_rfi_")) return "vs_rfi";
  if (actionSeq.startsWith("vs_3bet_")) return "vs_3bet";
  if (actionSeq.startsWith("vs_4bet_")) return "vs_4bet";
  return "rfi";
}

/**
 * The sizes available at a node.
 *
 * An `rfi` node has none: hero is first in, so there is no raise in front to
 * vary. Hero's OWN open size is a different question — it barely moves an
 * opening range, and offering it as a drill would teach a distinction that is
 * not there.
 */
export function sizesFor(actionSeq: string): readonly number[] {
  switch (sizingFamilyOf(actionSeq)) {
    case "vs_rfi":
      return OPEN_SIZES;
    case "vs_3bet":
      return THREE_BET_SIZES;
    case "vs_4bet":
      return FOUR_BET_SIZES;
    case "rfi":
      return [];
  }
}

export function baselineFor(actionSeq: string): number {
  switch (sizingFamilyOf(actionSeq)) {
    case "vs_rfi":
      return BASELINE_OPEN_CHIPS;
    case "vs_3bet":
      return BASELINE_THREE_BET_CHIPS;
    case "vs_4bet":
      return BASELINE_FOUR_BET_CHIPS;
    case "rfi":
      return 0;
  }
}

/**
 * How much narrower the defence gets, per unit of RELATIVE price increase.
 *
 * Relative, not absolute, and the difference is not cosmetic. The first version
 * scaled on extra big blinds, which is right for an open (2.5 → 3.5 is one big
 * blind) and badly wrong for a 4bet (22 → 30 is eight). At a per-big-blind rate
 * a larger 4bet narrowed the range by the full cap and started folding queens —
 * a hand that is at the TOP of a 4bet-calling range and does not get worse
 * because the raise got bigger.
 *
 * What actually governs a defence is the price as a fraction of what it was:
 * a 2.5x open going to 3.5x and a 22bb 4bet going to 30bb are both roughly a
 * 40% increase, and they narrow a range by roughly the same proportion.
 *
 * Calibrated against the published spread, with the width factor below in
 * play: a big blind defending a button open measures 40.4% at 2.5x and 31.4%
 * at 3.5x, against a published ~40% and ~30%.
 */
const NARROWING_PER_RATIO = 1.4;
const MAX_NARROWING = 0.5;

/**
 * A defending range only narrows as far as it has marginal hands to shed.
 *
 * This is the correction that makes one model work across the whole tree. The
 * derived value scale is RELATIVE WITHIN A NODE, so the bottom of the range
 * scores about 0.1 whether that bottom is `96s` defending a blind or `AKo`
 * calling a 4bet. Resistance alone therefore treated them identically, and a
 * larger 4bet started folding AKo 20% of the time.
 *
 * The thing that actually differs is the range itself. The big blind defends
 * 40% of all hands against an open, and most of that is a long marginal tail
 * that a price rise trims — which is exactly why the published defence drops
 * from ~40% to ~30%. A 4bet-calling range is 3% of hands and all of it is
 * premiums; there is no tail, so it barely moves however the raise is sized.
 *
 * Measured from the node rather than assumed from its name, so a future node
 * gets the right treatment without being added to a list.
 */
const FULL_TAIL_WIDTH = 0.25;

const WIDTH_FACTORS = new WeakMap<PreflopNode, number>();

function widthFactor(node: PreflopNode): number {
  const cached = WIDTH_FACTORS.get(node);
  if (cached !== undefined) return cached;

  let combos = 0;
  let total = 0;
  for (const key of HAND_KEYS) {
    const count = comboCountOf(key);
    total += count;
    combos += count * (1 - (node.strategy[key]?.fold ?? 0));
  }
  const factor = Math.min(1, total === 0 ? 0 : combos / total / FULL_TAIL_WIDTH);
  WIDTH_FACTORS.set(node, factor);
  return factor;
}

/**
 * How strongly a hand resists narrowing, from what it is worth.
 *
 * Under the indifference rule a boundary hand is worth exactly 0 and gives way
 * completely; a hand worth 3bb keeps ~94% of its continue frequency. This is
 * the whole reason the adjustment can be applied blind across 169 hands without
 * ever telling somebody to fold aces.
 */
function resistance(value: number): number {
  return 1 / (1 + Math.max(0, value) ** 2 * RESISTANCE_CURVE);
}

/**
 * How sharply resistance rises with what a hand is worth.
 *
 * SQUARED, not linear, and the exponent is the whole design. Linear gave a
 * curve too shallow at both ends at once: a larger 4bet folded AKs 9% of the
 * time (no chart at 100bb says that), while a larger OPEN moved the big
 * blind's defence only 40.4% → 38.2% against a published spread of roughly
 * 40% → 30%. Damping the top of the range by a flat factor fixed the first and
 * made the second worse, because most of a wide defending range is pure calls
 * too.
 *
 * The two ends need different treatment, which is what a squared term gives:
 * a hand worth a tenth of a big blind keeps ~100% of the narrowing, a hand
 * worth two big blinds keeps ~6%, and a premium keeps essentially none.
 */
const RESISTANCE_CURVE = 4;

/**
 * What a hand that has been priced out entirely now loses by continuing.
 *
 * It was indifferent at the baseline, so at a higher price it is behind by
 * something on the order of the extra it is being asked to pay. Bounded low on
 * purpose: calling a 3.5x open with a hand that was a marginal call against
 * 2.5x is a small mistake, and grading it as a blunder would be a louder claim
 * than this model can support.
 */
const MAX_PRICED_OUT_LOSS = 0.4;

export interface SizedRow {
  strategy: Record<string, number>;
  ev: Record<string, number>;
}

/**
 * One hand's strategy and EV at a given price.
 *
 * `facingChips` equal to the node's baseline returns the authored row unchanged,
 * bit for bit — the no-sizing path must not drift just because this module is
 * in the call chain.
 */
export function sizedRow(node: PreflopNode, handKey: HandKey, facingChips: number): SizedRow {
  const actions = node.actions;
  const authoredStrategy = getStrategy(node, handKey);
  const strategy: Record<string, number> = {};
  for (const action of actions) strategy[action] = authoredStrategy[action] ?? 0;
  const authoredEv: Record<string, number> = {};
  for (const action of actions) authoredEv[action] = evOf(node, handKey, action);

  const baseline = baselineFor(node.actionSeq);
  const extraBb = baseline === 0 ? 0 : (facingChips - baseline) / CHIPS_PER_BB;
  if (extraBb <= 0) return { strategy, ev: authoredEv };

  const continues = actions.filter((a) => a !== "fold");
  const played = continues.filter((a) => (strategy[a] ?? 0) > 0);
  if (played.length === 0) return { strategy, ev: authoredEv };

  const value = Math.max(...played.map((a) => authoredEv[a] ?? 0));
  const priceRatio = facingChips / baseline - 1;
  const narrowing =
    Math.min(MAX_NARROWING, priceRatio * NARROWING_PER_RATIO) *
    resistance(value) *
    widthFactor(node);

  const continueFreq = played.reduce((sum, a) => sum + (strategy[a] ?? 0), 0);
  const kept = continueFreq * (1 - narrowing);
  const scale = continueFreq === 0 ? 0 : kept / continueFreq;

  const out: Record<string, number> = {};
  for (const action of actions) {
    out[action] = action === "fold" ? 0 : round2((strategy[action] ?? 0) * scale);
  }
  // Fold absorbs the whole remainder, so the row still sums to one.
  if (actions.includes("fold")) {
    const spent = continues.reduce((sum, a) => sum + (out[a] ?? 0), 0);
    out.fold = round2(Math.max(0, 1 - spent));
  }

  const stillPlayed = continues.filter((a) => (out[a] ?? 0) > 0);
  if (stillPlayed.length === 0) {
    // Priced out completely. It was worth zero at the old price; at the new one
    // continuing is a small, bounded loss rather than a free choice.
    const loss = -Math.min(MAX_PRICED_OUT_LOSS, extraBb * 0.4);
    const ev: Record<string, number> = {};
    for (const action of actions) {
      ev[action] = action === "fold" ? 0 : round2(Math.min(authoredEv[action] ?? loss, loss));
    }
    return { strategy: out, ev };
  }

  return {
    strategy: out,
    ev: deriveIndifferentEv(out, actions, authoredEv) as Record<string, number>,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The pot after a raise of `facingChips`, in big blinds. */
export function sizedPotBb(node: PreflopNode, facingChips: number): number {
  const baseline = baselineFor(node.actionSeq);
  if (baseline === 0) return node.potBb;
  return node.potBb + (facingChips - baseline) / CHIPS_PER_BB;
}
