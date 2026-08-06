/**
 * Every API route, enumerated, with the guard it uses.
 *
 * The rule from 1.3 is that no route rolls its own auth check — it wraps in
 * `withAuth` or `withEntitlement`. This test is what keeps that true as routes
 * are added: a new file under src/app/api with a bare `export async function
 * POST` fails the build, and has to be named in the exemption list with a
 * reason if it really is public.
 *
 * This is a static audit. It proves the guard was WRITTEN, not that it works —
 * tests/e2e/entitlement.spec.ts proves that against real requests.
 */

import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = join(process.cwd(), "src/app/api");

/**
 * Routes that are public BY DESIGN, each with the reason it has to be.
 *
 * Adding to this list should feel uncomfortable. Every entry is a route
 * reachable by an anonymous request.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  "stripe/webhook/route.ts":
    "Stripe is the caller and has no session. Authenticated by signature instead — the constructEvent call IS the guard.",
  "daily/generate/route.ts":
    "A Vercel cron is the caller and has no session. Authenticated by CRON_SECRET, which fails closed in production.",
};

/** Routes that must be reachable by a signed-in user who has NOT paid. */
const AUTH_ONLY_ROUTES: Record<string, string> = {
  "stripe/checkout/route.ts": "The buyer is by definition not yet entitled.",
  "stripe/portal/route.ts": "A cancelled user must still be able to manage billing.",
  "entitlement/status/route.ts": "/welcome polls this before the webhook lands.",
  "onboarding/route.ts": "Onboarding runs before the paywall.",
  "guard-probe/authed/route.ts": "Test fixture for the guard itself.",
  "stripe/switch-plan/route.ts":
    "7.5 offers the yearly switch DURING cancellation, and it verifies an owned subscription itself rather than trusting the entitlement cache.",
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out.sort();
}

interface Audited {
  readonly route: string;
  readonly guard: "withEntitlement" | "withAuth" | "signature" | "cron secret" | "NONE";
  readonly methods: readonly string[];
}

function audit(file: string): Audited {
  const source = readFileSync(file, "utf8");
  const route = relative(API_ROOT, file);

  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) =>
    new RegExp(`export (const|async function) ${m}\\b`).test(source),
  );

  let guard: Audited["guard"] = "NONE";
  if (source.includes("withEntitlement(")) guard = "withEntitlement";
  else if (source.includes("withAuth(")) guard = "withAuth";
  else if (source.includes("webhooks.constructEvent(")) guard = "signature";
  else if (source.includes("CRON_SECRET")) guard = "cron secret";

  return { route, guard, methods };
}

describe("every API route is guarded", () => {
  const audited = routeFiles(API_ROOT).map(audit);

  it("found the routes", () => {
    expect(audited.length).toBeGreaterThan(15);
  });

  it("has a guard on every route, or a documented reason not to", () => {
    const unguarded = audited.filter(
      (a) =>
        a.guard === "NONE" &&
        PUBLIC_ROUTES[a.route] === undefined &&
        AUTH_ONLY_ROUTES[a.route] === undefined,
    );
    expect(unguarded.map((a) => a.route)).toEqual([]);
  });

  it("gates everything behind entitlement except the documented exemptions", () => {
    const notEntitled = audited
      .filter((a) => a.guard !== "withEntitlement")
      .map((a) => a.route)
      .filter((r) => PUBLIC_ROUTES[r] === undefined && AUTH_ONLY_ROUTES[r] === undefined);

    expect(notEntitled).toEqual([]);
  });

  it("keeps the webhook authenticated by signature", () => {
    const webhook = audited.find((a) => a.route === "stripe/webhook/route.ts");
    expect(webhook?.guard).toBe("signature");
  });

  it("does not leave a stale exemption behind", () => {
    // An exemption for a route that no longer exists is a hole waiting for a
    // future file to be created at the same path.
    const routes = new Set(audited.map((a) => a.route));
    for (const listed of [...Object.keys(PUBLIC_ROUTES), ...Object.keys(AUTH_ONLY_ROUTES)]) {
      expect(routes.has(listed), `${listed} is exempted but does not exist`).toBe(true);
    }
  });

  it("prints the table", () => {
    const rows = audited.map((a) => {
      const reason = PUBLIC_ROUTES[a.route] ?? AUTH_ONLY_ROUTES[a.route] ?? "";
      const label =
        a.guard === "withEntitlement"
          ? "entitled"
          : a.guard === "withAuth"
            ? "auth only"
            : a.guard === "NONE"
              ? "UNGUARDED"
              : a.guard;
      return `  ${a.route.padEnd(34)} ${a.methods.join(",").padEnd(9)} ${label.padEnd(11)}${reason ? `— ${reason.split(".")[0]}` : ""}`;
    });
    console.log(`\n${"=".repeat(78)}\nAPI ROUTE GUARDS\n${"=".repeat(78)}\n${rows.join("\n")}\n`);
  });
});
