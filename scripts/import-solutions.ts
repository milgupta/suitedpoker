/**
 * Validates and imports the authored solution set.
 *
 *   npx tsx scripts/import-solutions.ts --check     validate only, no database
 *   npx tsx scripts/import-solutions.ts             validate then upsert
 *
 * Validation runs first and to completion. Nothing is written unless EVERY file
 * passes, because a half-imported solution set is worse than none: the drill
 * layer cannot tell a missing node from a node that was never authored, and it
 * would happily serve the stale half.
 *
 * Idempotent. Keyed on (solution_set_id, hero_pos, action_seq), which is the
 * unique index the schema already defines, so a re-run updates in place.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

import {
  parsePostflopTemplate,
  parsePreflopNode,
  type PostflopTemplate,
  type PreflopNode,
  rankByReviewRisk,
  validatePostflopTemplate,
  validatePreflopNode,
} from "../src/poker/solutions";

loadEnvConfig(process.cwd());

const PREFLOP_DIR = resolve(process.cwd(), "src/content/solutions/preflop");
const POSTFLOP_DIR = resolve(process.cwd(), "src/content/solutions/postflop");
const SOLUTION_SET = {
  name: "suitedpoker-6max-100bb-v1",
  version: "1",
  game: "nlhe",
  tableSize: 6,
  stackDepthBb: 100,
  rakeModel: "none",
  source: "authored-approximation from published solver-derived charts",
};

const checkOnly = process.argv.includes("--check");

function readNodeFiles(dir = PREFLOP_DIR): Array<{ source: string; json: unknown }> {
  const names = readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort();
  return names.map((name) => {
    const path = join(dir, name);
    try {
      return { source: name, json: JSON.parse(readFileSync(path, "utf8")) as unknown };
    } catch (error) {
      throw new SyntaxError(`${name} is not parseable JSON: ${(error as Error).message}`);
    }
  });
}

function validateAll(files: ReturnType<typeof readNodeFiles>): PreflopNode[] {
  const failures: string[] = [];
  const nodes: PreflopNode[] = [];

  for (const { source, json } of files) {
    const result = validatePreflopNode(json, source);
    if (!result.ok) {
      // Cap the per-file output: a file missing every hand produces 169
      // identical-looking lines and buries the one that matters.
      const shown = result.errors.slice(0, 8);
      const extra = result.errors.length - shown.length;
      failures.push(
        `✗ ${source}\n${shown.map((e) => `    ${e}`).join("\n")}` +
          (extra > 0 ? `\n    … and ${extra} more` : ""),
      );
      continue;
    }
    nodes.push(parsePreflopNode(json, source));
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} file(s) failed validation:\n`);
    console.error(failures.join("\n\n"));
    console.error(`\nNothing was imported.\n`);
    process.exit(1);
  }

  const refs = new Set<string>();
  for (const node of nodes) {
    if (refs.has(node.ref)) {
      console.error(`✗ duplicate node ref ${node.ref} — two files claim the same node`);
      process.exit(1);
    }
    refs.add(node.ref);
  }

  return nodes;
}

function validateTemplates(files: ReturnType<typeof readNodeFiles>): PostflopTemplate[] {
  const failures: string[] = [];
  const templates: PostflopTemplate[] = [];

  for (const { source, json } of files) {
    const result = validatePostflopTemplate(json, source);
    if (!result.ok) {
      const shown = result.errors.slice(0, 8);
      const extra = result.errors.length - shown.length;
      failures.push(
        `\u2717 ${source}\n${shown.map((e) => `    ${e}`).join("\n")}` +
          (extra > 0 ? `\n    \u2026 and ${extra} more` : ""),
      );
      continue;
    }
    templates.push(parsePostflopTemplate(json, source));
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} postflop template(s) failed validation:\n`);
    console.error(failures.join("\n\n"));
    console.error(`\nNothing was imported.\n`);
    process.exit(1);
  }

  const ids = new Set<string>();
  for (const template of templates) {
    if (ids.has(template.id)) {
      console.error(`\u2717 duplicate template id ${template.id}`);
      process.exit(1);
    }
    ids.add(template.id);
  }

  return templates;
}

function report(nodes: PreflopNode[]): void {
  console.log(`✓ ${nodes.length} nodes validated, all 169 hands present in each`);

  const byProvenance = new Map<string, number>();
  for (const node of nodes) {
    byProvenance.set(node.provenance, (byProvenance.get(node.provenance) ?? 0) + 1);
  }
  for (const [provenance, count] of byProvenance) {
    console.log(`  ${provenance}: ${count}`);
  }

  const risky = rankByReviewRisk(nodes).filter((r) => r.score > 0);
  if (risky.length > 0) {
    console.log(`\nHighest review risk (${risky.length} node(s) below full confidence):`);
    for (const { ref, score, drivers } of risky.slice(0, 12)) {
      console.log(`  ${String(score).padStart(2)}  ${ref.padEnd(20)} ${drivers.join(", ")}`);
    }
    if (risky.length > 12) console.log(`  … and ${risky.length - 12} more`);
  }
}

const PROVENANCE_DDL = `
ALTER TABLE preflop_nodes
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'authored-approximation';
`.trim();

async function importAll(nodes: PreflopNode[], templates: PostflopTemplate[]): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    console.error("\nDATABASE_URL is not set. Run with --check to validate without a database.\n");
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false });
  try {
    // provenance lives in Track A's schema. Fail loudly rather than dropping it
    // on the floor — silently importing without it is how the UI ends up
    // claiming solver-verified data it does not have.
    const [column] = await sql`
      SELECT 1 AS present FROM information_schema.columns
      WHERE table_name = 'preflop_nodes' AND column_name = 'provenance'
    `;
    if (column === undefined) {
      console.error(
        `\n✗ preflop_nodes has no provenance column, and every node carries one.\n` +
          `  Nothing was imported. Add it on main:\n\n${PROVENANCE_DDL}\n\n` +
          `  and mirror it in src/db/schema.ts as:\n` +
          `    provenance: text("provenance").notNull(),\n`,
      );
      process.exit(1);
    }

    const [set] = await sql`
      INSERT INTO solution_sets (name, version, game, table_size, stack_depth_bb, rake_model, source, is_active)
      VALUES (${SOLUTION_SET.name}, ${SOLUTION_SET.version}, ${SOLUTION_SET.game},
              ${SOLUTION_SET.tableSize}, ${SOLUTION_SET.stackDepthBb},
              ${SOLUTION_SET.rakeModel}, ${SOLUTION_SET.source}, true)
      ON CONFLICT (name, version) DO UPDATE SET source = EXCLUDED.source
      RETURNING id
    `;
    const solutionSetId = (set as { id: string } | undefined)?.id;
    if (solutionSetId === undefined) throw new Error("could not upsert the solution set");

    let inserted = 0;
    for (const node of nodes) {
      await sql`
        INSERT INTO preflop_nodes (solution_set_id, hero_pos, action_seq, strategy, ev, provenance)
        VALUES (${solutionSetId}, ${node.heroPos}, ${node.actionSeq},
                ${sql.json(node.strategy)}, ${sql.json(node.ev)}, ${node.provenance})
        ON CONFLICT (solution_set_id, hero_pos, action_seq) DO UPDATE
          SET strategy = EXCLUDED.strategy,
              ev = EXCLUDED.ev,
              provenance = EXCLUDED.provenance
      `;
      inserted++;
    }
    console.log(`\n✓ upserted ${inserted} nodes into solution set ${solutionSetId}`);
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  const files = readNodeFiles();
  if (files.length === 0) {
    console.error(`✗ no JSON files found in ${PREFLOP_DIR}`);
    process.exit(1);
  }
  const nodes = validateAll(files);
  report(nodes);

  const templates = validateTemplates(readNodeFiles(POSTFLOP_DIR));
  console.log(`\u2713 ${templates.length} postflop templates validated`);
  for (const template of templates) {
    console.log(`  ${template.id.padEnd(40)} ${template.strategies.length} hand classes`);
  }

  if (checkOnly) {
    console.log(`\n--check: validated only, nothing written.`);
    return;
  }
  await importAll(nodes, templates);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
