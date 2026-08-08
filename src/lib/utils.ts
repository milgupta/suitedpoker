import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * THE FONT-SIZE SCALE AND THE COLOUR PALETTE BOTH LIVE UNDER `text-*`, AND
 * TAILWIND-MERGE CANNOT TELL THEM APART ON ITS OWN.
 *
 * Stock twMerge groups every `text-…` utility it does not recognise together,
 * so `cn("text-canvas", "text-body-lg")` drops `text-canvas` and keeps the
 * last one. That is exactly what happened: `Button`'s `primary` variant is
 * `bg-text-primary text-canvas`, size `lg` adds `text-body-lg`, the colour was
 * silently stripped, and every white button in the product rendered white text
 * on a white pill. Computed style read `color` and `background-color` as the
 * same rgb. The login button, the demo hand's "Deal me in" — all of them,
 * invisible, with no error anywhere.
 *
 * Naming the two families fixes it for good. `tests/unit/class-merge.test.ts`
 * is the guard: it is the same shape of failure as the `text-display-sm`
 * regression, where a utility that silently does nothing survives three
 * substages because nothing throws.
 */

/**
 * Every step of the type scale, mirroring the `--text-*` tokens in globals.css.
 *
 * Kept in sync by `tests/unit/class-merge.test.ts`, which reads the stylesheet:
 * a step that exists in CSS but is missing here reintroduces the bug for that
 * step alone, which is the hardest version of it to spot. The test caught
 * `overline` missing from the first draft of this list.
 */
const FONT_SIZES = [
  "display-xl",
  "display-lg",
  "display-md",
  "heading-lg",
  "heading-md",
  "body-lg",
  "body-md",
  "body-sm",
  "caption",
  "overline",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": FONT_SIZES.map((size) => `text-${size}`),
    },
  },
});

/**
 * Merges class names, with later Tailwind utilities winning over earlier ones
 * in the same group. Required by every shadcn component.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
