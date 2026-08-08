/**
 * Every email, rendered and read.
 *
 * A transactional email is the only part of the product that renders somewhere
 * we do not control, in clients that ignore stylesheets and invert colours. So
 * each one is rendered here for real and checked for the things that actually
 * break: a missing plain-text part, a relative link, an unreadable colour, a
 * placeholder that shipped.
 *
 * Run with `npx vitest run --project unit tests/unit/emails.test.ts --reporter=verbose`
 * to read the rendered text of all eight.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  renderEmail,
  subjectFor,
  TEMPLATES,
  type TemplateData,
  type TransactionalTemplate,
} from "../../src/lib/email";
import { email as palette, LOGO_DISPLAY_PX, logoUrl } from "../../src/emails/theme";
import {
  accessEndsAt,
  daysSince,
  DUNNING_SCHEDULE,
  DUNNING_TEMPLATES,
  dunningIdempotencyKey,
  formatDate,
  PAST_DUE_GRACE_DAYS,
  stageDueOn,
} from "../../src/lib/dunning";

const SITE = "https://suitedpoker.com";

/** Realistic data for every template, so nothing renders an empty branch. */
const FIXTURES: { [K in TransactionalTemplate]: TemplateData[K] } = {
  welcome: {
    displayName: "Milan",
    leakLabel: "folding too much to 3-bets",
    leakBb100: 4.2,
    firstLessonTitle: "Why position is everything",
    firstLessonHref: "/learn/preflop/position",
  },
  password_reset: { resetUrl: `${SITE}/reset?token=abc123` },
  verify_email: { verifyUrl: `${SITE}/auth/confirm?token=abc123` },
  receipt: {
    amount: "$119.99",
    planLabel: "Yearly",
    invoiceUrl: "https://invoice.stripe.com/i/acct_1/test",
    nextBillingDate: "August 6, 2027",
  },
  payment_failed: { amount: "$39.99", updateUrl: `${SITE}/account` },
  payment_failed_reminder: {
    amount: "$39.99",
    updateUrl: `${SITE}/account`,
    streakDays: 41,
    rating: 1187,
    handsPlayed: 3204,
    lessonsCompleted: 9,
  },
  payment_failed_final: {
    amount: "$39.99",
    updateUrl: `${SITE}/account`,
    accessEndsOn: "August 12, 2026",
  },
  subscription_cancelled: { accessEndsOn: "September 3, 2026" },
};

async function renderAll() {
  const out: { template: TransactionalTemplate; subject: string; html: string; text: string }[] =
    [];
  for (const template of TEMPLATES) {
    const rendered = await renderEmail(template, FIXTURES[template]);
    out.push({ template, ...rendered });
  }
  return out;
}

describe("all eight emails render", () => {
  it("covers every template with a fixture", () => {
    expect(TEMPLATES).toHaveLength(8);
    for (const template of TEMPLATES) {
      expect(FIXTURES[template], `no fixture for ${template}`).toBeDefined();
    }
  });

  it("produces real HTML with a subject", async () => {
    for (const { template, subject, html } of await renderAll()) {
      expect(subject.length, `${template} has no subject`).toBeGreaterThan(8);
      expect(html, `${template} is not a document`).toContain("<html");
      expect(html.length, `${template} rendered almost nothing`).toBeGreaterThan(800);
    }
  });

  it("SHIPS A PLAIN-TEXT PART with the real content in it", async () => {
    // Without one, spam scoring worsens and text-only clients render a blank
    // message — which for a dunning email means a customer who never learns
    // their card failed.
    for (const { template, text } of await renderAll()) {
      expect(text.trim().length, `${template} has no plain-text body`).toBeGreaterThan(120);
      expect(text, `${template}'s text part contains markup`).not.toContain("<div");
      expect(text, `${template}'s text part contains markup`).not.toContain("<table");
    }
  });

  it("puts every link in the plain-text part too", async () => {
    // A text-only reader must still be able to act. A button that only exists
    // in the HTML is a dead end for them.
    for (const { template, text } of await renderAll()) {
      if (template === "subscription_cancelled") continue;
      expect(text, `${template} has no usable link in its text part`).toMatch(/https?:\/\//);
    }
  });
});

describe("every link is absolute and correct", () => {
  it("has no relative or localhost URLs", async () => {
    for (const { template, html } of await renderAll()) {
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
      expect(hrefs.length, `${template} has no links at all`).toBeGreaterThan(0);

      for (const href of hrefs) {
        // A relative href in an email resolves against the mail client, which
        // means it resolves against nothing.
        expect(href, `${template}: relative href ${href}`).toMatch(/^(https?:|mailto:)/);
        expect(href, `${template}: localhost leaked into an email`).not.toContain("localhost");
        expect(href, `${template}: unreplaced placeholder`).not.toMatch(/\{\{|\$\{/);
      }
    }
  });

  it("points at the configured site", async () => {
    const { html } = await renderEmail("welcome", FIXTURES.welcome);
    expect(html).toContain(SITE);
  });

  it("has no relative image sources either", async () => {
    // The same failure as a relative href, and easier to miss: a relative src
    // resolves against the mail client, so the logo is a broken-image glyph in
    // every inbox while the links all still work.
    for (const { template, html } of await renderAll()) {
      for (const src of [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]!)) {
        expect(src, `${template}: relative img src ${src}`).toMatch(/^https?:/);
        expect(src, `${template}: localhost leaked into an email image`).not.toContain("localhost");
      }
    }
  });
});

describe("the brand lockup", () => {
  it("puts the logo at the top of every email", async () => {
    for (const { template, html } of await renderAll()) {
      expect(html, `${template} has no logo`).toContain(logoUrl());
      // Outlook sizes an image from the ATTRIBUTES, not the style. Without
      // them it renders the asset at its intrinsic 80px, so the mark arrives
      // at twice the size of the wordmark beside it.
      expect(html, `${template}'s logo has no width attribute`).toContain(
        `width="${LOGO_DISPLAY_PX}"`,
      );
      expect(html, `${template}'s logo has no height attribute`).toContain(
        `height="${LOGO_DISPLAY_PX}"`,
      );
    }
  });

  it("SURVIVES BLOCKED IMAGES, because the wordmark is live text", async () => {
    // Outlook and Gmail block remote images until the reader trusts the
    // sender — which is exactly the state a first email arrives in. A lockup
    // baked entirely into a PNG makes that first impression a grey box, so the
    // name must be text. The plain-text render is the proof: it drops every
    // image, and the brand still has to be in it.
    for (const { template, text } of await renderAll()) {
      expect(text, `${template}'s brand name is inside the image`).toContain("SUITEDPOKER");
    }
  });

  it("serves the mark as a PNG, not the brand SVG", async () => {
    // Gmail strips an <img> with an SVG source outright.
    expect(logoUrl()).toMatch(/\.png$/);
  });

  it("lays the lockup out as a table, not a flex row", async () => {
    // Outlook's Word rendering engine implements no flexbox at all, and its
    // fallback stacks the mark above the name.
    const { html } = await renderEmail("verify_email", FIXTURES.verify_email);
    expect(html).not.toContain("display:flex");
  });

  it("keeps the wordmark on the accent that passes AA on the panel", () => {
    // --accent-500 is 4.37 on canvas and fails body-text AA; --accent-400 is
    // the token that carries accent TEXT. Same rule as the site's Wordmark.
    expect(palette.accentBright).toBe("#5b8cff");
  });
});

describe("dark-mode rendering", () => {
  it("declares the colour scheme so clients stop inverting it", async () => {
    // Gmail and Apple Mail invert what they take to be a light design, and they
    // invert some colours and not others — which is how a legible email becomes
    // dark text on a dark panel.
    for (const { template, html } of await renderAll()) {
      expect(html, `${template} does not declare a colour scheme`).toContain("color-scheme");
    }
  });

  it("sets a background explicitly rather than relying on inheritance", async () => {
    for (const { template, html } of await renderAll()) {
      expect(html, `${template} has no explicit background`).toContain(palette.canvas);
      expect(html, `${template} has no surface`).toContain(palette.surface);
    }
  });

  it("uses OPAQUE text colours, which Outlook can actually render", () => {
    // Outlook does not support alpha in colour values and renders rgba() as
    // black — black text on a near-black panel.
    for (const key of ["textPrimary", "textSecondary", "textTertiary"] as const) {
      expect(palette[key], `${key} is not opaque`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("keeps the email palette in step with the design tokens", () => {
    // The one place a colour literal is correct — email clients cannot resolve
    // a CSS variable. This is what stops the duplication drifting.
    const css = readFileSync("src/app/globals.css", "utf8");
    const pairs: [string, string][] = [
      ["--color-canvas", palette.canvas],
      ["--color-surface-1", palette.surface],
      ["--color-surface-2", palette.surface2],
      ["--color-text-primary", palette.textPrimary],
      ["--color-accent-500", palette.accent],
      ["--color-accent-400", palette.accentBright],
      ["--color-grade-blunder", palette.danger],
      ["--color-on-accent", palette.onAccent],
    ];

    for (const [token, value] of pairs) {
      expect(css, `${token} no longer matches the email palette's ${value}`).toContain(
        `${token}: ${value}`,
      );
    }
  });
});

describe("the copy says something", () => {
  it("has no placeholder text anywhere", async () => {
    for (const { template, text } of await renderAll()) {
      for (const bad of ["lorem", "TODO", "placeholder", "XXX", "undefined", "[object"]) {
        expect(text.toLowerCase(), `${template} contains "${bad}"`).not.toContain(
          bad.toLowerCase(),
        );
      }
    }
  });

  it("never frames a poker result in dollars", async () => {
    // Rule 5. Prices are fine — those are prices. A RESULT in dollars is an
    // ad-account and compliance boundary.
    const { text } = await renderEmail("welcome", FIXTURES.welcome);
    expect(text).toContain("bb/100");
    expect(text).not.toMatch(/\$\d+.*(won|win|profit|earn)/i);
  });

  it("makes the welcome email specific rather than generic", async () => {
    const { text } = await renderEmail("welcome", FIXTURES.welcome);
    // The diagnosis restated, the first lesson named, one expectation set.
    expect(text).toContain("folding too much to 3-bets");
    expect(text).toContain("Why position is everything");
    expect(text.toLowerCase()).toContain("twelve minutes a day");
  });

  it("degrades the welcome email gracefully with no diagnosis", async () => {
    const { text } = await renderEmail("welcome", {});
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toContain("null");
    expect(text).not.toContain("undefined");
  });

  it("does not sound like a collections notice", async () => {
    const { text, subject } = await renderEmail("payment_failed", FIXTURES.payment_failed);
    for (const bad of ["URGENT", "ACTION REQUIRED", "immediately", "failure to", "overdue"]) {
      expect(`${subject} ${text}`.toLowerCase(), `dunning #1 says "${bad}"`).not.toContain(
        bad.toLowerCase(),
      );
    }
    // And it says the thing that actually calms someone down.
    expect(text.toLowerCase()).toContain("nothing has changed");
  });

  it("puts the user's REAL numbers in dunning #2", async () => {
    const { text } = await renderEmail("payment_failed_reminder", FIXTURES.payment_failed_reminder);
    expect(text).toContain("41 days");
    expect(text).toContain("1187");
    expect(text).toContain("3,204");
    expect(text).toContain("9");
  });

  it("survives a user with no stats at all in dunning #2", async () => {
    // A brand-new subscriber whose first charge failed. Printing "0 days" and
    // "rating 0" would be worse than saying nothing.
    const { text } = await renderEmail("payment_failed_reminder", { amount: "$39.99" });
    expect(text).not.toContain("0 days");
    expect(text.toLowerCase()).toContain("only just started");
  });

  it("states an exact date in dunning #3", async () => {
    const { text } = await renderEmail("payment_failed_final", FIXTURES.payment_failed_final);
    expect(text).toContain("August 12, 2026");
    // And says what survives, because a win-back is cheaper than a new customer.
    expect(text.toLowerCase()).toContain("rating");
    expect(text.toLowerCase()).toContain("streak");
  });

  it("keeps the door open on cancellation with no guilt", async () => {
    const { text } = await renderEmail("subscription_cancelled", FIXTURES.subscription_cancelled);
    expect(text).toContain("September 3, 2026");
    for (const bad of ["sorry to see you go", "we're sad", "sure you want"]) {
      expect(text.toLowerCase()).not.toContain(bad);
    }
  });

  it("prints every subject line", () => {
    const rows = TEMPLATES.map((t) => `  ${t.padEnd(26)} ${subjectFor(t)}`);
    console.log(`\n${"=".repeat(72)}\nEMAIL SUBJECTS\n${"=".repeat(72)}\n${rows.join("\n")}\n`);
  });

  it("prints the rendered text of all eight", async () => {
    const rendered = await renderAll();
    const blocks = rendered.map(
      ({ template, subject, text, html }) =>
        `\n${"─".repeat(72)}\n${template.toUpperCase()}  ·  ${subject}  ·  ${html.length}B html / ${text.length}B text\n${"─".repeat(72)}\n${text.trim()}`,
    );
    console.log(`\n${"=".repeat(72)}\nRENDERED EMAILS\n${"=".repeat(72)}${blocks.join("\n")}\n`);
  });
});

/* ── the dunning schedule ────────────────────────────────────────────────── */

describe("the dunning schedule", () => {
  const failedAt = new Date("2026-08-06T09:00:00Z");
  const at = (days: number) => new Date(failedAt.getTime() + days * 86_400_000);

  it("sends #2 on day 3 and #3 on day 6, and nothing on any other day", () => {
    const timeline = [0, 1, 2, 3, 4, 5, 6, 7, 8, 20].map((day) => ({
      day,
      stage: stageDueOn(failedAt, at(day)),
    }));

    expect(timeline.filter((t) => t.stage !== null)).toEqual([
      { day: 3, stage: "reminder" },
      { day: 6, stage: "final" },
    ]);

    console.log(
      `\nDUNNING TIMELINE\n${timeline
        .map((t) => `  day ${String(t.day).padStart(2)}  ${t.stage ?? "—"}`)
        .join("\n")}\n`,
    );
  });

  it("does NOT re-send every day after the due day", () => {
    // A "day 3 or later" rule turns a dunning sequence into a spam complaint.
    expect(stageDueOn(failedAt, at(4))).toBeNull();
    expect(stageDueOn(failedAt, at(5))).toBeNull();
    expect(stageDueOn(failedAt, at(7))).toBeNull();
  });

  it("sends nothing at all once past_due_since is cleared", () => {
    // Which is what a successful payment does — 7.4's sync sets it back to
    // null. The sequence stops because the state it derives from stopped;
    // there is nothing to cancel.
    expect(stageDueOn(null, at(3))).toBeNull();
    expect(stageDueOn(null, at(6))).toBeNull();
  });

  it("uses the schedule the templates are named for", () => {
    expect(DUNNING_SCHEDULE.reminder).toBe(3);
    expect(DUNNING_SCHEDULE.final).toBe(6);
    expect(DUNNING_TEMPLATES.reminder).toBe("payment_failed_reminder");
    expect(DUNNING_TEMPLATES.final).toBe("payment_failed_final");
  });

  it("counts whole days, not partial ones", () => {
    expect(daysSince(failedAt, at(2.9))).toBe(2);
    expect(daysSince(failedAt, at(3))).toBe(3);
  });

  it("states the SAME end date the entitlement rule enforces", () => {
    // Telling someone access ends on the 9th and cutting them off on the 8th
    // is how a dunning email becomes a chargeback.
    const ends = accessEndsAt(failedAt);
    expect(ends.getTime() - failedAt.getTime()).toBe(PAST_DUE_GRACE_DAYS * 86_400_000);
    expect(formatDate(ends)).toBe("August 9, 2026");
  });

  it("derives an idempotency key that is stable across runs", () => {
    // Two cron runs in one minute — a redeploy, a manual trigger — must not
    // send the same email twice.
    const a = dunningIdempotencyKey("user-1", failedAt, "reminder");
    const b = dunningIdempotencyKey("user-1", failedAt, "reminder");
    expect(a).toBe(b);
    expect(a).not.toBe(dunningIdempotencyKey("user-1", failedAt, "final"));
    expect(a).not.toBe(dunningIdempotencyKey("user-2", failedAt, "reminder"));
  });
});
