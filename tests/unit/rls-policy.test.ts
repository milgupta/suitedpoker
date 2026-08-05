/**
 * A static audit of the RLS migration.
 *
 * The live cross-user test (tests/unit/rls.test.ts) is the real proof, but it
 * needs a database and therefore does not run in CI. This one runs everywhere
 * and catches the failure that actually happens in practice: someone adds a
 * user-scoped table and forgets its policies. A table with no policy and RLS
 * enabled denies everything, which fails loudly — but a table with RLS never
 * enabled is wide open and fails silently.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { READ_ONLY_TABLES, USER_SCOPED_TABLES } from "../../src/db/schema";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0001_auth_fks_rls.sql"),
  "utf8",
);
const schemaSource = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf8");

/** Every table name declared with pgTable in the schema. */
function declaredTables(): string[] {
  return [...schemaSource.matchAll(/pgTable\(\s*"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((n): n is string => n !== undefined);
}

describe("RLS coverage", () => {
  const tables = declaredTables();

  it("declares the 21 tables of the data model", () => {
    expect(tables.length).toBe(21);
  });

  it.each(tables)("enables row level security on %s", (table) => {
    // The enable statement is generated from an array literal in the migration,
    // so look for the table inside it rather than for a per-table statement.
    const enableBlock = migration.slice(
      migration.indexOf("-- ── Enable RLS everywhere"),
      migration.indexOf("-- ── User-scoped tables"),
    );
    expect(enableBlock).toContain(`'${table}'`);
  });

  it("keeps the user-scoped list in step with the tables that have a user_id", () => {
    // Any table with a userId column must be listed as user-scoped, or its
    // policies never get written.
    //
    // Split on the declaration boundary rather than trying to match a table's
    // closing punctuation — pgTable is called with one argument for some tables
    // and three for others, so no single terminator is correct.
    const withUserId = schemaSource
      .split(/\nexport const /)
      .map((block) => {
        const name = /^\w+ = pgTable\(\s*\n?\s*"([a-z_]+)"/.exec(block)?.[1];
        return name !== undefined && block.includes("userId: userId()") ? name : null;
      })
      .filter((n): n is string => n !== null);

    expect(new Set(withUserId)).toEqual(new Set(USER_SCOPED_TABLES));
  });
});

describe("user-scoped policies", () => {
  const policyBlock = migration.slice(
    migration.indexOf("-- ── User-scoped tables"),
    migration.indexOf("-- ── profiles: same rule"),
  );

  it.each(USER_SCOPED_TABLES)("covers %s", (table) => {
    expect(policyBlock).toContain(`'${table}'`);
  });

  it("scopes every one of them with auth.uid() = user_id", () => {
    expect(policyBlock).toContain("auth.uid() = user_id");
  });

  it("grants select, insert and update — and never delete", () => {
    expect(policyBlock).toContain("for select");
    expect(policyBlock).toContain("for insert");
    expect(policyBlock).toContain("for update");
    // A client that can delete its own drill_attempts can erase evidence of a
    // leak it dislikes, and the diagnosis is built on that history.
    expect(policyBlock).not.toContain("for delete");
  });

  it("has no DELETE policy anywhere in the migration", () => {
    expect(migration).not.toMatch(/for\s+delete/i);
  });
});

describe("profiles", () => {
  it("is scoped on id rather than user_id", () => {
    // profiles has no user_id column — its primary key IS the auth user id, so
    // a copy-pasted `auth.uid() = user_id` policy would fail to compile.
    expect(migration).toContain("create policy profiles_select_own");
    expect(migration).toContain("auth.uid() = id");
  });
});

describe("read-only reference data", () => {
  const block = migration.slice(migration.indexOf("-- ── Read-only reference data"));

  it.each(READ_ONLY_TABLES)("grants %s select to authenticated users", (table) => {
    expect(block).toContain(`'${table}'`);
  });

  it("grants no write policy at all", () => {
    expect(block).toContain("for select");
    expect(block).not.toContain("for insert");
    expect(block).not.toContain("for update");
  });

  it("documents why solution data is readable rather than hidden", () => {
    // If this reasoning is ever deleted, someone will "harden" these tables and
    // break the /ranges browser for no security gain.
    expect(migration).toContain("/ranges browser");
    expect(migration).toContain("Grading must always run server-side");
  });
});

describe("child tables without a user_id", () => {
  it("checks ownership through the parent row", () => {
    // Guessing a session id must not be enough to read someone's hand history.
    for (const table of ["daily_spot_results", "sim_hands"]) {
      expect(migration).toContain(`${table}_select_own`);
    }
    expect(migration).toContain("r.user_id = auth.uid()");
    expect(migration).toContain("s.user_id = auth.uid()");
  });
});

describe("service-role-only tables", () => {
  it.each(["stripe_events", "coach_cache"])("gives %s no policy at all", (table) => {
    const policyMentions = [...migration.matchAll(/create policy\s+(\S+)/g)].map((m) => m[1] ?? "");
    expect(policyMentions.some((p) => p.startsWith(table))).toBe(false);
  });
});

describe("the new-user trigger", () => {
  it("creates a profile row for every auth user", () => {
    expect(migration).toContain("create or replace function public.handle_new_user()");
    expect(migration).toContain("insert into public.profiles");
    expect(migration).toContain("after insert on auth.users");
  });

  it("pins search_path on the SECURITY DEFINER function", () => {
    // Without this, a table planted earlier on the search path could be written
    // instead of public.profiles — by a function running with elevated rights.
    const fn = migration.slice(
      migration.indexOf("create or replace function public.handle_new_user()"),
      migration.indexOf("drop trigger if exists on_auth_user_created"),
    );
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public");
  });

  it("tolerates an existing profile row", () => {
    expect(migration).toContain("on conflict (id) do nothing");
  });
});

describe("idempotency", () => {
  it("drops every policy before creating it", () => {
    const creates = [...migration.matchAll(/create policy\s+(\S+)/g)].map((m) => m[1] ?? "");
    const drops = migration;
    for (const name of creates) {
      expect(drops, `${name} is created without a matching drop`).toContain(
        `drop policy if exists ${name}`,
      );
    }
  });

  it("guards the foreign keys and replaces rather than creates the function", () => {
    expect(migration).toContain("select 1 from pg_constraint where conname");
    expect(migration).toContain("create or replace function");
    expect(migration).toContain("drop trigger if exists");
  });
});
