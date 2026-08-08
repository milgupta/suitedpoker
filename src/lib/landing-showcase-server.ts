import "server-only";

import { buildShowcase, SHOWCASE_NODE_REF, type Showcase } from "@/lib/landing-showcase";
import { loadSolutionData } from "@/lib/solution-data";

/**
 * The one I/O step, kept apart from the arithmetic for the same reason
 * `methodology-server.ts` is: the derivation is then testable against a node
 * literal without a filesystem, and the landing page cannot end up with a
 * number that no file contains.
 */
export function landingShowcase(): Showcase {
  const { preflop } = loadSolutionData();
  const node = preflop.find((candidate) => candidate.ref === SHOWCASE_NODE_REF);

  if (node === undefined) {
    // Loudly, at build time. A landing page that silently drops its
    // centrepiece because a file was renamed is worse than one that fails.
    throw new Error(
      `The landing showcase needs node ${SHOWCASE_NODE_REF}, which is not in the solution set.`,
    );
  }

  return buildShowcase(node);
}
