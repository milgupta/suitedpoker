/**
 * The paste-ready migration doc must not drift from the migration itself.
 *
 * `docs/APPLY-MIGRATION-0004.md` carries a copy of the SQL so a human or a
 * browser agent can paste it into the Supabase dashboard. This codebase has
 * already learned what an unchecked copy does: `npm run emails:supabase`
 * renders two templates into `docs/` to be pasted into the same dashboard, and
 * CLAUDE.md records that as "a copy the build cannot check, so it WILL drift".
 *
 * This one can be checked, so it is.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0004_quiz_attempts.sql"),
  "utf8",
).trim();

const doc = readFileSync(resolve(process.cwd(), "docs/APPLY-MIGRATION-0004.md"), "utf8");

describe("the apply-migration doc", () => {
  it("quotes the migration verbatim", () => {
    const block = /```sql\n([\s\S]*?)```/.exec(doc)?.[1]?.trim();
    expect(block, "no sql block found in the doc").toBeDefined();
    expect(block).toBe(migration);
  });

  it("names BOTH Supabase projects", () => {
    // Applied to one only, it passes one suite and fails the other. The doc is
    // the only place that says so, so it has to keep saying it.
    expect(doc).toContain("mavyvyhytbdutdfpjnvm");
    expect(doc).toContain("shsbbpmexbwdingtgqsh");
  });

  it("tells the agent to hand back rather than enter credentials", () => {
    expect(doc.toLowerCase()).toContain("do not enter credentials");
  });
});
