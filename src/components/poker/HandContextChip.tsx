"use client";

import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface HandContext {
  /** "BTN opens 2.5bb, BB calls" */
  readonly preflopAction: string;
  readonly effectiveStackBb: number;
  /** "single raised" | "3-bet" | "limped" */
  readonly potType: string;
}

/**
 * Preflop history, folded away by default.
 *
 * The table surface stays clean for a beginner who would drown in it, while a
 * stronger player is one tap from everything they need. Cramming the action
 * history onto the table by default makes the screen unreadable on a phone.
 */
export function HandContextChip({
  context,
  className,
}: {
  context: HandContext;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="hand-context"
      >
        <InfoIcon aria-hidden="true" />
        {open ? "Hide hand context" : "Show hand context"}
      </Button>

      {open && (
        <dl
          id="hand-context"
          className="border-border bg-surface-1 text-body-sm grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border p-4"
        >
          <dt className="text-text-tertiary">Preflop</dt>
          <dd>{context.preflopAction}</dd>
          <dt className="text-text-tertiary">Effective</dt>
          <dd className="font-mono tabular-nums">{context.effectiveStackBb.toFixed(0)}BB</dd>
          <dt className="text-text-tertiary">Pot type</dt>
          <dd>{context.potType}</dd>
        </dl>
      )}
    </div>
  );
}
