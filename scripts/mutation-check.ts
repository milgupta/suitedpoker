/**
 * DOES THE SUITE ACTUALLY CATCH AN ENTITLEMENT BUG?
 *
 * A green test suite proves the tests pass. It does not prove they would fail
 * if the thing they guard were broken — and the entitlement boundary is the one
 * place where "the tests were green" is not an acceptable answer.
 *
 * So this breaks it on purpose, one mutation at a time, runs the suite that
 * should notice, and restores the file. A mutation that SURVIVES is a hole:
 * the code could ship that way and nothing would say so.
 *
 *   npm run mutation
 *
 * Every mutation is applied to a working copy and reverted in a finally block,
 * including on Ctrl-C.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Mutation {
  readonly name: string;
  readonly file: string;
  readonly from: string;
  readonly to: string;
  /** The command that must FAIL once the mutation is applied. */
  readonly caughtBy: string;
  readonly why: string;
}

const MUTATIONS: Mutation[] = [
  {
    name: "entitlement always true",
    file: "src/lib/entitlement-rule.ts",
    from: "export function isEntitled(sub: SubscriptionLike | null, now: Date = new Date()): boolean {",
    to: "export function isEntitled(sub: SubscriptionLike | null, now: Date = new Date()): boolean {\n  if (true) return true;",
    caughtBy:
      "npx vitest run --project unit tests/unit/entitlement.test.ts tests/unit/entitlement-grace.test.ts",
    why: "the paywall would be open to everyone",
  },
  {
    name: "expired subscriptions still admitted",
    file: "src/lib/entitlement-rule.ts",
    from: "  return end.getTime() > now.getTime();",
    to: "  return true;",
    caughtBy:
      "npx vitest run --project unit tests/unit/entitlement.test.ts tests/unit/entitlement-grace.test.ts",
    why: "a cancelled user would keep access forever",
  },
  {
    name: "past_due grace never expires",
    file: "src/lib/entitlement-rule.ts",
    from: "    return now.getTime() - since.getTime() < PAST_DUE_GRACE_MS;",
    to: "    return true;",
    caughtBy: "npx vitest run --project unit tests/unit/entitlement-grace.test.ts",
    why: "a card that never succeeds would keep its access indefinitely",
  },
  {
    name: "the API guard stops checking entitlement",
    file: "src/lib/api-guard.ts",
    from: "    if (!(await hasActiveSubscription(auth.userId))) return paymentRequired();",
    to: "    if (false) return paymentRequired();",
    /*
     * Pointed at the RUNTIME test, not the route audit.
     *
     * This mutation survived for a long time because `api-route-audit` is a
     * static scan: it reads every file under src/app/api and checks the guard
     * was WRITTEN. Deleting the check inside the guard leaves every one of
     * those files untouched, so the audit stayed green while the paywall was
     * open to everyone. A test that cannot fail is not a check.
     */
    caughtBy: "npx vitest run --project unit tests/unit/api-guard-runtime.test.ts",
    why: "every paid API route would serve an unsubscribed caller",
  },
  {
    name: "the drill payload leaks the strategy",
    file: "src/lib/ai/chat.ts",
    from: "  const invented = inventedNumber(trimmed, groundTruth);",
    to: "  const invented = null as string | null;",
    caughtBy: "npx vitest run --project unit tests/unit/chat-guard.test.ts",
    why: "the coach could state frequencies nothing computed",
  },
  {
    name: "the hint guard stops blocking action words",
    file: "src/lib/ai/redact.ts",
    from: "  if (level < 3) {",
    to: "  if (false) {",
    caughtBy: "npx vitest run --project unit tests/unit/hints.test.ts",
    why: "a level-1 hint would name the correct action before the user acts",
  },
];

function run(command: string): boolean {
  try {
    execSync(command, { stdio: "pipe", cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  const results: { mutation: Mutation; caught: boolean }[] = [];

  for (const mutation of MUTATIONS) {
    const path = join(process.cwd(), mutation.file);
    const original = readFileSync(path, "utf8");

    if (!original.includes(mutation.from)) {
      console.error(
        `\n  ✗ "${mutation.name}" — the line it mutates no longer exists in ${mutation.file}.\n` +
          `    This script is stale. Fix the mutation before trusting the result.\n`,
      );
      process.exitCode = 1;
      continue;
    }

    process.stdout.write(`  ${mutation.name.padEnd(46)}`);

    try {
      writeFileSync(path, original.replace(mutation.from, mutation.to));
      // The suite must now FAIL. If it passes, nothing was guarding this.
      const stillPasses = run(mutation.caughtBy);
      results.push({ mutation, caught: !stillPasses });
      console.log(stillPasses ? "SURVIVED ✗" : "caught ✓");
    } finally {
      writeFileSync(path, original);
    }
  }

  const survived = results.filter((r) => !r.caught);

  console.log(`\n${"=".repeat(78)}\nMUTATION RESULTS\n${"=".repeat(78)}`);
  for (const { mutation, caught } of results) {
    console.log(
      `  ${caught ? "caught  " : "SURVIVED"}  ${mutation.name.padEnd(44)} ${mutation.why}`,
    );
  }
  console.log(
    `\n  ${results.length - survived.length}/${results.length} mutations caught\n${"=".repeat(78)}\n`,
  );

  if (survived.length > 0) {
    console.error(
      `  ${survived.length} mutation(s) SURVIVED. The code could ship broken and nothing would say so.`,
    );
    process.exit(1);
  }
}

main();
