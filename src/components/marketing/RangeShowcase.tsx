"use client";

import { RangeGrid } from "@/components/poker/RangeGrid";
import type { Showcase } from "@/lib/landing-showcase";

/**
 * The whole 169-cell range the featured hand came out of.
 *
 * The single most convincing object this product owns, and the previous
 * landing page did not show it once. It is also the reason the frames on this
 * page are desktop-shaped: the grid needs width to be a grid rather than a
 * texture, which is exactly what a phone mockup cannot give it.
 *
 * The data is the shipped solution node — the same one `/ranges` serves to a
 * subscriber. Publishing one node is deliberate: the competitor puts a range
 * chart on its front page too, and a range you can check is the claim.
 */
export function RangeShowcase({ showcase }: { showcase: Showcase }) {
  return (
    <div className="flex flex-col gap-4">
      <RangeGrid strategy={showcase.strategy} highlightHand={showcase.hand} />

      <div className="text-text-tertiary text-caption flex flex-wrap items-center gap-x-5 gap-y-2">
        <Key className="bg-accent" label="Raise" />
        <Key className="bg-accent-deep" label="Call" />
        <Key className="border-border border bg-transparent" label="Fold" />
        <span className="font-mono">{showcase.nodeRef}</span>
      </div>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`size-3 rounded-[3px] ${className}`} />
      {label}
    </span>
  );
}
