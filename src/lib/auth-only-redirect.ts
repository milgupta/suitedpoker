/**
 * Where a signed-in visitor of /login, /signup or /forgot should go.
 *
 * `/signup` is the page the session is minted on. Sending that request to
 * `/practice` skips the ads-funnel commit, the demo hand, and — with the
 * entitlement bypass on — the paywall too. Unpaid signups go to the continue
 * bridge instead. A paid subscriber bouncing off /signup still goes home.
 *
 * `hasPaidSubscription` is the Stripe row, NOT the dev bypass. Bypass exists
 * to open /practice without a card, not to steal the post-signup hop.
 */
export function authOnlyRedirect(
  pathname: string,
  hasPaidSubscription: boolean,
): "/practice" | "/onboarding/continue" {
  const isSignup = pathname === "/signup" || pathname.startsWith("/signup/");
  if (isSignup && !hasPaidSubscription) return "/onboarding/continue";
  return "/practice";
}
