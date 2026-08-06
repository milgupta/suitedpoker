"use client";

import { useEffect, useState } from "react";
import { RangeGrid, type RangeStrategy } from "@/components/poker";

/**
 * A live range grid for a named solution node, e.g. `BTN:rfi`.
 *
 * `/api/ranges` returns the WHOLE node list — it is the reference browser's
 * endpoint — so the node is found here rather than requested. And every
 * failure renders a line of text instead of throwing: a lesson blanked by an
 * error boundary because one chart could not load is a far worse outcome than
 * a lesson with one chart missing.
 */

interface ApiNode {
  nodeRef: string;
  strategy?: RangeStrategy;
}

export function RangeGridEmbed({ node, caption }: { node: string; caption?: string }) {
  const [strategy, setStrategy] = useState<RangeStrategy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/ranges");
        if (!response.ok) {
          if (!cancelled) setFailed(true);
          return;
        }

        const body = (await response.json()) as { nodes?: ApiNode[] };
        const found = body.nodes?.find((n) => n.nodeRef === node);

        if (cancelled) return;
        if (found?.strategy === undefined || Object.keys(found.strategy).length === 0) {
          setFailed(true);
          return;
        }
        setStrategy(found.strategy);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [node]);

  return (
    <figure className="my-6" data-range-embed={node}>
      {failed ? (
        <p className="text-text-tertiary text-body-sm border-border rounded-md border border-dashed px-4 py-6 text-center">
          Chart unavailable — open the range browser to explore this spot.
        </p>
      ) : strategy === null ? (
        <div className="bg-surface-1 h-64 animate-pulse rounded-md" aria-hidden />
      ) : (
        <RangeGrid strategy={strategy} mode="frequency" />
      )}
      {caption !== undefined && (
        <figcaption className="text-text-tertiary text-caption mt-2 text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
