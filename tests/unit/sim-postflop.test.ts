/**
 * Postflop grading in the table sim, and the one-strategy-standard rules
 * around it.
 *
 * Three claims are on trial:
 *
 *   HONESTY — every hero decision grading looked at is either graded against
 *   a served template or carries a WRITTEN reason it was not. "Silently
 *   skipped" is the failure state, and so is "guessed".
 *
 *   ONE STANDARD — bots on a quarantined preflop line consult the released
 *   representative of the same family, never a node that does not exist and
 *   never data the hero could not be graded against.
 *
 *   DEPTH — 40bb and 200bb sessions are play-mode. The strategy set is
 *   calibrated at 100bb, so off-depth sessions carry no grades at all.
 */

import { describe, expect, it } from "vitest";
import {
  applyHeroAction,
  createLiveSession,
  dealNextHand,
  heroLegalActions,
  mapPostflopAction,
  matchPostflopTemplate,
  QUARANTINE_FALLBACKS,
} from "../../src/lib/sim-server";
import { loadSolutionData } from "../../src/lib/solution-data";
import { isServableNode, QUARANTINED_NODES } from "../../src/poker/node-status";
import { nodeRefOf, type PostflopTemplate } from "../../src/poker/solutions";
import { boardTexture } from "../../src/poker/handclass";
import { cardsFromString } from "../../src/poker/cards";
import type { Action, GameState } from "../../src/poker/gamestate";
import type { LiveSimState, SimDecision } from "../../src/lib/sim";

const DATA = loadSolutionData();
const TEMPLATES = DATA.postflop;
const TEMPLATE_IDS = new Set(TEMPLATES.map((t) => t.id));
const SERVED_PREFLOP_REFS = new Set(DATA.preflop.map((n) => nodeRefOf(n.heroPos, n.actionSeq)));

/* ── The quarantine → representative mapping ─────────────────────────────── */

describe("QUARANTINE_FALLBACKS", () => {
  it("maps EVERY quarantined ref to a servable ref that exists on disk", () => {
    for (const { ref } of QUARANTINED_NODES) {
      const target = QUARANTINE_FALLBACKS[ref];
      expect(
        target,
        `${ref} has no fallback — bots fall back to pure archetype play`,
      ).toBeDefined();
      expect(isServableNode(target!), `${ref} maps to ${target}, which is quarantined`).toBe(true);
      expect(
        SERVED_PREFLOP_REFS.has(target!),
        `${ref} maps to ${target}, which is not in the served set`,
      ).toBe(true);
    }
  });

  it("contains no stale keys — every key is genuinely quarantined", () => {
    const quarantined = new Set(QUARANTINED_NODES.map((n) => n.ref));
    for (const key of Object.keys(QUARANTINE_FALLBACKS)) {
      expect(quarantined.has(key), `${key} is in the map but is not quarantined`).toBe(true);
    }
  });

  it("keeps the family: a vs_3bet ref maps to vs_3bet, a vs_4bet to vs_4bet", () => {
    for (const [from, to] of Object.entries(QUARANTINE_FALLBACKS)) {
      const family = (ref: string) => (ref.includes("vs_4bet") ? "vs_4bet" : "vs_3bet");
      expect(family(to), `${from} → ${to} crosses template families`).toBe(family(from));
    }
  });
});

/* ── Template matching ───────────────────────────────────────────────────── */

function tagsOf(board: string) {
  return boardTexture(cardsFromString(board));
}

describe("matchPostflopTemplate", () => {
  it("finds the BTN dry-ace c-bet template for its own example board", () => {
    const template = matchPostflopTemplate(
      TEMPLATES,
      "flop",
      "BTN",
      tagsOf("Ah 7d 2c"),
      false,
      5.5,
    );
    expect(template?.id).toBe("srp-btn-cbet-ace-high-dry");
  });

  it("matches every template on its own example boards and parameters", () => {
    // The weakest self-consistency bar there is: a template that cannot match
    // the exact situation it documents can never fire at all.
    for (const template of TEMPLATES) {
      const facingBet = template.actions.includes("fold");
      for (const board of template.exampleBoards) {
        const found = matchPostflopTemplate(
          TEMPLATES,
          template.street,
          template.heroPos,
          tagsOf(board),
          facingBet,
          template.potBb,
        );
        expect(found, `${template.id} does not match its own board ${board}`).not.toBeNull();
        // Another template of the same family may win the tie, but the match
        // must at least agree on street and position.
        expect(found!.street).toBe(template.street);
        expect(found!.heroPos).toBe(template.heroPos);
      }
    }
  });

  it("refuses a 3-bet-pot template for a single-raised pot, and vice versa", () => {
    // threebet-pot-broadway-flop is authored at a 22bb pot. A 5.5bb pot on
    // the same board must not borrow it — its EVs are in the wrong currency.
    const srp = matchPostflopTemplate(TEMPLATES, "flop", "BB", tagsOf("Kh Qd 7c"), false, 5.5);
    expect(srp?.id).not.toBe("threebet-pot-broadway-flop");

    const threeBet = matchPostflopTemplate(TEMPLATES, "flop", "BB", tagsOf("Kh Qd 7c"), false, 22);
    expect(threeBet?.id).toBe("threebet-pot-broadway-flop");
  });

  it("separates facing-a-bet from checked-to decisions", () => {
    const tags = tagsOf("Ah 7d 2c");
    const facing = matchPostflopTemplate(TEMPLATES, "flop", "BB", tags, true, 7.3);
    expect(facing).not.toBeNull();
    expect(facing!.actions).toContain("fold");

    // BB first to act in an SRP has no checked-to template — that is honest,
    // not a gap to paper over with the facing-bet one.
    const firstIn = matchPostflopTemplate(TEMPLATES, "flop", "BB", tags, false, 5.5);
    expect(firstIn).toBeNull();
  });

  it("returns null rather than stretching across streets or positions", () => {
    expect(matchPostflopTemplate(TEMPLATES, "river", "MP", tagsOf("Ah 7d 2c"), false, 5.5)).toBe(
      null,
    );
    expect(matchPostflopTemplate(TEMPLATES, "flop", "SB", tagsOf("Ah 7d 2c"), false, 5.5)).toBe(
      null,
    );
  });

  it("is deterministic when several templates cover the same spot", () => {
    const tags = tagsOf("9h 8h 7c");
    const first = matchPostflopTemplate(TEMPLATES, "flop", "BTN", tags, false, 5.5);
    const second = matchPostflopTemplate([...TEMPLATES].reverse(), "flop", "BTN", tags, false, 5.5);
    expect(first?.id).toBe(second?.id);
  });
});

/* ── Action mapping ──────────────────────────────────────────────────────── */

describe("mapPostflopAction", () => {
  const cbet = TEMPLATES.find((t) => t.id === "srp-btn-cbet-ace-high-dry")!;
  const facing = TEMPLATES.find((t) => t.id === "srp-bb-vs-33-cbet-ace-high-dry")!;
  const pot = 11; // chips (5.5bb)

  const bet = (amount: number): Action => ({ type: "bet", amount });

  it("maps bet sizes to the nearest modelled bucket", () => {
    expect(mapPostflopAction(bet(4), cbet, pot, 0, 195)).toBe("bet_33"); // 36%
    expect(mapPostflopAction(bet(7), cbet, pot, 0, 195)).toBe("bet_66"); // 64%
    expect(mapPostflopAction(bet(11), cbet, pot, 0, 195)).toBe("bet_100"); // 100%
  });

  it("refuses sizes no bucket honestly describes", () => {
    // A 2x-pot overbet is not "bet_100"; a 1/8-pot blocker is not "bet_33".
    expect(mapPostflopAction(bet(22), cbet, pot, 0, 195)).toBeNull();
    expect(mapPostflopAction(bet(1), cbet, pot, 0, 195)).toBeNull();
  });

  it("maps the passive actions only when the template prices them", () => {
    expect(mapPostflopAction({ type: "check" }, cbet, pot, 0, 195)).toBe("check");
    expect(mapPostflopAction({ type: "fold" }, cbet, pot, 0, 195)).toBeNull();
    expect(mapPostflopAction({ type: "fold" }, facing, pot, 4, 195)).toBe("fold");
    expect(mapPostflopAction({ type: "call", amount: 4 }, facing, pot, 4, 195)).toBe("call");
  });

  it("maps raises by size, and a shove to allin only where modelled", () => {
    // facing a 4-chip bet: raise to 11 is small, a shove is allin.
    expect(mapPostflopAction({ type: "raise", amount: 11 }, facing, 15, 4, 195)).toBe(
      "raise_small",
    );
    expect(mapPostflopAction({ type: "raise", amount: 195 }, facing, 15, 4, 195)).toBe("allin");

    const checkraise = TEMPLATES.find((t) => t.id === "srp-bb-checkraise-dry-ace")!;
    expect(mapPostflopAction({ type: "raise", amount: 11 }, checkraise, 15, 4, 195)).toBe(
      "raise_small",
    );
    expect(mapPostflopAction({ type: "raise", amount: 20 }, checkraise, 15, 4, 195)).toBe(
      "raise_pot",
    );
  });
});

/* ── Sessions: decisions are recorded, graded or honestly not ────────────── */

/** Checks when free, calls small bets, c-bets a third of the pot otherwise. */
function activeHero(live: LiveSimState): Action {
  const legal = heroLegalActions(live);
  const game = live.game as GameState;

  if (game.street !== "preflop") {
    const bet = legal.find((a) => a.type === "bet");
    if (bet !== undefined && bet.min !== undefined && bet.max !== undefined) {
      const third = Math.max(bet.min, Math.min(bet.max, Math.round(game.pot / 3)));
      return { type: "bet", amount: third };
    }
  }

  const check = legal.find((a) => a.type === "check");
  if (check !== undefined) return { type: "check" };

  const call = legal.find((a) => a.type === "call");
  const hero = game.players[live.heroSeat];
  if (call?.amount !== undefined && hero !== undefined) {
    if (call.amount <= (hero.stack + hero.committedThisStreet) / 4) {
      return { type: "call", amount: call.amount };
    }
  }
  const fold = legal.find((a) => a.type === "fold");
  if (fold !== undefined) return { type: "fold" };
  return call !== undefined ? { type: "call", amount: call.amount } : { type: "check" };
}

function playSession(
  seed: string,
  totalHands: number,
  stackBb: number,
  policy: (live: LiveSimState) => Action,
): LiveSimState {
  let live = createLiveSession({ presetId: "cardroom", totalHands, stackBb, seed });
  let guard = 0;
  while (!live.ended) {
    if (++guard > 5_000) throw new Error("session did not end");
    if (live.game === null || live.game.complete) {
      live = dealNextHand(live, seed);
      continue;
    }
    const result = applyHeroAction(live, policy(live), seed);
    if (!result.ok) throw new Error(result.error);
    live = result.live;
  }
  return live;
}

describe("a 100bb session records every considered decision", () => {
  const live = playSession("postflop-grading", 60, 100, activeHero);
  const decisions: SimDecision[] = live.records.flatMap((r) => [...(r.decisions ?? [])]);

  it("stores a decisions list on every record", () => {
    for (const record of live.records) {
      expect(record.decisions, `hand ${record.handNumber} has no decisions list`).toBeDefined();
    }
  });

  it("every decision is graded or carries a written reason — never both, never neither", () => {
    expect(decisions.length).toBeGreaterThan(20);
    for (const d of decisions) {
      if (d.graded) {
        expect(d.evLoss).not.toBeNull();
        expect(d.grade).not.toBeNull();
        expect(d.best, "a graded decision must store its best action").not.toBeNull();
        expect(d.nodeRef).not.toBeNull();
        expect(d.reason).toBeNull();
      } else {
        expect(d.reason, `ungraded ${d.street} decision has no reason`).not.toBeNull();
        expect(d.reason!.length).toBeGreaterThan(10);
        expect(d.evLoss).toBeNull();
        expect(d.grade).toBeNull();
      }
    }
  });

  it("graded postflop decisions exist and cite a real served template", () => {
    const postflop = decisions.filter((d) => d.street !== "preflop" && d.graded);
    expect(postflop.length, "no postflop decision was ever graded").toBeGreaterThan(0);
    for (const d of postflop) {
      expect(TEMPLATE_IDS.has(d.nodeRef!), `${d.nodeRef} is not a served template`).toBe(true);
      const template = TEMPLATES.find((t) => t.id === d.nodeRef) as PostflopTemplate;
      expect(template.actions).toContain(d.chosen);
      expect(template.actions).toContain(d.best);
    }
    console.log(
      `DECISIONS: ${decisions.length} total · ${decisions.filter((d) => d.graded).length} graded · ` +
        `${postflop.length} postflop graded · ` +
        `${decisions.filter((d) => !d.graded).length} ungraded with reasons`,
    );
  });

  it("ungraded postflop decisions name their reason", () => {
    const reasons = new Set(
      decisions.filter((d) => d.street !== "preflop" && !d.graded).map((d) => d.reason),
    );
    for (const reason of reasons) console.log(`UNGRADED REASON: ${reason}`);
    for (const reason of reasons) {
      expect(reason).toMatch(/not|no served|template/i);
    }
  });
});

describe("the big blind check is honestly ungraded", () => {
  it("marks a BB option check as ungraded instead of grading it as a call", () => {
    // Fold everything except a free check: every unraised BB hand ends in a
    // check of the option, which no node models.
    const passive = (live: LiveSimState): Action => {
      const legal = heroLegalActions(live);
      const check = legal.find((a) => a.type === "check");
      if (check !== undefined) return { type: "check" };
      return { type: "fold" };
    };
    const live = playSession("bb-check-honesty", 100, 100, passive);

    const bbChecks = live.records.flatMap((r) =>
      [...(r.decisions ?? [])].filter((d) => d.street === "preflop" && d.chosen === "check"),
    );
    expect(bbChecks.length, "no BB option check occurred in 100 hands").toBeGreaterThan(0);
    for (const d of bbChecks) {
      expect(d.graded).toBe(false);
      expect(d.reason).toContain("big blind");
    }

    // And the legacy record fields agree: a check is not a graded call.
    for (const record of live.records) {
      const first = record.decisions?.[0];
      if (first?.chosen === "check" && first.street === "preflop") {
        expect(record.grade).toBeNull();
        expect(record.heroEvLoss).toBeNull();
      }
    }
  });
});

/* ── Depth gating ────────────────────────────────────────────────────────── */

describe("off-depth sessions are play-mode", () => {
  for (const depth of [40, 200]) {
    it(`grades NOTHING at ${depth}bb — the set is calibrated at 100bb`, () => {
      const live = playSession(`depth-${depth}`, 25, depth, activeHero);
      expect(live.records.length).toBe(25);
      for (const record of live.records) {
        expect(record.grade, `hand ${record.handNumber} was graded at ${depth}bb`).toBeNull();
        expect(record.heroEvLoss).toBeNull();
        expect(record.decisions ?? []).toHaveLength(0);
      }
    });
  }

  it("still deals, plays and settles normally at 40bb and 200bb", () => {
    for (const depth of [40, 200]) {
      const live = playSession(`depth-sanity-${depth}`, 10, depth, activeHero);
      expect(live.ended).toBe(true);
      const summed = live.records.reduce((sum, r) => sum + r.netBb, 0);
      expect(live.netBbTotal).toBeCloseTo(summed, 3);
    }
  });
});
