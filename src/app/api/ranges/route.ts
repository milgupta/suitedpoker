import { NextResponse } from "next/server";
import { withEntitlement } from "@/lib/api-guard";
import { loadSolutionData } from "@/lib/solution-data";
import { nodeRefOf } from "@/poker/solutions";

/**
 * The preflop reference, for /ranges.
 *
 * This DOES return strategy and EV, and that is deliberate. The /ranges browser
 * is a reference tool for entitled users — a player who wants to look up the
 * answer to their own practice hand is allowed to. Poker training is not an
 * exam. What must never happen is the answer arriving inside a DRILL payload,
 * which is a different endpoint with a different contract.
 *
 * See the reasoning block in supabase/migrations/0001_auth_fks_rls.sql before
 * "hardening" this.
 */
export const GET = withEntitlement(() => {
  const data = loadSolutionData();

  return NextResponse.json({
    nodes: data.preflop.map((node) => ({
      nodeRef: nodeRefOf(node.heroPos, node.actionSeq),
      heroPos: node.heroPos,
      actionSeq: node.actionSeq,
      potBb: node.potBb,
      effStackBb: node.effStackBb,
      actions: node.actions,
      strategy: node.strategy,
      ev: node.ev,
      notes: node.notes ?? null,
      confidence: node.confidence,
    })),
  });
});
