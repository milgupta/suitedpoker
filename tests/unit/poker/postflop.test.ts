import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { cardsFromString } from "@/poker/cards";
import {
  boardTexture,
  HAND_CLASSES,
  type HandClass,
  handClassRank,
  isMadeHand,
} from "@/poker/handclass";
import { Range } from "@/poker/range";
import {
  getPostflopStrategy,
  parsePostflopTemplate,
  type PostflopTemplate,
  POSTFLOP_ACTIONS,
  postflopBestAction,
  postflopEvLoss,
  validatePostflopTemplate,
} from "@/poker/solutions";

const results: Array<[string, string]> = [];
function record(check: string, detail: string): void {
  results.push([check, detail]);
}

const DIR = resolve(process.cwd(), "src/content/solutions/postflop");
const raw = readdirSync(DIR)
  .filter((n) => n.endsWith(".json"))
  .sort()
  .map((name) => ({ name, json: JSON.parse(readFileSync(join(DIR, name), "utf8")) as unknown }));

const templates: PostflopTemplate[] = raw.map(({ name, json }) =>
  parsePostflopTemplate(json, name),
);

describe("the seed postflop templates", () => {
  it("has the eight the plan asks for", () => {
    expect(templates.length).toBe(8);
    record("template count", `${templates.length} templates`);
  });

  it.each(raw.map((r) => r.name))("%s validates", (name) => {
    const entry = raw.find((r) => r.name === name);
    expect(validatePostflopTemplate(entry?.json, name).errors).toEqual([]);
  });

  it("sums every hand class's frequencies to 1", () => {
    const violations: string[] = [];
    for (const template of templates) {
      for (const entry of template.strategies) {
        const sum = Object.values(entry.strategy).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1) > 0.001) {
          violations.push(`${template.id} / ${entry.handClass} → ${sum.toFixed(4)}`);
        }
      }
    }
    expect(violations).toEqual([]);
    const total = templates.reduce((n, t) => n + t.strategies.length, 0);
    record("frequency sums", `${total} hand-class entries across 8 templates all sum to 1.0`);
  });

  it("uses only real hand classes and real actions", () => {
    for (const template of templates) {
      for (const entry of template.strategies) {
        expect(HAND_CLASSES).toContain(entry.handClass as HandClass);
      }
      for (const action of template.actions) expect(POSTFLOP_ACTIONS).toContain(action);
    }
    record("vocabulary", "every hand class and action is one the engine knows");
  });

  it("declares provenance on every template", () => {
    for (const template of templates) expect(template.provenance).toBe("authored-approximation");
    record("provenance", "all 8 templates declare authored-approximation");
  });

  it("gives every entry a real rationale, not a placeholder", () => {
    const rationales = templates.flatMap((t) => t.strategies.map((s) => s.rationale));
    for (const rationale of rationales) expect(rationale.length).toBeGreaterThan(30);
    expect(new Set(rationales).size).toBe(rationales.length);
    record("rationales", `${rationales.length} rationales, all distinct`);
  });

  it("gives 3 to 5 example boards that match the declared tags", () => {
    const mismatches: string[] = [];
    for (const template of templates) {
      expect(template.exampleBoards.length).toBeGreaterThanOrEqual(3);
      for (const boardText of template.exampleBoards) {
        const board = cardsFromString(boardText);
        const actual = boardTexture(board);
        for (const tag of template.boardTags) {
          if (!actual.includes(tag as never)) {
            mismatches.push(`${template.id}: "${boardText}" is ${actual.join(",")}, wants ${tag}`);
          }
        }
      }
    }
    if (mismatches.length > 0) console.error(mismatches.join("\n"));
    expect(mismatches).toEqual([]);
    record("example boards", "every example board actually has the tags its template claims");
  });

  it("parses every hero AND villain range as real notation", () => {
    // No exemptions. A range that is prose rather than notation is a
    // correctness bug: the spot generator samples hero hands from it, and an
    // unparseable villain range silently becomes whatever the fallback is.
    for (const template of templates) {
      expect(() => Range.parse(template.heroRange), `${template.id} heroRange`).not.toThrow();
      expect(() => Range.parse(template.villainRange), `${template.id} villainRange`).not.toThrow();
      expect(Range.parse(template.heroRange).totalCombos()).toBeGreaterThan(0);
      expect(Range.parse(template.villainRange).totalCombos()).toBeGreaterThan(0);
    }
    record("ranges parse", "all 16 hero and villain ranges are real notation, no exemptions");
  });
});

// ── Poker sanity, reported as a table ─────────────────────────────────────────

describe("poker sanity", () => {
  it("raises EV with strength WITHIN the made-hand classes", () => {
    // Deliberately not asserted across all classes: draws routinely out-earn
    // weak made hands, which is what semi-bluffing IS. Asserting global
    // monotonicity would be asserting something false about poker.
    const violations: string[] = [];
    const rows: string[] = [];

    // HAND_CLASSES is a PRECEDENCE order for classification, and on one
    // adjacent pair it disagrees with strength: it ranks bottom_pair above
    // pocket_pair_below_top, but on A72 a pocket pair of nines beats a pair of
    // deuces every time. Treating those two as one tier keeps the check honest
    // rather than forcing the data to assert something false about poker.
    const TIED = new Set<string>(["bottom_pair", "pocket_pair_below_top"]);
    const strength = (handClass: string) =>
      TIED.has(handClass) ? handClassRank("bottom_pair") : handClassRank(handClass as HandClass);

    for (const template of templates) {
      const made = template.strategies
        .filter((s) => isMadeHand(s.handClass as HandClass))
        .sort((a, b) => strength(a.handClass) - strength(b.handClass));

      const values = made.map((entry) => ({
        handClass: entry.handClass,
        ev: entry.ev[postflopBestAction(template, entry.handClass)] ?? 0,
      }));

      for (let i = 1; i < values.length; i++) {
        const stronger = values[i - 1]!;
        const weaker = values[i]!;
        if (strength(stronger.handClass) === strength(weaker.handClass)) continue;
        if (weaker.ev > stronger.ev + 1e-9) {
          violations.push(
            `${template.id}: ${weaker.handClass} (${weaker.ev.toFixed(2)}) > ${stronger.handClass} (${stronger.ev.toFixed(2)})`,
          );
        }
      }
      rows.push(`  ${template.id.padEnd(40)} ${values.map((v) => v.ev.toFixed(1)).join(" ≥ ")}`);
    }

    console.log(`\nmade-hand EV by strength (strongest first):\n${rows.join("\n")}`);
    if (violations.length > 0) console.error(violations.join("\n"));
    expect(violations).toEqual([]);
    record("made-hand EV monotonicity", `holds in all ${templates.length} templates`);
  });

  it("never folds the strongest made hand", () => {
    const violations: string[] = [];
    for (const template of templates) {
      const made = template.strategies
        .filter((s) => isMadeHand(s.handClass as HandClass))
        .sort(
          (a, b) =>
            handClassRank(a.handClass as HandClass) - handClassRank(b.handClass as HandClass),
        );
      const strongest = made[0];
      if (strongest === undefined) continue;
      if (postflopBestAction(template, strongest.handClass) === "fold") {
        violations.push(`${template.id}: ${strongest.handClass} folds`);
      }
    }
    expect(violations).toEqual([]);
    record("strongest hand never folds", "checked in all 8 templates");
  });

  it("never value-bets air on the river", () => {
    const violations: string[] = [];
    for (const template of templates) {
      if (template.street !== "river") continue;
      const air = getPostflopStrategy(template, "air");
      if (air === undefined) continue;
      const best = postflopBestAction(template, "air");
      if (best.startsWith("bet_") || best === "raise_pot" || best === "allin") {
        violations.push(`${template.id}: air's best action is ${best}`);
      }
    }
    expect(violations).toEqual([]);
    const riverTemplates = templates.filter((t) => t.street === "river").length;
    record("air never value-bets a river", `${riverTemplates} river template(s) checked`);
  });

  it("bets more often on a dry board than a wet one with the same range", () => {
    const dry = templates.find((t) => t.id === "srp-btn-cbet-ace-high-dry");
    const wet = templates.find((t) => t.id === "srp-btn-cbet-wet-two-tone");
    expect(dry).toBeDefined();
    expect(wet).toBeDefined();

    const betFrequency = (template: PostflopTemplate) => {
      const entries = template.strategies;
      const total = entries.reduce(
        (sum, e) =>
          sum +
          Object.entries(e.strategy)
            .filter(([action]) => action.startsWith("bet_"))
            .reduce((s, [, f]) => s + f, 0),
        0,
      );
      return total / entries.length;
    };

    const dryFrequency = betFrequency(dry!);
    const wetFrequency = betFrequency(wet!);
    console.log(
      `\nc-bet frequency: dry ace-high ${(dryFrequency * 100).toFixed(0)}%, wet two-tone ${(wetFrequency * 100).toFixed(0)}%`,
    );
    expect(dryFrequency).toBeGreaterThan(wetFrequency);
    record(
      "texture drives c-bet frequency",
      `dry ${(dryFrequency * 100).toFixed(0)}% > wet ${(wetFrequency * 100).toFixed(0)}%`,
    );
  });

  it("folds more of the weak range to a bigger bet", () => {
    const small = templates.find((t) => t.id === "srp-bb-vs-33-cbet-ace-high-dry");
    const big = templates.find((t) => t.id === "srp-bb-vs-66-cbet-wet");
    const foldFrequency = (template: PostflopTemplate) =>
      template.strategies.reduce((sum, e) => sum + (e.strategy.fold ?? 0), 0) /
      template.strategies.length;
    expect(foldFrequency(big!)).toBeGreaterThan(foldFrequency(small!));
    record(
      "bet size drives folding",
      `vs 66% folds ${(foldFrequency(big!) * 100).toFixed(0)}%, vs 33% folds ${(foldFrequency(small!) * 100).toFixed(0)}%`,
    );
  });
});

describe("query helpers", () => {
  it("never reports a negative EV loss", () => {
    for (const template of templates) {
      for (const entry of template.strategies) {
        for (const action of template.actions) {
          expect(postflopEvLoss(template, entry.handClass, action)).toBeGreaterThanOrEqual(0);
        }
        expect(
          postflopEvLoss(template, entry.handClass, postflopBestAction(template, entry.handClass)),
        ).toBe(0);
      }
    }
    record("ev loss non-negative", "every hand class × action in all 8 templates");
  });

  it("throws for a hand class the template does not cover", () => {
    expect(() => postflopBestAction(templates[0]!, "quads")).toThrow(/no strategy/);
  });
});

describe("summary", () => {
  it("prints the pass/fail table", () => {
    const width = Math.max(...results.map(([check]) => check.length));
    const table = results.map(([check, detail]) => `  PASS  ${check.padEnd(width)}  ${detail}`);
    console.log(`\n2.5 — postflop strategy templates\n${table.join("\n")}\n`);
    expect(results.length).toBeGreaterThan(0);
  });
});
