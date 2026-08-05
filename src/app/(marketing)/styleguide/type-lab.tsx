"use client";

import { useCallback, useState } from "react";
import { readVar, useResolved } from "./resolve-color";

// The utility is spelled out rather than built from the name, because Tailwind
// finds candidates by scanning source text — `text-${name}` would never be
// generated.
const SCALE = [
  ["display-xl", "text-display-xl", "Diagnosis headline, hero"],
  ["display-lg", "text-display-lg", "Marketing section heads"],
  ["display-md", "text-display-md", "Large stat numerals"],
  ["heading-lg", "text-heading-lg", "Screen titles"],
  ["heading-md", "text-heading-md", "Card titles"],
  ["body-lg", "text-body-lg", "Body copy"],
  ["body-md", "text-body-md", "Dense body, table cells"],
  ["body-sm", "text-body-sm", "Compact UI"],
  ["caption", "text-caption", "Meta, timestamps"],
  ["overline", "text-overline uppercase", "Section labels"],
] as const;

interface Metrics {
  size: string;
  leading: string;
  weight: string;
  tracking: string;
  ratio: string;
}

function measure(el: HTMLElement): Metrics {
  const s = getComputedStyle(el);
  const size = parseFloat(s.fontSize);
  const leading = parseFloat(s.lineHeight);
  return {
    size: `${Math.round(size)}px`,
    leading: Number.isNaN(leading) ? s.lineHeight : `${Math.round(leading)}px`,
    weight: s.fontWeight,
    tracking: s.letterSpacing === "normal" ? "0" : s.letterSpacing,
    ratio: Number.isNaN(leading) ? "—" : (leading / size).toFixed(2),
  };
}

/**
 * One row, measuring itself as the node attaches.
 *
 * The measurement happens in a ref callback rather than an effect: it needs the
 * committed layout, and a stable callback identity means it runs once on mount
 * rather than on every render.
 */
function TypeRow({ name, utility, use }: { name: string; utility: string; use: string }) {
  const [m, setM] = useState<Metrics | null>(null);
  const measureRef = useCallback((el: HTMLElement | null) => {
    if (el !== null) setM(measure(el));
  }, []);

  return (
    <div className="border-border-subtle border-b pb-6 last:border-b-0">
      <div className="text-text-tertiary text-overline flex flex-wrap gap-x-4 gap-y-1 uppercase">
        <code>{name}</code>
        {m !== null && (
          <>
            <span>{m.size}</span>
            <span>lh {m.leading}</span>
            <span>×{m.ratio}</span>
            <span>w{m.weight}</span>
            <span>ls {m.tracking}</span>
          </>
        )}
        <span className="text-text-tertiary normal-case">{use}</span>
      </div>
      <p ref={measureRef} className={`${utility} mt-2 break-words`}>
        Stop guessing. Start knowing.
      </p>
    </div>
  );
}

/**
 * Gated on hydration — the custom property does not exist during SSR, so
 * rendering it unguarded is a hydration text mismatch.
 */
function FontStack() {
  const ready = useResolved();

  return (
    <div>
      <h3 className="text-heading-md">Font stack</h3>
      <p className="text-text-secondary text-body-sm mt-2 font-mono break-all">
        {ready ? readVar("--font-sans") : "—"}
      </p>
      <p className="text-text-secondary text-body-sm mt-2 font-mono break-all">
        {ready ? readVar("--font-mono") : "—"}
      </p>
    </div>
  );
}

/**
 * Reports what the browser actually resolved rather than what the token says.
 * A typo in a line-height token shows up here as a wrong ratio.
 */
export function TypeLab() {
  return (
    <div className="flex flex-col gap-8">
      <p className="text-text-secondary text-body-sm">
        Bimodal by design: display type is set solid at 1.00–1.10, body breathes at 1.33–1.50.
        Nothing sits in between — a 1.2 heading is the single biggest tell of a template. The ratio
        column is measured live from the rendered element.
      </p>

      {SCALE.map(([name, utility, use]) => (
        <TypeRow key={name} name={name} utility={utility} use={use} />
      ))}

      <div>
        <h3 className="text-heading-md">Tabular numerals</h3>
        <p className="text-text-secondary text-body-sm mt-2">
          Every figure that changes uses mono with <code>tabular-nums</code>, so a stack size does
          not jitter its own layout while animating.
        </p>
        <div className="mt-4 grid gap-2">
          {["1,111.11", "8,888.88", "1,818.18"].map((n) => (
            <span key={n} className="text-display-md font-mono tabular-nums">
              {n}
            </span>
          ))}
        </div>
      </div>

      <FontStack />
    </div>
  );
}
