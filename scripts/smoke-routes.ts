/**
 * Every built route answers without a 5xx.
 *
 * A twenty-minute e2e suite should not be the thing that discovers the build
 * is incomplete. One did today: `.next` was removed by a backgrounded `rm -rf`
 * that was still running when `next build` started, and `/styleguide/table`
 * shipped without its client reference manifest. It returned 500, six tests
 * failed across three files, and the failures looked like product bugs — a
 * leak test among them, which is exactly the kind of thing you do not want to
 * be reasoning about from corrupt evidence.
 *
 * Routes are enumerated from SOURCE (`src/app`), never from the build output.
 *
 * The first version read `.next/server/app` — the very artifact it exists to
 * validate. Deleting a built route made it vanish from the list, and the check
 * cheerfully reported "all 27 routes answered" while curl got a 500 from the
 * 28th. A check that enumerates from the thing it is checking cannot fail, and
 * that is the whole failure mode this was written for.
 *
 *   npm run smoke            # against an already-running server
 *   PORT=3100 npm run smoke
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const APP_DIR = join(process.cwd(), "src", "app");

/** Route groups are organisational; they never appear in a URL. */
function urlFor(dir: string): string | null {
  const path = dir
    .split("/")
    .filter((segment) => segment !== "" && !segment.startsWith("(") && segment !== "@children")
    .join("/");

  // Dynamic segments need a real value, and internals are not routes.
  if (path.includes("[") || path.startsWith("_")) return null;
  return `/${path}`;
}

function sourceRoutes(): string[] {
  const found: string[] = [];

  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, `${rel}/${entry}`);
      else if (/^page\.(tsx?|mdx)$/.test(entry)) {
        const url = urlFor(rel);
        if (url !== null) found.push(url);
      }
    }
  };

  walk(APP_DIR, "");
  return [...new Set(found)].sort();
}

async function main(): Promise<void> {
  const routes = sourceRoutes();
  if (routes.length === 0) {
    console.error("No page.tsx found under src/app. Is the working directory right?");
    process.exit(1);
  }

  const bad: string[] = [];
  const rows: string[] = [];

  for (const route of routes) {
    let status = 0;
    try {
      // Redirects are the CORRECT answer for a gated route hit anonymously —
      // /dashboard sending an unauthenticated visitor to /login is the product
      // working. Only a 5xx means the route itself is broken.
      const response = await fetch(`${BASE}${route}`, { redirect: "manual" });
      status = response.status;
    } catch (error) {
      bad.push(`${route} — unreachable: ${error instanceof Error ? error.message : "unknown"}`);
      rows.push(`  ${route.padEnd(28)} UNREACHABLE`);
      continue;
    }

    if (status >= 500) bad.push(`${route} → ${status}`);
    rows.push(`  ${route.padEnd(28)} ${status}${status >= 500 ? "  ← BROKEN" : ""}`);
  }

  console.log(
    `\n${"=".repeat(52)}\nROUTE SMOKE (${routes.length} routes in src/app)\n${"=".repeat(52)}`,
  );
  console.log(rows.join("\n"));

  if (bad.length > 0) {
    console.error(
      `\n  ${bad.length} route(s) returning 5xx:\n${bad.map((b) => `    ${b}`).join("\n")}`,
    );
    console.error("\n  If this is right after a build, the build is incomplete. Rebuild with");
    console.error("  a SYNCHRONOUS `rm -rf .next` — a backgrounded one races the build.\n");
    process.exit(1);
  }

  console.log(`\n  all ${routes.length} routes answered without a 5xx\n`);
}

void main();
