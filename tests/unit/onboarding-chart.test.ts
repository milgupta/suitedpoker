import { describe, expect, it } from "vitest";
import {
  CHART_FOOTNOTE,
  CHART_SERIES,
  CHART_X_LABELS,
  CHART_Y_LABEL,
  chartAreaPath,
  chartBandPath,
  chartPath,
  chartPoints,
} from "@/lib/onboarding-chart";

describe("onboarding comparison chart", () => {
  it("keeps both series starting at the same point", () => {
    const trained = CHART_SERIES.find((s) => s.id === "trained")!;
    const untrained = CHART_SERIES.find((s) => s.id === "untrained")!;
    expect(trained.points[0]).toBe(untrained.points[0]);
  });

  /**
   * The footnote is now the ONLY place the caveat and the unit appear — the
   * card header that carried a second copy is gone. So both assertions moved
   * here, and the unit one matters more than it used to: with no "bb / 100" on
   * the card, a footnote that failed to name the unit would leave the y-axis
   * an unlabelled quantity.
   */
  it("carries the caveat and the unit in the footnote", () => {
    expect(CHART_FOOTNOTE).toMatch(/Illustrative only/i);
    expect(CHART_FOOTNOTE).toMatch(/bb|big blinds/i);
    expect(CHART_FOOTNOTE).not.toMatch(/\$|dollar|USD/i);
  });

  it("labels the y-axis without naming a currency", () => {
    expect(CHART_Y_LABEL.length).toBeGreaterThan(0);
    expect(CHART_Y_LABEL).not.toMatch(/\$|dollar|USD/i);
  });

  it("never puts a dollar figure on any chart string", () => {
    const blob = [
      ...CHART_SERIES.flatMap((s) => [s.label, s.endLabel]),
      ...CHART_X_LABELS.map((t) => t.label),
      CHART_Y_LABEL,
      CHART_FOOTNOTE,
    ].join(" ");
    expect(blob).not.toMatch(/\$|dollar|USD|profit|won \d/i);
  });

  it("labels the x-axis in sessions, not weeks-to-profit", () => {
    for (const tick of CHART_X_LABELS) {
      expect(tick.label.toLowerCase()).toContain("session");
      expect(tick.label.toLowerCase()).not.toContain("week");
    }
    expect(CHART_X_LABELS[0]?.label).toBe("Session 1");
    expect(CHART_X_LABELS[CHART_X_LABELS.length - 1]?.label).toBe("Session 100");
  });

  it("builds a closed area path under the untrained series", () => {
    const untrained = CHART_SERIES.find((s) => s.id === "untrained")!;
    const area = chartAreaPath(untrained.points, 320, 196, -8, 4);
    expect(area.startsWith("M ")).toBe(true);
    expect(area.endsWith(" Z") || area.endsWith("Z")).toBe(true);
    expect(area).toContain(" L ");
  });

  /**
   * The band is the screen's whole argument, and it is the one shape a reader
   * cannot check by eye — a mirrored return path still LOOKS like a filled
   * region, it just fills the wrong one. So: it must close, and its return leg
   * must actually travel right to left.
   */
  it("closes the band between the two curves, travelling back the way it came", () => {
    const trained = CHART_SERIES.find((s) => s.id === "trained")!;
    const untrained = CHART_SERIES.find((s) => s.id === "untrained")!;
    const band = chartBandPath(trained.points, untrained.points, 320, 180, -8, 4);

    expect(band.startsWith("M ")).toBe(true);
    expect(band.trimEnd().endsWith("Z")).toBe(true);

    // Every x that appears, in order. The first half must ascend and the
    // second half descend; a mirrored return leg ascends twice.
    const xs = [...band.matchAll(/[ML,] ?(-?[\d.]+) -?[\d.]+/g)].map((m) => Number(m[1]));
    const turn = xs.indexOf(Math.max(...xs));
    expect(turn).toBeGreaterThan(0);
    expect(turn).toBeLessThan(xs.length - 1);
    expect(xs[xs.length - 1]).toBeLessThan(xs[turn]!);
  });

  it("pads the plot so end labels have room", () => {
    const trained = CHART_SERIES.find((s) => s.id === "trained")!;
    const pts = chartPoints(trained.points, 320, 196, -8, 4);
    const last = pts[pts.length - 1]!;
    const longest = Math.max(...CHART_SERIES.map((s) => s.endLabel.length));
    // 12px end labels sit 9px past the last point. ~7px/char is Inter at
    // that size; 6px more is the gutter so the last letter is not the
    // viewBox edge. A pad that only cleared "Studying" clipped "No change".
    const needed = 9 + longest * 7 + 6;
    expect(320 - last.x).toBeGreaterThanOrEqual(needed);
    expect(chartPath(trained.points, 320, 196, -8, 4).length).toBeGreaterThan(20);
  });
});
