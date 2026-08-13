/**
 * Compliance, as data.
 *
 * The reason this exists is not legal risk in the abstract — it is that a
 * frozen Stripe account or a banned ad account at any scale is a
 * business-ending event, and both are decided by a reviewer reading strings on
 * a page. Everything here is cheap and none of it is reversible after the fact.
 */

export const DISCLAIMER = "Educational software. Play money only. No real-money gambling.";

/**
 * Where we do not serve.
 *
 * ONE constant, so the list is auditable and changeable without touching
 * routing. These are jurisdictions where online-poker-adjacent tools face
 * restrictions strict enough that a payment processor is likely to act before
 * a regulator does.
 *
 * ISO 3166-1 alpha-2, matching what Vercel's `x-vercel-ip-country` sends.
 */
export const BLOCKED_COUNTRIES: readonly string[] = [
  "AE", // United Arab Emirates
  "SA", // Saudi Arabia
  "QA", // Qatar
  "KW", // Kuwait
  "BN", // Brunei
  "KP", // North Korea
  "IR", // Iran
  "SY", // Syria
  "CU", // Cuba
];

export function isBlockedCountry(code: string | null | undefined): boolean {
  if (code == null || code === "") return false;
  return BLOCKED_COUNTRIES.includes(code.trim().toUpperCase());
}

/**
 * Gambling-adjacent language that must not appear in user-facing copy.
 *
 * "Chips", "pot", "bet" and "payout" are GAME MECHANICS and stay — a poker
 * trainer that will not say "pot" is unusable, and `awardPot` returning
 * `payouts` is the engine describing itself. What goes is anything implying
 * MONEY MOVES: winnings, cash out, deposit, withdraw, real money, wager.
 */
export const FORBIDDEN_TERMS: readonly { pattern: RegExp; instead: string }[] = [
  { pattern: /\bwinnings\b/i, instead: "big blinds won" },
  { pattern: /\bcash(?:ing)? out\b/i, instead: "ending the session" },
  { pattern: /\bdeposits?\b/i, instead: "— there is nothing to deposit" },
  { pattern: /\bwithdrawals?\b/i, instead: "— there is nothing to withdraw" },
  { pattern: /\breal money\b/i, instead: "play money only" },
  { pattern: /\bwagers?\b/i, instead: "bet (the game action)" },
  { pattern: /\bgambl(?:e|ing)\b/i, instead: "only inside an explicit denial" },
  { pattern: /\bcasino\b/i, instead: "never" },
];

/** The copy on the blocked page. Polite, specific, and not an error. */
export const BLOCKED_PAGE = {
  heading: "We're not available where you are",
  body: "SuitedPoker is educational software with no real-money play, but poker training tools face restrictions in some places and we would rather stay clearly on the right side of that than find out the hard way.",
  footer:
    "If you think this is wrong — a VPN, a mislocated IP — email help@suitedpoker.com and we will sort it out.",
} as const;
