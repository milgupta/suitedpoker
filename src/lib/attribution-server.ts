import "server-only";

import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import {
  ATTRIBUTION_COOKIE,
  parseAttributionCookie,
  hasAttribution,
  type Attribution,
} from "@/lib/attribution";
import { EMPTY_ATTRIBUTION } from "@/lib/meta";
import { cacheGet, cacheSet } from "@/lib/redis";

/**
 * Attribution, from the cookie into the profile.
 *
 * Written ONCE, at signup, and never overwritten: the ad that acquired someone
 * does not change because they later arrived from a Google search. An update
 * that overwrote it would credit the channel that closed rather than the one
 * that paid, and the ad account would then optimise against its own success.
 */

export async function readAttributionCookie(): Promise<Attribution> {
  try {
    const store = await cookies();
    return parseAttributionCookie(store.get(ATTRIBUTION_COOKIE)?.value);
  } catch {
    return EMPTY_ATTRIBUTION;
  }
}

/** The IP and user agent Meta wants for match quality. */
export async function requestIdentity(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const list = await headers();
    // Vercel sets x-forwarded-for; the first entry is the client.
    const forwarded = list.get("x-forwarded-for");
    const ip = forwarded === null ? null : (forwarded.split(",")[0]?.trim() ?? null);
    return { ip, userAgent: list.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * Moves the cookie onto the profile, at most once per user per day.
 *
 * Called from the (app) layout rather than from one route, because there is no
 * single path into the app: a user can land on /onboarding, /paywall or
 * /welcome first, and someone who buys without finishing onboarding must still
 * have attribution on their profile by the time the Stripe webhook reads it.
 *
 * Cheap on the common path — a user with no attribution cookie costs zero
 * queries — and the Redis marker stops the one select-per-page-load for
 * everybody else.
 */
export async function captureAttributionOnce(userId: string): Promise<void> {
  try {
    const attribution = await readAttributionCookie();
    if (!hasAttribution(attribution)) return;

    const key = `attr:done:${userId}`;
    if ((await cacheGet<boolean>(key)) === true) return;

    await persistAttribution(userId, attribution);
    await cacheSet(key, true, 24 * 60 * 60);
  } catch {
    // Attribution is worth a lot and worth zero page loads.
  }
}

export async function persistAttribution(
  userId: string,
  attribution: Attribution,
): Promise<boolean> {
  if (!hasAttribution(attribution)) return false;

  try {
    const db = getDb();

    // Only write columns that are still empty. A second signup-time write must
    // never clobber a first touch that is already recorded.
    const [existing] = await db
      .select({
        fbclid: profiles.fbclid,
        fbp: profiles.fbp,
        fbc: profiles.fbc,
        utmSource: profiles.utmSource,
        utmMedium: profiles.utmMedium,
        utmCampaign: profiles.utmCampaign,
        utmContent: profiles.utmContent,
        utmTerm: profiles.utmTerm,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const update: Record<string, string> = {};
    const fields: (keyof Attribution)[] = [
      "fbclid",
      "fbp",
      "fbc",
      "utmSource",
      "utmMedium",
      "utmCampaign",
      "utmContent",
      "utmTerm",
    ];

    for (const field of fields) {
      const incoming = attribution[field];
      const current = existing?.[field] ?? null;
      if (typeof incoming === "string" && incoming !== "" && (current === null || current === "")) {
        update[field] = incoming;
      }
    }

    if (Object.keys(update).length === 0) return false;

    await db.update(profiles).set(update).where(eq(profiles.id, userId));
    return true;
  } catch (error) {
    // Attribution is worth a lot and worth zero signups. A failure here must
    // never fail a signup.
    console.error(`[attribution] persist failed for ${userId}: ${String(error)}`);
    return false;
  }
}

export async function loadAttribution(userId: string): Promise<Attribution> {
  try {
    const [row] = await getDb()
      .select({
        fbclid: profiles.fbclid,
        fbp: profiles.fbp,
        fbc: profiles.fbc,
        utmSource: profiles.utmSource,
        utmMedium: profiles.utmMedium,
        utmCampaign: profiles.utmCampaign,
        utmContent: profiles.utmContent,
        utmTerm: profiles.utmTerm,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    return row === undefined ? EMPTY_ATTRIBUTION : { ...EMPTY_ATTRIBUTION, ...row };
  } catch {
    return EMPTY_ATTRIBUTION;
  }
}
