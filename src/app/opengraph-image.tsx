import { ImageResponse } from "next/og";
import { email as palette } from "@/emails/theme";

export const alt = "SuitedPoker — stop guessing, start knowing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The social card.
 *
 * Generated rather than designed in a file, so it cannot go stale against the
 * brand. Deliberately NOT a card or a chip: the frequency bar is the product's
 * actual idea, and a playing card reads as gambling to Meta's ad reviewers —
 * which is the audience this image is most often shown to.
 *
 * Colours come from src/emails/theme.ts — the one module allowed literals,
 * because next/og rasterises without a document and resolves no CSS variable.
 * A test pins every value in it to its token.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: palette.canvas,
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      {/* The mark and the wordmark together.

          A link preview is often the FIRST time anyone sees this product — in
          a message thread, next to a domain in grey text. The wordmark alone
          reads as a caption; the tile is the thing that will be on a home
          screen later, so the two should be introduced at the same time.

          Drawn rather than <img>-ed: next/og would have to fetch the PNG over
          the network at render time, which fails in exactly the situation the
          image matters most — a cold edge render for a crawler. The gradient
          and the path are the same two values as `public/brand/spade-tile.svg`,
          and `accentDeep` is pinned to --color-accent-800 by a test. */}
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 84,
            height: 84,
            borderRadius: 20,
            background: `linear-gradient(180deg, ${palette.accent} 0%, ${palette.accentDeep} 100%)`,
          }}
        >
          <svg width="52" height="52" viewBox="0 0 100 100">
            <path
              d="M50 9 C50 9 17 38 17 57 C17 69 26 78 36 78 C41 78 46 76 49 72 C48 83 44 90 36 93 L64 93 C56 90 52 83 51 72 C54 76 59 78 64 78 C74 78 83 69 83 57 C83 38 50 9 50 9 Z"
              fill={palette.onAccent}
            />
          </svg>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            letterSpacing: 6,
            color: palette.textPrimary,
            fontWeight: 700,
          }}
        >
          SUITEDPOKER
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 92,
            lineHeight: 1.02,
            color: palette.textPrimary,
            fontWeight: 700,
            letterSpacing: -3,
          }}
        >
          Stop guessing.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 92,
            lineHeight: 1.02,
            color: palette.accentBright,
            fontWeight: 700,
            letterSpacing: -3,
          }}
        >
          Start knowing.
        </div>
      </div>

      {/* The mark: two unequal segments — a frequency bar, which is the one
            visual that says what this product does. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 26,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", width: "62%", background: palette.accent }} />
          <div style={{ display: "flex", width: "38%", background: palette.surface2 }} />
        </div>
        <div style={{ display: "flex", fontSize: 30, color: palette.textSecondary }}>
          Learn the strategy behind every decision — in plain English.
        </div>
      </div>
    </div>,
    size,
  );
}
