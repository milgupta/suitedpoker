/**
 * Which solution nodes are allowed to reach a paying user.
 *
 * The set on disk is authored approximation, not solver output, and it is not
 * uniformly good. Some of it is a defensible teaching chart; some of it is a
 * template that was copied across pairings it does not describe. Drilling
 * somebody on the second kind and charging them for it is the single fastest
 * way to lose a numerate audience, because they will find it before we do.
 *
 * The files stay on disk. Quarantine is a serving decision, not a deletion:
 * `/methodology` still counts the whole set, and the deferred solver work in
 * `tools/solver` still has something to replace. Only the generator is narrowed.
 *
 * A quarantine carries a WRITTEN REASON. "We were not sure" is not a reason a
 * later reader can act on, and an allowlist nobody can audit becomes permanent
 * by default.
 */

export type NodeStatus = "servable" | "quarantined";

export interface QuarantinedNode {
  /** `${heroPos}:${actionSeq}` — the same ref the generator filters on. */
  readonly ref: string;
  readonly reason: string;
}

/**
 * Every 4bet node shares ONE strategy file.
 *
 * A 4bet from UTG and a 4bet from the cutoff are different situations by a wide
 * margin — the ranges behind them barely overlap — and the data answers both
 * identically. That is not an approximation, it is a claim the set cannot
 * support, on the largest pot the preflop tree contains.
 */
const VS_4BET_SHARED_TEMPLATE =
  "All 8 vs_4bet nodes are byte-identical, so the 4bettor's position does not " +
  "change the answer. Facing a 4bet is the biggest preflop pot in the tree and " +
  "the one where the opponent's range matters most.";

/**
 * The 3bet tree collapses into two templates.
 *
 * One representative of each is kept so the curriculum's 3bet lesson still has
 * something to drill, chosen to be the pairing the template actually describes:
 * `CO:vs_3bet_BB` for a blind 3bettor and `CO:vs_3bet_BTN` for a cold 3bet from
 * in position — which is the exact hand the lesson opens with.
 */
const VS_3BET_BLIND_TEMPLATE =
  "Byte-identical to CO:vs_3bet_BB. Hero's opening range runs from ~14% at UTG " +
  "to ~48% on the button, and how much of it can continue changes with it, so " +
  "one file cannot serve four opening positions.";

const VS_3BET_IP_TEMPLATE =
  "Byte-identical to CO:vs_3bet_BTN. A cold 3bet from the button and one from " +
  "the cutoff come from different ranges, and the opener's own width differs " +
  "again on top of that.";

export const QUARANTINED_NODES: readonly QuarantinedNode[] = [
  { ref: "BB:vs_4bet_BTN", reason: VS_4BET_SHARED_TEMPLATE },
  { ref: "BB:vs_4bet_CO", reason: VS_4BET_SHARED_TEMPLATE },
  { ref: "BB:vs_4bet_UTG", reason: VS_4BET_SHARED_TEMPLATE },
  { ref: "BTN:vs_4bet_CO", reason: VS_4BET_SHARED_TEMPLATE },
  { ref: "BTN:vs_4bet_UTG", reason: VS_4BET_SHARED_TEMPLATE },
  { ref: "CO:vs_4bet_UTG", reason: VS_4BET_SHARED_TEMPLATE },
  { ref: "SB:vs_4bet_BTN", reason: VS_4BET_SHARED_TEMPLATE },
  { ref: "SB:vs_4bet_CO", reason: VS_4BET_SHARED_TEMPLATE },

  { ref: "BTN:vs_3bet_BB", reason: VS_3BET_BLIND_TEMPLATE },
  { ref: "BTN:vs_3bet_SB", reason: VS_3BET_BLIND_TEMPLATE },
  { ref: "CO:vs_3bet_SB", reason: VS_3BET_BLIND_TEMPLATE },
  { ref: "MP:vs_3bet_BB", reason: VS_3BET_BLIND_TEMPLATE },
  { ref: "MP:vs_3bet_SB", reason: VS_3BET_BLIND_TEMPLATE },
  { ref: "UTG:vs_3bet_BB", reason: VS_3BET_BLIND_TEMPLATE },
  { ref: "UTG:vs_3bet_SB", reason: VS_3BET_BLIND_TEMPLATE },

  { ref: "MP:vs_3bet_BTN", reason: VS_3BET_IP_TEMPLATE },
  { ref: "MP:vs_3bet_CO", reason: VS_3BET_IP_TEMPLATE },
  { ref: "UTG:vs_3bet_BTN", reason: VS_3BET_IP_TEMPLATE },
  { ref: "UTG:vs_3bet_CO", reason: VS_3BET_IP_TEMPLATE },
];

const BY_REF = new Map(QUARANTINED_NODES.map((node) => [node.ref, node.reason]));

export function nodeStatusOf(ref: string): NodeStatus {
  return BY_REF.has(ref) ? "quarantined" : "servable";
}

export function isServableNode(ref: string): boolean {
  return !BY_REF.has(ref);
}

/** The written reason, or null when the node is served. */
export function quarantineReason(ref: string): string | null {
  return BY_REF.get(ref) ?? null;
}
