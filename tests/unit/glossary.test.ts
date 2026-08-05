/**
 * The glossary is the only thing standing between a beginner and a number they
 * cannot interpret, so its shape is asserted rather than assumed.
 */

import { describe, expect, it } from "vitest";
import { GLOSSARY, formatStat, getGlossaryEntry, verdictFor } from "../../src/content/glossary";

describe("glossary entries", () => {
  it.each(GLOSSARY)("$id answers both questions", (entry) => {
    // "What is this?" must not be empty and must not lean on jargon the entry
    // itself is meant to explain.
    expect(entry.what.length).toBeGreaterThan(40);
    // "How to improve" must contain a concrete target, not just encouragement.
    expect(entry.improve).toMatch(/\d/);
    expect(entry.bands.length).toBeGreaterThan(1);
  });

  it.each(GLOSSARY)("$id has bands in ascending order", (entry) => {
    const bounds = entry.bands.map((b) => b.upTo);
    expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
  });

  it("makes no dollar-denominated claim anywhere", () => {
    // Ad-account and compliance boundary, not a copy preference.
    for (const entry of GLOSSARY) {
      expect(`${entry.what} ${entry.improve}`).not.toMatch(/\$|dollar|USD/i);
    }
  });

  it("resolves entries by id and returns undefined for an unknown one", () => {
    expect(getGlossaryEntry("vpip")?.name).toBe("VPIP");
    expect(getGlossaryEntry("nope")).toBeUndefined();
  });
});

describe("verdictFor", () => {
  it("picks the band a value falls in", () => {
    const vpip = getGlossaryEntry("vpip");
    expect(vpip).toBeDefined();
    if (vpip === undefined) return;

    expect(verdictFor(vpip, 12)).toBe("Tight");
    expect(verdictFor(vpip, 22)).toBe("Solid");
    expect(verdictFor(vpip, 33)).toBe("Loose");
  });

  it("uses the boundary value inclusively", () => {
    const vpip = getGlossaryEntry("vpip");
    if (vpip === undefined) throw new Error("missing entry");
    expect(verdictFor(vpip, 17)).toBe("Tight");
    expect(verdictFor(vpip, 18)).toBe("Solid");
  });

  it("falls back to the last band past the top of the range", () => {
    const vpip = getGlossaryEntry("vpip");
    if (vpip === undefined) throw new Error("missing entry");
    expect(verdictFor(vpip, 10_000)).toBe("Loose");
  });
});

describe("formatStat", () => {
  it("applies the entry's decimals and unit", () => {
    const ev = getGlossaryEntry("ev-loss");
    if (ev === undefined) throw new Error("missing entry");
    expect(formatStat(ev, 2.44)).toBe("2.4 bb/100");

    const vpip = getGlossaryEntry("vpip");
    if (vpip === undefined) throw new Error("missing entry");
    expect(formatStat(vpip, 33.4)).toBe("33%");
  });
});
