import "server-only";

import { loadAllSolutionData } from "@/lib/solution-data";
import type { MethodologyFacts } from "@/lib/methodology";

/**
 * The methodology numbers, COUNTED FROM THE DATA.
 *
 * Never typed by hand. A methodology page with hardcoded counts is the same
 * failure as one that 404s — it just takes longer for someone to notice it is
 * wrong, and this is the page whose whole value is being checkable.
 */
export function methodologyFacts(): MethodologyFacts {
  // The WHOLE corpus, quarantine ignored — node-status.ts documents that
  // /methodology counts honestly while serving is narrowed. This briefly read
  // the served set and under-reported the page whose value is being checkable.
  const data = loadAllSolutionData();

  const all = [...data.preflop, ...data.postflop];
  const solverVerified = all.filter((n) => n.provenance === "solver-verified").length;

  return {
    solutionSet: data.preflop[0]?.solutionSet ?? "suitedpoker-6max-100bb-v1",
    preflopNodes: data.preflop.length,
    postflopTemplates: data.postflop.length,
    solverVerified,
    authoredApproximation: all.length - solverVerified,
    game: "No-limit hold'em",
    tableSize: 6,
    effStackBb: data.preflop[0]?.effStackBb ?? 100,
  };
}
