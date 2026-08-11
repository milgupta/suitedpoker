import { describe, expect, it } from "vitest";
import {
  CHART_ANNOTATIONS,
  CHART_CARD_META,
  CHART_FOOTNOTE,
  CHART_SERIES,
  CHART_X_LABELS,
  chartAreaPath,
  chartPath,
  chartPoints,
} from "@/lib/onboarding-chart";

describe("onboarding comparison chart", () => {
  it("keeps both series starting at the same point", () => {
    const trained = CHART_SERIES.find((s) => s.id === "trained")!;
    const untrained = CHART_SERIES.find((s) => s.id === "untrained")!;
    expect(trained.points[0]).toBe(untrained.points[0]);
  });

  it("states the illustrative caveat in both card meta and footnote", () => {
    expect(CHART_CARD_META.toLowerCase()).toContain("illustrative");
    expect(CHART_FOOTNOTE).toMatch(/Illustrative only/i);
    expect(CHART_FOOTNOTE).toMatch(/bb|big blinds/i);
    expect(`${CHART_FOOTNOTE} ${CHART_CARD_META}`).not.toMatch(/\$|dollar|USD/i);
  });

  it("never puts a dollar figure on any chart string", () => {
    const blob = [
      ...CHART_SERIES.flatMap((s) => [s.label, s.endLabel]),
      ...CHART_ANNOTATIONS.map((a) => a.label),
      ...CHART_X_LABELS.map((t) => t.label),
      CHART_CARD_META,
      CHART_FOOTNOTE,
    ].join(" ");
    expect(blob).not.toMatch(/\$|dollar|USD|profit|won \d/i);
  });

  it("labels the x-axis in sessions, not weeks-to-profit", () => {
    for (const tick of CHART_X_LABELS) {
      expect(tick.label.toLowerCase()).toContain("session");
      expect(tick.label.toLowerCase()).not.toContain("week");
    }
  });

  it("builds a closed area path under the untrained series", () => {
    const untrained = CHART_SERIES.find((s) => s.id === "untrained")!;
    const area = chartAreaPath(untrained.points, 320, 196, -8, 4);
    expect(area.startsWith("M ")).toBe(true);
    expect(area.endsWith(" Z") || area.endsWith("Z")).toBe(true);
    expect(area).toContain(" L ");
  });

  it("maps annotation indices onto real points", () => {
    const untrained = CHART_SERIES.find((s) => s.id === "untrained")!;
    for (const note of CHART_ANNOTATIONS) {
      expect(untrained.points[note.atIndex]).toBeTypeOf("number");
      expect(note.label.length).toBeGreaterThan(4);
    }
  });

  it("pads the plot so end labels have room", () => {
    const trained = CHART_SERIES.find((s) => s.id === "trained")!;
    const pts = chartPoints(trained.points, 320, 196, -8, 4);
    const last = pts[pts.length - 1]!;
    expect(last.x).toBeLessThan(320 - 40);
    expect(chartPath(trained.points, 320, 196, -8, 4).length).toBeGreaterThan(20);
  });
});
