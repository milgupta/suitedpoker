/**
 * The guard, EXERCISED — not enumerated.
 *
 * `api-route-audit.test.ts` is a static audit and says so in its own header: it
 * proves the guard was WRITTEN, not that it works. That left a real hole.
 * `npm run mutation` replaces the entitlement check in `withEntitlement` with
 * `if (false)` — every paid API route would then serve an unsubscribed caller —
 * and the mutation SURVIVED, because nothing in the unit suite ever called the
 * wrapper. The runtime proof existed only in `tests/e2e/entitlement.spec.ts`,
 * which needs a server, a database and a Supabase project, so it is not in
 * `npm run verify`, not in the commit hook, and not in the mutation run.
 *
 * These tests call the wrapper directly with the two dependencies stubbed, so
 * the check is exercised in milliseconds with no credentials. The e2e suite
 * still proves it end to end over real HTTP; this proves it cannot be deleted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getUser = vi.fn();
const hasActiveSubscription = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser } }),
}));

vi.mock("@/lib/entitlement", () => ({
  hasActiveSubscription: (userId: string) => hasActiveSubscription(userId) as Promise<boolean>,
}));

const { withAuth, withEntitlement } = await import("@/lib/api-guard");

const request = {} as NextRequest;
const ok = () => new Response("handler ran", { status: 200 });

function signedIn(userId = "user-1"): void {
  getUser.mockResolvedValue({ data: { user: { id: userId } } });
}
function signedOut(): void {
  getUser.mockResolvedValue({ data: { user: null } });
}

beforeEach(() => {
  getUser.mockReset();
  hasActiveSubscription.mockReset();
});

describe("withAuth", () => {
  it("refuses an anonymous caller with 401 and never runs the handler", async () => {
    signedOut();
    const handler = vi.fn(ok);
    const response = await withAuth(handler)(request, undefined);

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler for a signed-in caller, and passes the user id", async () => {
    signedIn("abc");
    // Typed explicitly so the assertion below reads the real argument rather
    // than an `any` — `vi.fn(ok)` infers a zero-argument signature.
    const handler = vi.fn((_request: NextRequest, auth: { userId: string }) => {
      void auth;
      return ok();
    });
    const response = await withAuth(handler)(request, undefined);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1].userId).toBe("abc");
  });

  it("does not check entitlement — that is the whole point of the two wrappers", async () => {
    // /account and /api/stripe/* are reachable by someone whose card just
    // failed. Gating them means the only users who can fix a payment problem
    // are the ones who do not have one.
    signedIn();
    await withAuth(vi.fn(ok))(request, undefined);
    expect(hasActiveSubscription).not.toHaveBeenCalled();
  });
});

describe("withEntitlement", () => {
  /*
   * THE MUTATION CATCHER. If the entitlement check is ever removed, weakened,
   * or short-circuited, this is the assertion that goes red.
   */
  it("refuses an unsubscribed caller and NEVER runs the handler", async () => {
    signedIn();
    hasActiveSubscription.mockResolvedValue(false);
    const handler = vi.fn(ok);

    const response = await withEntitlement(handler)(request, undefined);

    expect(response.status).toBe(402);
    expect(handler, "the handler ran for a caller with no subscription").not.toHaveBeenCalled();
  });

  it("returns 402, not 403", async () => {
    // 403 means "you may never do this"; 402 means "subscribe and you can".
    // Different screen, different funnel step — the client branches on it.
    signedIn();
    hasActiveSubscription.mockResolvedValue(false);
    const response = await withEntitlement(vi.fn(ok))(request, undefined);

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: "entitlement_required" });
  });

  it("runs the handler for a subscribed caller", async () => {
    signedIn();
    hasActiveSubscription.mockResolvedValue(true);
    const handler = vi.fn(ok);

    const response = await withEntitlement(handler)(request, undefined);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("checks entitlement against the AUTHENTICATED user, not anything from the request", async () => {
    // A body-supplied user id would let anyone borrow a subscriber's access.
    signedIn("real-user");
    hasActiveSubscription.mockResolvedValue(true);
    await withEntitlement(vi.fn(ok))(request, undefined);

    expect(hasActiveSubscription).toHaveBeenCalledWith("real-user");
  });

  it("still refuses an anonymous caller with 401 before it ever asks about money", async () => {
    // Order matters: an anonymous caller is "log in", not "subscribe", and
    // asking the database about a user who does not exist is wasted work.
    signedOut();
    const handler = vi.fn(ok);

    const response = await withEntitlement(handler)(request, undefined);

    expect(response.status).toBe(401);
    expect(hasActiveSubscription).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});
