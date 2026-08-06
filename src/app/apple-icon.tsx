import { ImageResponse } from "next/og";
import { email as palette } from "@/emails/theme";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The home-screen icon. Same mark, more room.
 *
 * iOS masks this to a rounded rectangle and adds no padding of its own, so the
 * bars are inset — a mark that runs to the edge gets its corners clipped.
 */
export default function AppleIcon() {
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
      <div style={{ display: "flex", flexDirection: "column", gap: 18, width: 112 }}>
        <div style={{ display: "flex", width: "100%", height: 30, borderRadius: 8 }}>
          <div style={{ display: "flex", width: "62%", background: palette.accentBright }} />
          <div style={{ display: "flex", width: "38%", background: palette.surface2 }} />
        </div>
        <div style={{ display: "flex", width: "100%", height: 30, borderRadius: 8 }}>
          <div style={{ display: "flex", width: "30%", background: palette.accent }} />
          <div style={{ display: "flex", width: "70%", background: palette.surface2 }} />
        </div>
      </div>
    </div>,
    size,
  );
}
