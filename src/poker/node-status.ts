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
 * Remaining 4bet nodes still share one unrepaired strategy file.
 *
 * Four pairings were rewritten in `scripts/repair-preflop.ts` and released
 * (BB vs BTN/CO, SB vs BTN, BTN vs UTG). The rest stay held until they get
 * their own notation specs — releasing copies would re-introduce the bug
 * quarantine exists to prevent.
 */
const VS_4BET_UNREPAIRED =
  "Still byte-identical to the shared vs_4bet template. Only BB:vs_4bet_BTN, " +
  "BB:vs_4bet_CO, SB:vs_4bet_BTN and BTN:vs_4bet_UTG have differentiated " +
  "authored ranges; release this pairing when it has its own repair spec.";

/**
 * Remaining 3bet nodes still collapse onto a sibling template.
 *
 * Four additional pairings were authored and released (BTN vs BB/SB, MP vs BB,
 * CO vs SB). Survivors already served: CO:vs_3bet_BB, CO:vs_3bet_BTN,
 * SB:vs_3bet_BB, UTG:vs_3bet_MP.
 */
const VS_3BET_UNREPAIRED =
  "Still a copy of a sibling vs_3bet template. Hero's opening width and the " +
  "3bettor's range both change with the pairing, so this file cannot be " +
  "served until it has its own repair spec in scripts/repair-preflop.ts.";

export const QUARANTINED_NODES: readonly QuarantinedNode[] = [
  { ref: "BB:vs_4bet_UTG", reason: VS_4BET_UNREPAIRED },
  { ref: "BTN:vs_4bet_CO", reason: VS_4BET_UNREPAIRED },
  { ref: "CO:vs_4bet_UTG", reason: VS_4BET_UNREPAIRED },
  { ref: "SB:vs_4bet_CO", reason: VS_4BET_UNREPAIRED },

  { ref: "MP:vs_3bet_SB", reason: VS_3BET_UNREPAIRED },
  { ref: "UTG:vs_3bet_BB", reason: VS_3BET_UNREPAIRED },
  { ref: "UTG:vs_3bet_SB", reason: VS_3BET_UNREPAIRED },

  { ref: "MP:vs_3bet_BTN", reason: VS_3BET_UNREPAIRED },
  { ref: "MP:vs_3bet_CO", reason: VS_3BET_UNREPAIRED },
  { ref: "UTG:vs_3bet_BTN", reason: VS_3BET_UNREPAIRED },
  { ref: "UTG:vs_3bet_CO", reason: VS_3BET_UNREPAIRED },
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
