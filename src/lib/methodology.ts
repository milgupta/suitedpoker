/**
 * What the strategy data actually is, stated precisely.
 *
 * THIS PAGE EXISTS TO BE HONEST, and the reason it is a module rather than
 * prose in a component is that the numbers must be READ FROM THE DATA. A
 * methodology page with hand-typed counts is the same failure as the competitor
 * whose /methodology 404s — it just takes longer to notice.
 *
 * The provenance figure is the load-bearing one. Every node currently carries
 * `authored-approximation`, and this page says so in those words. Claiming
 * "solver-verified" would be the exact false claim the plan criticises a
 * competitor for, and a numerate audience checks.
 */

export interface MethodologyFacts {
  readonly solutionSet: string;
  readonly preflopNodes: number;
  readonly postflopTemplates: number;
  readonly solverVerified: number;
  readonly authoredApproximation: number;
  readonly game: string;
  readonly tableSize: number;
  readonly effStackBb: number;
}

/** True only when every node has been replaced with solver output. */
export function isFullySolverVerified(facts: MethodologyFacts): boolean {
  return facts.authoredApproximation === 0 && facts.solverVerified > 0;
}

/**
 * The one-line claim, chosen by what the data supports.
 *
 * Two versions, and the honest one is the default. When 2.8–2.10 land real
 * solver output the copy changes because the DATA changed, not because someone
 * edited a string.
 */
export function provenanceHeadline(facts: MethodologyFacts): string {
  if (isFullySolverVerified(facts)) {
    return `Every one of the ${facts.preflopNodes} preflop spots is solver-verified.`;
  }
  if (facts.solverVerified > 0) {
    return `${facts.solverVerified} of ${facts.preflopNodes} preflop spots are solver-verified. The rest are careful approximations, and each one says so.`;
  }
  return `The strategy is a simplified, hand-authored approximation of solver output — not the output of a solver run we did ourselves. Every spot is labelled, and we would rather tell you that than let you assume otherwise.`;
}

export const METHODOLOGY_SECTIONS: readonly { heading: string; body: string }[] = [
  {
    heading: "Where the numbers come from",
    body: "The preflop strategy is derived from published solver-derived ranges for 6-max no-limit hold'em at 100 big blinds, with frequencies and expected values built from an indifference model. That means the shape of each range — which hands raise, which fold, which mix — follows established solver output, while the exact percentages are our model rather than a solve we ran.",
  },
  {
    heading: "What that means in practice",
    body: "For learning the ideas that actually move a beginner's win rate — position, range shape, why a hand mixes at all — this is the right level of precision. For squeezing the last fraction of a big blind out of a specific river spot, it is not, and no product at this price is.",
  },
  {
    heading: "Rake",
    body: "Solver output is usually computed without rake. Real games have it, and it matters most in exactly the spots where a solver defends widest — the big blind above all. Where a range is rake-sensitive, the data says so, and the coach is instructed to be more cautious there.",
  },
  {
    heading: "Where it is going",
    body: "Real solve output replaces this data set node by node. When it does, the label on each spot changes with it, and this page's numbers change automatically, because they are read from the data rather than typed here.",
  },
  {
    heading: "What we will never do",
    body: "Claim a precision we do not have. Every spot carries a confidence rating and a provenance label, and both are visible in the product rather than buried here.",
  },
];
