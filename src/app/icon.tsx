import { ImageResponse } from "next/og";
import { email as palette } from "@/emails/theme";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The mark: two unequal segments of a frequency bar.
 *
 * NOT a card, a chip, or a suit. Those read as gambling to Meta's ad reviewers
 * and to the App Store later — the two gatekeepers this product has to get
 * past — and they say nothing about what it does. The frequency bar is the
 * product's actual idea: strategy is a mix, not an answer.
 *
 * Two segments and one gap is all that survives 16px. Anything with a third
 * element turns to mud.
 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: palette.canvas,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 22 }}>
        {/* 62/38 — the same split the landing page shows. */}
        <div style={{ display: "flex", width: "100%", height: 7, borderRadius: 2 }}>
          <div style={{ display: "flex", width: "62%", background: palette.accentBright }} />
          <div style={{ display: "flex", width: "38%", background: palette.surface2 }} />
        </div>
        <div style={{ display: "flex", width: "100%", height: 7, borderRadius: 2 }}>
          <div style={{ display: "flex", width: "30%", background: palette.accent }} />
          <div style={{ display: "flex", width: "70%", background: palette.surface2 }} />
        </div>
      </div>
    </div>,
    size,
  );
}
