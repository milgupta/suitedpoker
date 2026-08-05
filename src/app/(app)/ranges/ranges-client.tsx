"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/motion";
import { RangeGrid, type RangeStrategy } from "@/components/poker";
import { buildArenaLink } from "@/lib/arena-preset";
import { HERO_POSITIONS } from "@/poker/solutions";

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

/** "vs_rfi_CO" reads as "vs CO open" to a human. */
function describeScenario(actionSeq: string): string {
  if (actionSeq === "rfi") return "Open (RFI)";
  const [kind, seat] = actionSeq.split("_").slice(-2);
  if (actionSeq.startsWith("vs_rfi")) return `vs ${seat} open`;
  if (actionSeq.startsWith("vs_3bet")) return `vs ${seat} 3-bet`;
  if (actionSeq.startsWith("vs_4bet")) return `vs ${seat} 4-bet`;
  return `${kind} ${seat}`;
}

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
              >
                {pos}
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
            <span>{selected.potBb}BB pot</span>
            <span>{selected.effStackBb}BB effective</span>
            <span>{selected.actions.join(" · ")}</span>
          </div>

          <RangeGrid strategy={selected.strategy} />

          <div className="flex flex-wrap gap-3">
            {[
              ["raise", "var(--color-accent)"],
              ["call", "var(--color-accent-deep)"],
              ["fold", "transparent"],
            ].map(([action, colour]) => (
              <span key={action} className="text-caption flex items-center gap-2 font-mono">
                <span
                  className="inline-block size-3 rounded-full"
                  style={{ background: colour, outline: "1px solid var(--color-border)" }}
                />
                {action}
              </span>
            ))}
          </div>

          {selected.notes !== null && (
            <div className="border-border bg-surface-1 rounded-lg border p-5">
              <p className="text-overline text-text-tertiary uppercase">Why this range</p>
              <p className="text-text-secondary text-body-md mt-2">{selected.notes}</p>
            </div>
          )}

          {/* Honesty about provenance. Never claim to be a solver. */}
          <p className="text-text-tertiary text-caption">
            Solver-derived simplified strategy. Range shape {selected.confidence.rangeShape}{" "}
            confidence, frequencies {selected.confidence.frequencies}, EV {selected.confidence.ev}.
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
