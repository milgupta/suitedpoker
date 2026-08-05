/**
 * The event schema is the product's memory of what happened. A typo'd name is a
 * funnel step that silently never existed, discovered weeks later when the data
 * is already gone — so the schema is asserted rather than trusted.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENT_NAMES, REVENUE_EVENTS, type EventName } from "../../src/lib/analytics";

const SRC = resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe("the event schema", () => {
  it("covers every event the build plan asks for", () => {
    // Straight from 8.1's list. If a name here is missing, an insight that was
    // specified cannot be built.
    const required: EventName[] = [
      "landing_viewed",
      "signup_started",
      "signup_completed",
      "onboarding_started",
      "onboarding_question_answered",
      "onboarding_completed",
      "diagnosis_viewed",
      "paywall_viewed",
      "checkout_started",
      "purchase_completed",
      "checkout_abandoned",
      "drill_started",
      "drill_answered",
      "session_ended",
      "daily_started",
      "daily_completed",
      "streak_milestone",
      "lesson_started",
      "lesson_completed",
      "module_completed",
      "sim_session_started",
      "sim_session_ended",
      "coach_hint_requested",
      "coach_explanation_viewed",
      "coach_chat_message",
      "rating_tier_changed",
      "subscription_cancelled",
      "cancellation_offer_shown",
      "cancellation_offer_accepted",
    ];

    for (const name of required) {
      expect(EVENT_NAMES, `${name} is missing from the schema`).toContain(name);
    }
  });

  it("has no duplicate names", () => {
    expect(new Set(EVENT_NAMES).size).toBe(EVENT_NAMES.length);
  });

  it("names every event in snake_case", () => {
    for (const name of EVENT_NAMES) {
      expect(name, `${name} is not snake_case`).toMatch(/^[a-z]+(_[a-z0-9]+)*$/);
    }
  });

  it("treats purchase_completed as the revenue event", () => {
    expect([...REVENUE_EVENTS]).toContain("purchase_completed");
  });
});

describe("no raw event names outside the analytics layer", () => {
  const ALLOWED = ["src/lib/analytics-client.ts", "src/lib/analytics-server.ts"];

  const files = walk(SRC)
    .map((f) => relative(process.cwd(), f))
    .filter((f) => !ALLOWED.includes(f.split("\\").join("/")));

  it.each(files)("%s does not call posthog directly", (file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    // Every call site must go through capture()/identify(), which are typed
    // against the schema. A direct posthog.capture takes a raw string and
    // bypasses the whole point of having one.
    expect(source, `${file} calls posthog directly`).not.toMatch(/posthog\.(capture|identify)\(/);
  });

  it("captures only names that exist in the schema", () => {
    const names = new Set<string>(EVENT_NAMES);
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const match of source.matchAll(/\bcapture\(\s*"([^"]+)"/g)) {
        const name = match[1];
        if (name !== undefined && !names.has(name)) {
          offenders.push(`${file}: "${name}"`);
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("the reverse proxy", () => {
  it("is configured, so an adblocker cannot eat the funnel", async () => {
    const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("/ingest/:path*");
    expect(config).toContain("/ingest/static/:path*");
    // The trailing slash must survive or PostHog 404s the proxied requests.
    expect(config).toContain("skipTrailingSlashRedirect");
  });

  it("points the client at the proxy rather than posthog.com", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/analytics-client.ts"), "utf8");
    expect(client).toContain('api_host: "/ingest"');
  });

  it("masks every input in session replay", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/analytics-client.ts"), "utf8");
    // Passwords and emails are typed into this app on the first screen.
    expect(client).toContain("maskAllInputs: true");
  });

  it("captures pageviews manually, because the App Router does not reload", () => {
    const client = readFileSync(resolve(process.cwd(), "src/lib/analytics-client.ts"), "utf8");
    expect(client).toContain("capture_pageview: false");
  });
});
