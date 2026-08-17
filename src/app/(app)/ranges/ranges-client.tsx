"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/motion";
import { RangeGrid, type RangeStrategy } from "@/components/poker";
import { actionLabel } from "@/lib/action-label";
import { buildArenaLink } from "@/lib/arena-preset";
import { HERO_POSITIONS } from "@/poker/solutions";
import { amountFromBb } from "@/lib/units";

interface NodeSummary {
  nodeRef: string;
  heroPos: string;
  actionSeq: string;
  potBb: number;
  effStackBb: number;
  actions: string[];
  strategy: RangeStrategy;
  notes: string | null;
  confidence: { rangeShape: string; frequencies: string; ev: string; note?: string };
}

/** Seat names beginners already know — never just UTG / MP abbreviations alone. */
const POSITION_LABELS: Record<string, string> = {
  UTG: "Under the gun",
  MP: "Middle position",
  CO: "Cutoff",
  BTN: "Button",
  SB: "Small blind",
  BB: "Big blind",
};

/** "vs_rfi_CO" reads as "vs cutoff open" to a human. */
function describeScenario(actionSeq: string): string {
  if (actionSeq === "rfi") return "Open first in";
  const seat = actionSeq.split("_").at(-1) ?? "";
  const seatWord = POSITION_LABELS[seat]?.toLowerCase() ?? seat;
  if (actionSeq.startsWith("vs_rfi")) return `vs ${seatWord} open`;
  if (actionSeq.startsWith("vs_3bet")) return `vs ${seatWord} 3-bet`;
  if (actionSeq.startsWith("vs_4bet")) return `vs ${seatWord} 4-bet`;
  if (actionSeq.startsWith("vs_limp_")) return `vs ${seatWord} limp`;
  if (actionSeq.startsWith("vs_open_call_")) {
    // The last segment is the CALLER here, not the only opponent — this is the
    // one scenario with two of them, which is the whole point of the node.
    const [, , , opener, caller] = actionSeq.split("_");
    const openerWord = POSITION_LABELS[opener ?? ""]?.toLowerCase() ?? opener ?? "";
    const callerWord = POSITION_LABELS[caller ?? ""]?.toLowerCase() ?? caller ?? "";
    return `vs ${openerWord} open + ${callerWord} call`;
  }
  /*
   * Never reached for a served node, and it must not become reachable quietly.
   * The multiway nodes shipped while this fell through to a `_`-stripped
   * identifier, so the scenario picker offered "vs open call UTG MP" — a raw
   * actionSeq on screen, in a product that claims to explain poker in plain
   * English. `describeScenario` is covered by a test that walks every served
   * node for exactly this reason.
   */
  return actionSeq.replace(/_/g, " ");
}

export const __testing = { describeScenario };

export function RangesClient() {
  const [nodes, setNodes] = useState<NodeSummary[] | null>(null);
  const [position, setPosition] = useState<string>("BTN");
  const [nodeRef, setNodeRef] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/ranges");
      if (!response.ok) {
        setError("Could not load the ranges.");
        return;
      }
      const data = (await response.json()) as { nodes: NodeSummary[] };
      setNodes(data.nodes);
    })();
  }, []);

  const forPosition = useMemo(
    () => (nodes ?? []).filter((n) => n.heroPos === position),
    [nodes, position],
  );

  const selected = useMemo(
    () => forPosition.find((n) => n.nodeRef === nodeRef) ?? forPosition[0],
    [forPosition, nodeRef],
  );

  if (error !== "") {
    return (
      <p role="alert" className="text-danger-bright text-body-md">
        {error}
      </p>
    );
  }

  if (nodes === null) return <Shimmer className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display-md">Ranges</h1>
        <p className="text-text-secondary text-body-lg mt-2 max-w-[52ch]">
          Every preflop spot in the solution set. Look anything up — this is a reference, not an
          exam.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-overline text-text-tertiary uppercase">Position</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {HERO_POSITIONS.map((pos) => (
              <Button
                key={pos}
                variant={pos === position ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setPosition(pos);
                  setNodeRef(null);
                }}
                title={POSITION_LABELS[pos]}
              >
                <span className="font-mono">{pos}</span>
                <span className="text-text-tertiary ms-1.5 hidden sm:inline">
                  {POSITION_LABELS[pos]}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-overline text-text-tertiary uppercase">Scenario</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {forPosition.map((node) => (
              <Button
                key={node.nodeRef}
                variant={node.nodeRef === selected?.nodeRef ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setNodeRef(node.nodeRef)}
              >
                {describeScenario(node.actionSeq)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {selected === undefined ? (
        <p className="text-text-secondary text-body-md">No nodes authored for {position} yet.</p>
      ) : (
        <>
          <div className="text-text-tertiary text-caption flex flex-wrap gap-x-4 font-mono">
            <span>Pot {amountFromBb(selected.potBb)}</span>
            <span>{amountFromBb(selected.effStackBb)} effective</span>
          </div>

          <div className="flex flex-wrap gap-3">
            {(
              [
                ["raise", "var(--color-accent)"],
                ["call", "var(--color-accent-deep)"],
                ["fold", "transparent"],
              ] as const
            ).map(([action, colour]) => (
              <span key={action} className="text-caption flex items-center gap-2 font-mono">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ background: colour, outline: "1px solid var(--color-border)" }}
                />
                {actionLabel(action)}
              </span>
            ))}
          </div>

          <RangeGrid strategy={selected.strategy} />

          {selected.notes !== null && (
            <div className="border-border bg-surface-1 rounded-lg border p-5">
              <p className="text-overline text-text-tertiary uppercase">Why this range</p>
              <p className="text-text-secondary text-body-md mt-2">{selected.notes}</p>
            </div>
          )}

          {/* Honesty about provenance — never claim to be a live solver run. */}
          <p className="text-text-tertiary text-caption">
            Authored approximation of GTO ranges (not a live solver dump). Range shape{" "}
            {selected.confidence.rangeShape} confidence, frequencies{" "}
            {selected.confidence.frequencies}, EV model {selected.confidence.ev}.
            {selected.confidence.note ? ` ${selected.confidence.note}` : ""}
          </p>

          <Button variant="accent" size="lg" asChild>
            <Link
              href={buildArenaLink({
                config: {
                  type: "preflop",
                  heroPos: selected.heroPos as (typeof HERO_POSITIONS)[number],
                  actionSeq: selected.actionSeq,
                },
                length: 10,
                label: `${selected.heroPos} ${describeScenario(selected.actionSeq)}`,
                returnTo: "/ranges",
              })}
            >
              Practise this spot
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
