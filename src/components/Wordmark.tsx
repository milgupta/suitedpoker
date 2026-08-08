/**
 * The brand lockup: mark, then wordmark.
 *
 * One component rather than four copies, because it appears on the landing
 * header, the landing footer, the auth shell and the legal shell — and a logo
 * that is subtly different on the page where someone signs up is the kind of
 * thing nobody reports and everybody notices.
 *
 * The mark is a plain `<img>`, not `next/image`. The optimiser refuses SVG
 * without `dangerouslyAllowSVG`, and there is nothing to optimise in a 700-byte
 * vector — same reasoning as the Google button.
 *
 * The wordmark stays `--accent-bright`, not `--accent`: at body size the mid
 * azure is 4.37 on canvas, which fails AA. The tile carries the deeper blue.
 */

const SIZES = {
  sm: { px: 24, text: "text-body-md" },
  // NOT `text-heading-sm` — that token has never existed, and Tailwind drops an
  // unresolvable utility silently. Dormant only because nothing uses `md` yet.
  md: { px: 32, text: "text-heading-md" },
} as const;

export function Wordmark({
  size = "sm",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { px, text } = SIZES[size];

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* Decorative: the wordmark beside it already says the name, and a second
          announcement makes every screen reader read the brand twice. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/spade-tile.svg"
        alt=""
        width={px}
        height={px}
        className="shrink-0 rounded-[22%]"
      />
      <span className={`text-accent-bright ${text} font-mono font-bold tracking-widest`}>
        SUITEDPOKER
      </span>
    </span>
  );
}
