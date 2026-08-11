/**
 * Display names for the sim's bots.
 *
 * The villains are a solved strategy, not characters — but a table where every
 * seat is only a position tag makes "MP 3-bets" read like a spreadsheet. A
 * plain first name per seat makes the action log legible ("Marcus 3-bets")
 * while the position tag stays on the seat, because a trainer never hides
 * positions. Names are deliberately ordinary: no puns, no poker references,
 * nothing that implies a skill level the archetype does not have.
 *
 * Pure and seeded: the same session seed always seats the same names, so a
 * refresh mid-session does not rename the table.
 */

import { createRng } from "@/poker/cards";

export const BOT_NAMES: readonly string[] = [
  "Alex",
  "Amara",
  "Andre",
  "Ben",
  "Bianca",
  "Carlos",
  "Chloe",
  "Chris",
  "Dana",
  "Derek",
  "Diego",
  "Elena",
  "Eli",
  "Emma",
  "Erik",
  "Felix",
  "Gina",
  "Grace",
  "Hana",
  "Henry",
  "Ivan",
  "Jade",
  "James",
  "Jonas",
  "Jordan",
  "Julia",
  "Kai",
  "Kara",
  "Leo",
  "Liam",
  "Lucia",
  "Marcus",
  "Maria",
  "Maya",
  "Mia",
  "Nadia",
  "Nate",
  "Nina",
  "Noah",
  "Omar",
  "Owen",
  "Priya",
  "Rosa",
  "Ryan",
  "Sam",
  "Sara",
  "Sofia",
  "Tara",
  "Tom",
  "Zoe",
];

/**
 * `count` distinct names for one table, deterministic in the seed.
 *
 * A partial Fisher–Yates over a copy: exactly `count` draws, no rejection
 * loop, and uniqueness by construction — two seats sharing a name would make
 * "Marcus raised" ambiguous, which is the whole thing names exist to prevent.
 */
export function botNamesFor(seed: string, count: number): string[] {
  if (count > BOT_NAMES.length) {
    throw new RangeError(`asked for ${count} names, have ${BOT_NAMES.length}`);
  }
  const rng = createRng(`${seed}:bot-names`);
  const pool = [...BOT_NAMES];
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const name = pool[j]!;
    pool[j] = pool[i]!;
    pool[i] = name;
    picked.push(name);
  }
  return picked;
}
