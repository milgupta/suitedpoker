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
      <div
        style={{
          display: "flex",
          fontSize: 26,
          letterSpacing: 6,
          color: palette.textTertiary,
          fontWeight: 700,
        }}
      >
        SUITEDPOKER
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
          Learn exactly what a solver would do — in plain English.
        </div>
      </div>
    </div>,
    size,
  );
}
