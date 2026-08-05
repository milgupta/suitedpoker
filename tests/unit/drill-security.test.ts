/**
 * THE SECURITY BOUNDARY OF THE PRODUCT.
 *
 * If the client can obtain the answer before it acts, the product is worthless.
 * These checks are STRUCTURAL, not substring matches — searching a response for
 * "ev" matches "level", "seven" and half of every uuid, and a test like that
 * passes forever while proving nothing.
 *
 * The four checks:
 *   a. Walk the ClientSpot recursively; the key set must be exactly the
 *      allowlist.
 *   b. Collect every number in the node's strategy and EV tables and assert
 *      none appears anywhere in the serialised payload.
 *   c. Assert nodeRef is absent.
 *   d. (The rendered-props half runs in tests/e2e/drill.spec.ts, against the
 *      real HTTP response and the real page.)
 */

import { describe, expect, it } from "vitest";
import { generateSpot, toClientSpot, type Spot } from "../../src/poker/generator";
import { parsePreflopNode, nodeRefOf, type PreflopNode } from "../../src/poker/solutions";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "src/content/solutions/preflop");

function loadNodes(): PreflopNode[] {
  return readdirSync(ROOT)
    .filter((f) => f.endsWith(".json"))
    .map((f) => parsePreflopNode(JSON.parse(readFileSync(join(ROOT, f), "utf8")), f));
}

const NODES = loadNodes();
const DATA = { preflop: NODES, postflop: [] };

/** Exactly the keys a ClientSpot may carry. Anything else is a leak. */
const ALLOWED_KEYS = new Set([
  "id",
  "type",
  "heroPos",
  "heroCards",
  "board",
  "potBb",
  "effStackBb",
  "actionHistory",
  "legalActions",
  "seats",
  "difficulty",
  // SeatView
  "seat",
  "position",
  "stackBb",
  "isHero",
]);

function collectKeys(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
    return into;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      collectKeys(child, into);
    }
  }
  return into;
}

function collectNumbers(value: unknown, into: number[] = []): number[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, into);
    return into;
  }
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) collectNumbers(child, into);
    return into;
  }
  if (typeof value === "number") into.push(value);
  return into;
}

function spotsForEveryNode(): { spot: Spot; node: PreflopNode }[] {
  const out: { spot: Spot; node: PreflopNode }[] = [];
  for (let i = 0; i < 120; i++) {
    const spot = generateSpot({ type: "preflop" }, DATA, `security-${i}`);
    const node = NODES.find((n) => nodeRefOf(n.heroPos, n.actionSeq) === spot.nodeRef);
    if (node !== undefined) out.push({ spot, node });
  }
  return out;
}

const SAMPLES = spotsForEveryNode();

describe("the ClientSpot payload", () => {
  it("draws from a real solution set", () => {
    expect(NODES.length).toBeGreaterThan(20);
    expect(SAMPLES.length).toBeGreaterThan(50);
  });

  it("(a) contains ONLY allowlisted keys, recursively", () => {
    const offenders = new Set<string>();

    for (const { spot } of SAMPLES) {
      for (const key of collectKeys(toClientSpot(spot))) {
        if (!ALLOWED_KEYS.has(key)) offenders.add(key);
      }
    }

    expect([...offenders], `unexpected keys in ClientSpot: ${[...offenders].join(", ")}`).toEqual(
      [],
    );
  });

  it("(c) never contains nodeRef, handKey, handClass or seed", () => {
    for (const { spot } of SAMPLES) {
      const keys = collectKeys(toClientSpot(spot));
      for (const forbidden of ["nodeRef", "handKey", "handClass", "seed"]) {
        expect(keys.has(forbidden), `${forbidden} leaked into ClientSpot`).toBe(false);
      }
    }
  });

  it("(b) contains NONE of the node's strategy or EV numbers", () => {
    const failures: string[] = [];

    for (const { spot, node } of SAMPLES) {
      const client = toClientSpot(spot);
      const serialised = JSON.stringify(client);

      /**
       * Every distinct number in the strategy and EV tables — narrowed to the
       * ones that would actually be evidence.
       *
       * A whole number like 7 or 11 collides constantly with legitimate game
       * quantities: a 7bb pot, an 11bb stack, seat 4, difficulty 9. Flagging
       * those makes the test fail on coincidence and teaches everyone to
       * ignore it, which is worse than not having it.
       *
       * Every chip quantity in this game is a multiple of half a big blind —
       * a 1.5bb pot, a 2.5bb open, a 0.5bb small blind. Those collide with EV
       * values by arithmetic, not by leaking.
       *
       * What cannot be a chip quantity is an arbitrary decimal: a frequency of
       * 0.62 or an EV of 2.14. Those are the values that would be evidence, so
       * those are what this looks for.
       *
       * The real proof is the KEY ALLOWLIST above — this is the belt to its
       * braces, and it is narrow on purpose rather than noisy and ignored.
       */
      const isChipQuantity = (n: number): boolean => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;

      const secrets = new Set(
        [...collectNumbers(node.strategy), ...collectNumbers(node.ev)].filter(
          (n) => n !== 0 && !isChipQuantity(n),
        ),
      );

      const payloadNumbers = new Set(collectNumbers(client));

      for (const secret of secrets) {
        if (payloadNumbers.has(secret)) {
          failures.push(`${spot.nodeRef}: ${secret} appears in the payload`);
        }
        // Also as a substring, which catches a value smuggled inside a string.
        if (serialised.includes(String(secret))) {
          failures.push(`${spot.nodeRef}: ${secret} appears in the serialised payload`);
        }
      }
    }

    expect(failures.slice(0, 10), failures.slice(0, 10).join("\n")).toEqual([]);
  });

  it("has a meaningful number of fractional secrets to look for", () => {
    // Guards the narrowing above: if the solution files ever became all-integer,
    // the numeric check would silently have nothing to test.
    let discriminating = 0;
    for (const node of NODES) {
      discriminating += [...collectNumbers(node.strategy), ...collectNumbers(node.ev)].filter(
        (n) => n !== 0 && Math.abs(n * 2 - Math.round(n * 2)) >= 1e-9,
      ).length;
    }
    expect(discriminating, "nothing left to look for — the check is vacuous").toBeGreaterThan(100);
  });

  it("keeps legalActions without revealing which one is best", () => {
    // The client needs the buttons. It must not be able to infer the answer
    // from their order, so assert the order is the node's declared order rather
    // than anything EV-sorted.
    for (const { spot, node } of SAMPLES.slice(0, 20)) {
      expect(spot.legalActions).toEqual([...node.actions]);
    }
  });
});

describe("the full Spot, by contrast, does carry the answer", () => {
  it("proves the allowlist test is not vacuous", () => {
    // If toClientSpot were accidentally an identity function, the tests above
    // would still need to fail. This asserts the two really differ.
    const sample = SAMPLES[0];
    expect(sample).toBeDefined();
    if (sample === undefined) return;

    const full = collectKeys(sample.spot);
    expect(full.has("nodeRef")).toBe(true);
    expect(full.has("handKey")).toBe(true);
    expect(full.has("seed")).toBe(true);
  });
});
