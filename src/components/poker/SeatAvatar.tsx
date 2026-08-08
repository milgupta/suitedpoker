import { cn } from "@/lib/utils";

/**
 * The player in a seat.
 *
 * A ring of labelled pills reads as a diagram. A ring of faces reads as a
 * table you have sat at, and the difference matters more than it sounds: the
 * whole product is asking somebody to think about what five other PEOPLE are
 * doing, and five text labels do not evoke people.
 *
 * Deliberately anonymous. There is no photo, no name and no invented persona —
 * the villains are a solved strategy, not characters, and giving them faces
 * with personalities would be a claim about opponent modelling this product
 * does not make. What varies per seat is a step of the blue ladder, so the
 * table looks populated rather than stamped, without inventing a second colour
 * language on the one screen where colour already means something.
 *
 * NO GRADE COLOURS HERE, ever. Green-to-red is a judgement about a decision;
 * an avatar that borrowed it would say a player was wrong.
 */

/** Blue-family only — interface colour, never the grade ramp. */
const FILLS = [
  "var(--color-accent-950)",
  "var(--color-surface-2)",
  "var(--color-accent-900)",
  "var(--color-surface-1)",
  "var(--color-accent-950)",
  "var(--color-surface-2)",
] as const;

/** Stable across renders and across sessions: the same seat is the same face. */
function fillFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return FILLS[hash % FILLS.length] ?? FILLS[0];
}

export interface SeatAvatarProps {
  /** Usually the position. Decides which step of the ladder this seat gets. */
  seed: string;
  /**
   * Sized by CSS, never by a number from state.
   *
   * It was `size={narrow ? 26 : 32}` off a matchMedia effect, so every seat was
   * 32px on first paint and 26px a frame later — which moves all six anchors on
   * the ring and everything below it. That alone was 0.036 of CLS on /arena.
   */
  sizeClass?: string;
  isHero?: boolean;
  folded?: boolean;
  className?: string;
}

export function SeatAvatar({
  seed,
  sizeClass = "size-[26px] sm:size-8",
  isHero = false,
  folded = false,
  className,
}: SeatAvatarProps) {
  const fill = isHero ? "var(--color-accent-800)" : fillFor(seed);
  const ring = isHero ? "var(--color-accent)" : "var(--color-border)";
  const ink = isHero ? "var(--color-accent-bright)" : "var(--color-text-tertiary)";

  return (
    <span
      // Decorative: the seat's position label and its folded state are already
      // in the accessible name of the pill next to it. A second announcement
      // per seat would make a screen reader read the table twice.
      aria-hidden
      className={cn("block shrink-0 rounded-full", sizeClass, className)}
      style={{
        background: fill,
        boxShadow: `inset 0 0 0 1.5px ${ring}`,
        opacity: folded ? 0.4 : 1,
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="block h-full w-full">
        <circle cx="12" cy="9.2" r="3.6" fill={ink} />
        <path d="M4.6 21c0-4.1 3.3-6.6 7.4-6.6s7.4 2.5 7.4 6.6Z" fill={ink} />
      </svg>
    </span>
  );
}
