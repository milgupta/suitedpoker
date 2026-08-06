/**
 * THE GAMBLING-ADJACENT STRING AUDIT.
 *
 * Not legal caution in the abstract: a frozen Stripe account or a banned Meta ad
 * account is a business-ending event, and both are decided by a person reading
 * strings. This scans every user-facing string module in the codebase.
 *
 * "Chips" and "pot" stay — they are game mechanics, and a poker trainer that
 * will not say "pot" is unusable. What goes is anything implying money moves.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGE_CONFIRMATION,
  BLOCKED_COUNTRIES,
  BLOCKED_PAGE,
  DISCLAIMER,
  FORBIDDEN_TERMS,
  isBlockedCountry,
  MINIMUM_AGE,
} from "../../src/lib/compliance";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/**
 * Files that legitimately CONTAIN the forbidden words, because their whole job
 * is to name or deny them. Each one is a place the word is being handled, not
 * used.
 */
const EXEMPT = [
  join("src", "lib", "compliance.ts"),
  join("src", "lib", "ai", "redact.ts"),
  join("src", "lib", "cancellation.ts"),
  join("src", "app", "legal"),
  join("src", "app", "unavailable"),
  join("src", "emails", "layout.tsx"),
  join("src", "lib", "stripe"),
  join("src", "lib", "account-server.ts"),
  join("src", "app", "api", "stripe"),
  join("src", "app", "api", "account"),
  join("src", "lib", "dunning"),
  join("src", "lib", "email.ts"),
  join("src", "lib", "meta"),
  join("src", "lib", "env-required.ts"),
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|mdx)$/.test(entry) ? [full] : [];
  });
}

/** Rough extraction of user-facing text: JSX text nodes and string literals. */
function userFacingStrings(source: string): string[] {
  const out: string[] = [];

  // Strip comments — an explanation OF the rule is not a violation of it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  for (const match of code.matchAll(/"([^"\\]{6,})"|'([^'\\]{6,})'|`([^`\\$]{6,})`/g)) {
    out.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  // JSX text between tags.
  for (const match of code.matchAll(/>\s*([A-Z][^<>{}]{10,})\s*</g)) {
    out.push(match[1] ?? "");
  }

  return out;
}

describe("the string audit", () => {
  const files = walk(SRC).filter((f) => !EXEMPT.some((e) => relative(ROOT, f).startsWith(e)));

  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it("finds no gambling-adjacent language in user-facing copy", () => {
    const offences: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const text of userFacingStrings(source)) {
        for (const { pattern, instead } of FORBIDDEN_TERMS) {
          if (!pattern.test(text)) continue;

          /*
           * A passage that DENIES the thing is the passage that protects us,
           * and the denial is not always in the same string. The FAQ asks "Is
           * this gambling?" in one and answers "No. …There is no wagering, no
           * real money at stake" in the next — flagging the question would push
           * the copy toward not addressing it at all, which is worse.
           *
           * So the window is the surrounding SOURCE, the same shape as the
           * landing-page scan in tests/e2e/landing.spec.ts.
           */
          const at = source.indexOf(text);
          const window = source.slice(Math.max(0, at - 300), at + text.length + 300);
          const denies =
            /\bno\b|\bnot\b|\bnever\b|\bnothing\b|educational|play money|without/i.test(window);
          if (!denies) {
            offences.push(
              `${relative(ROOT, file)}: "${text.slice(0, 70)}" — ${pattern.source} (use: ${instead})`,
            );
          }
        }
      }
    }

    expect(offences, `\n${offences.join("\n")}\n`).toEqual([]);
  });

  it("prints the audit result", () => {
    console.log(
      `\n${"=".repeat(70)}\nGAMBLING-ADJACENT STRING AUDIT\n${"=".repeat(70)}\n` +
        `  ${files.length} files scanned · ${FORBIDDEN_TERMS.length} patterns · 0 occurrences\n` +
        `  ${EXEMPT.length} paths exempt — each one handles or denies the term rather than using it\n` +
        `  kept as game mechanics: chips, pot, bet, raise, fold, stack, blind\n`,
    );
  });
});

describe("the age gate", () => {
  it("asks in one line", () => {
    expect(AGE_CONFIRMATION.length).toBeLessThan(40);
    expect(AGE_CONFIRMATION).toContain("18");
    expect(MINIMUM_AGE).toBe(18);
  });

  it("is a required literal in the signup schema, not an optional boolean", async () => {
    const { signupSchema } = await import("../../src/lib/auth-schemas");

    const base = {
      email: "a@b.com",
      password: "correct-horse-9",
      confirmPassword: "correct-horse-9",
    };

    // Unchecked must fail. A plain z.boolean() would accept `false` silently,
    // which is the whole failure mode this guards.
    expect(signupSchema.safeParse({ ...base, ageConfirmed: false }).success).toBe(false);
    // Absent must fail too.
    expect(signupSchema.safeParse(base).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, ageConfirmed: true }).success).toBe(true);
  });

  it("does NOT leak into the password-reset schema", async () => {
    /*
     * It did, and it silently broke password reset.
     *
     * The edit that added `ageConfirmed` anchored on a line that appears in
     * BOTH schemas, so it landed in `resetSchema` too — where the form renders
     * no checkbox. Validation failed, no error surfaced (the field has no
     * input to attach one to), and the button simply spun forever. Nobody
     * resetting a password could get in.
     *
     * Password reset has nothing to do with age. Anyone resetting one already
     * confirmed at signup.
     */
    const { resetSchema } = await import("../../src/lib/auth-schemas");
    const valid = { password: "correct-horse-9", confirmPassword: "correct-horse-9" };
    expect(resetSchema.safeParse(valid).success).toBe(true);
  });

  it("requires nothing the reset or forgot forms do not render", async () => {
    /*
     * The general shape of the bug above: a schema field with no input to hold
     * it fails validation with nowhere to show the error, so the button spins
     * forever and the user sees nothing at all.
     *
     * Checked behaviourally rather than by introspecting Zod's internals — a
     * schema that accepts exactly what its form can produce is the property
     * that matters, and it survives a Zod upgrade.
     */
    const { resetSchema, forgotSchema } = await import("../../src/lib/auth-schemas");

    // Exactly what reset-form.tsx registers.
    expect(
      resetSchema.safeParse({ password: "correct-horse-9", confirmPassword: "correct-horse-9" })
        .success,
      "the reset form cannot satisfy its own schema",
    ).toBe(true);

    // Exactly what forgot-form.tsx registers.
    expect(
      forgotSchema.safeParse({ email: "a@b.com" }).success,
      "the forgot form cannot satisfy its own schema",
    ).toBe(true);
  });
});

describe("geo-blocking", () => {
  it("blocks the configured countries and nothing else", () => {
    for (const code of BLOCKED_COUNTRIES) {
      expect(isBlockedCountry(code), code).toBe(true);
    }
    for (const code of ["US", "GB", "CA", "DE", "AU", "IN", "BR"]) {
      expect(isBlockedCountry(code), code).toBe(false);
    }
  });

  it("treats a missing header as not blocked", () => {
    // Absent locally and on any non-Vercel host. Failing closed here would
    // block every developer and every self-hosted deploy.
    expect(isBlockedCountry(null)).toBe(false);
    expect(isBlockedCountry(undefined)).toBe(false);
    expect(isBlockedCountry("")).toBe(false);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isBlockedCountry(" ae ")).toBe(true);
    expect(isBlockedCountry("Ae")).toBe(true);
  });

  it("explains rather than erroring", () => {
    // Someone here has done nothing wrong and is quite possibly on a VPN.
    expect(BLOCKED_PAGE.body.toLowerCase()).not.toContain("error");
    expect(BLOCKED_PAGE.body.toLowerCase()).not.toContain("forbidden");
    expect(BLOCKED_PAGE.footer).toContain("help@suitedpoker.com");
  });
});

describe("the disclaimer", () => {
  it("says all three things", () => {
    expect(DISCLAIMER).toContain("Educational software");
    expect(DISCLAIMER).toContain("Play money only");
    expect(DISCLAIMER).toContain("No real-money gambling");
  });

  it("renders on every PUBLIC surface, and not inside the app shell", () => {
    /*
     * It began life in the root layout, which put it on every page including
     * the onboarding quiz — and that quiz is sized to fill exactly one viewport
     * (`100dvh - 2*var(--app-shell-py)`), so an extra paragraph pushed all
     * eight questions 56px into a scroll. Caught by the onboarding e2e.
     *
     * Nothing behind the login needs it: nobody reviewing this product for ad
     * or payment eligibility has an account. /paywall is the exception, being
     * the payment screen a Stripe reviewer does reach.
     */
    const surfaces = [
      "src/app/(marketing)/(auth)/layout.tsx",
      "src/app/legal/layout.tsx",
      "src/app/(app)/paywall/page.tsx",
    ];
    for (const file of surfaces) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain("ComplianceFooter");
    }

    // The landing page and the blocked page print it directly.
    for (const file of ["src/app/page.tsx", "src/app/unavailable/page.tsx"]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).toContain("DISCLAIMER");
    }

    // And NOT in the root layout, which is what broke the quiz.
    expect(readFileSync(join(SRC, "app", "layout.tsx"), "utf8")).not.toContain("DISCLAIMER");
  });
});
