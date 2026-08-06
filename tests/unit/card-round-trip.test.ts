/**
 * `Card` is a branded number. Do not stringify one and parse it back.
 *
 * This bug has now shipped TWICE. 7.1 found the arena blank behind its error
 * boundary — `cardsFromString(cards.map(String).join(" "))` throwing
 * `not a card: "36"`. 9.1 found the identical line in the daily challenge,
 * throwing `not a card: "43"`, which had been blanking that whole page.
 *
 * Both times the surrounding tests passed, because a crashed page renders
 * nothing and "nothing" contains no leaked solution data. So this is a source
 * scan: the shape is trivially greppable and the failure is not.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("branded cards are never round-tripped through a string", () => {
  const files = walk(SRC);

  it("scans the source", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has no `.map(String)` feeding a card parser", () => {
    const offences: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");

      lines.forEach((line, index) => {
        // The exact shape that shipped twice, and anything close to it.
        if (/cardsFromString\([^)]*\.map\(String\)/.test(line)) {
          offences.push(
            `${relative(process.cwd(), file)}:${index + 1} — ${line.trim().slice(0, 90)}`,
          );
        }
        if (/cardsFromString\([^)]*(heroCards|holeCards)\b/.test(line)) {
          offences.push(
            `${relative(process.cwd(), file)}:${index + 1} — ${line.trim().slice(0, 90)}`,
          );
        }
      });
    }

    expect(
      offences,
      `Cards arrive already typed. Render them directly:\n${offences.join("\n")}`,
    ).toEqual([]);
  });
});
