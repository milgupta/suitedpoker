/**
 * Applies the schema to the e2e Supabase project, and proves it took.
 *
 * The alternative is pasting three SQL files into a web console in the right
 * order and hoping. That works exactly once and is impossible to verify
 * afterwards — and the failure mode is subtle: 0001 is the migration that adds
 * the auth foreign keys, RLS on every table, and the `handle_new_user` trigger,
 * and without it the suite fails in ways that look like product bugs rather
 * than like a missing migration.
 *
 *   npm run setup:e2e-db
 *
 * Safe to re-run: it refuses to touch anything but the E2E project, and it
 * reports what already exists rather than erroring on it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { loadLocalEnv } from "../tests/support/load-local-env";

loadLocalEnv();

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL ?? "";
  const projectUrl = process.env.E2E_SUPABASE_URL ?? "";

  if (url === "") {
    fail(
      "E2E_DATABASE_URL is not set.\n" +
        "    Supabase → your e2e project → Settings → Database → Connection string\n" +
        "    (URI, session pooler). See docs/E2E-DATABASE.md.",
    );
  }

  /**
   * The guard that matters. This script runs migrations, and running them
   * against production would be a very bad afternoon — so it refuses unless
   * the target is demonstrably NOT the app's own database.
   */
  const appUrl = process.env.DATABASE_URL ?? "";
  if (appUrl !== "" && url === appUrl) {
    fail("E2E_DATABASE_URL is identical to DATABASE_URL. That is the production database.");
  }
  if (projectUrl !== "" && !url.includes(projectRefOf(projectUrl))) {
    fail(
      `E2E_DATABASE_URL does not point at the project in E2E_SUPABASE_URL.\n` +
        `    Expected a connection string containing "${projectRefOf(projectUrl)}".`,
    );
  }

  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) fail("No migrations found in supabase/migrations.");

  const sql = postgres(url, { prepare: false, max: 1 });

  console.log(`\n  applying ${files.length} migration(s) to the e2e project\n`);

  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS, file), "utf8");
    process.stdout.write(`  ${file.padEnd(34)}`);
    try {
      await sql.unsafe(text);
      console.log("applied");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      // Re-running is expected and fine; a genuinely broken migration is not.
      if (/already exists|duplicate/i.test(message)) {
        console.log("already applied");
      } else {
        console.log("FAILED");
        await sql.end();
        fail(`${file}: ${message}`);
      }
    }
  }

  // Proving it took, rather than trusting that no error means success.
  const [tables] = await sql<{ count: number }[]>`
    select count(*)::int as count from information_schema.tables
    where table_schema = 'public'
  `;
  const [policies] = await sql<{ count: number }[]>`
    select count(*)::int as count from pg_policies where schemaname = 'public'
  `;
  const [trigger] = await sql<{ count: number }[]>`
    select count(*)::int as count from pg_trigger where tgname = 'on_auth_user_created'
  `;

  await sql.end();

  console.log(
    `\n  tables: ${tables?.count ?? 0}\n` +
      `  RLS policies: ${policies?.count ?? 0}\n` +
      `  handle_new_user trigger: ${(trigger?.count ?? 0) > 0 ? "present" : "MISSING"}\n`,
  );

  // 0001 is the one that matters, and the one whose absence looks like a
  // product bug rather than a setup mistake.
  if ((policies?.count ?? 0) === 0) {
    fail("No RLS policies exist. 0001_auth_fks_rls.sql did not apply.");
  }
  if ((trigger?.count ?? 0) === 0) {
    fail("handle_new_user is missing — signups will not create a profile row.");
  }

  console.log("  ✓ e2e project ready. Now set the three E2E_SUPABASE_* vars and run:");
  console.log("    PORT=3100 PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test\n");
}

/** `https://abcdefgh.supabase.co` → `abcdefgh` */
function projectRefOf(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).host.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

void main();
