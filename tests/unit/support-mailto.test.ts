import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/support-mailto";

/**
 * The prefill is the whole point of the support section — without it every
 * thread opens with us asking who they are and what they pay for. So the three
 * details are asserted individually rather than against one pinned string, or
 * a reworded preamble silently drops the account id and nothing notices.
 */

const CONTEXT = {
  email: "player@example.com",
  userId: "8f3c1d20-4b7a-4f21-9d55-6e0a2c9b1f44",
  planLabel: "Monthly",
} as const;

/** What the mail client will actually show, once it has decoded the URL. */
function decodedBody(href: string): string {
  const query = href.slice(href.indexOf("?") + 1);
  const body = new URLSearchParams(query).get("body");
  return body ?? "";
}

function decodedSubject(href: string): string {
  const query = href.slice(href.indexOf("?") + 1);
  return new URLSearchParams(query).get("subject") ?? "";
}

describe("supportMailto", () => {
  it("addresses the support mailbox the transactional emails already use", () => {
    expect(SUPPORT_EMAIL).toBe("help@suitedpoker.com");
    expect(supportMailto("support", CONTEXT).startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
  });

  it("separates the two kinds by subject, so the inbox can be triaged", () => {
    const support = decodedSubject(supportMailto("support", CONTEXT));
    const feature = decodedSubject(supportMailto("feature", CONTEXT));

    expect(support).not.toBe(feature);
    expect(feature.toLowerCase()).toContain("feature");
  });

  it("carries the three details support would otherwise have to ask for", () => {
    const body = decodedBody(supportMailto("support", CONTEXT));

    expect(body).toContain(CONTEXT.email);
    expect(body).toContain(CONTEXT.userId);
    expect(body).toContain("Monthly");
  });

  it("never leaves the plan blank for someone without a subscription", () => {
    const body = decodedBody(supportMailto("support", { ...CONTEXT, planLabel: null }));

    expect(body).toContain("No subscription");
    expect(body).not.toMatch(/Plan:\s*\n/);
  });

  it("opens with blank lines so the cursor lands above the details", () => {
    const body = decodedBody(supportMailto("support", CONTEXT));
    const detailsAt = body.indexOf("Account:");

    expect(body.startsWith("\n")).toBe(true);
    expect(body.slice(0, detailsAt).trim()).toBe(
      "—\nSent from my account page — please keep the lines below:",
    );
  });

  it("percent-encodes the body, so a mail client cannot truncate it at a newline", () => {
    const href = supportMailto("support", CONTEXT);

    expect(href).not.toContain("\n");
    expect(href).toContain("%0A");
  });
});
