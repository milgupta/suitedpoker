import type { AuthError } from "@supabase/supabase-js";

/**
 * Turns a Supabase auth error into copy a human wrote.
 *
 * A raw error string is never shown. "Invalid login credentials" is accurate
 * and useless; "AuthApiError: over_email_send_rate_limit" is worse. Every case
 * below was chosen to say what happened AND what to do about it.
 *
 * Deliberately vague on one point: a wrong email and a wrong password give the
 * same message. Saying "no account with that email" turns the login form into
 * a tool for discovering who has an account.
 */
const BY_CODE: Record<string, string> = {
  invalid_credentials: "That email and password don't match.",
  email_not_confirmed: "Check your email and confirm your address first.",
  user_already_exists: "There's already an account with that email. Try logging in.",
  email_exists: "There's already an account with that email. Try logging in.",
  weak_password: "That password is too easy to guess. Use at least 8 characters.",
  same_password: "That's your current password. Pick a different one.",
  over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
  over_email_send_rate_limit: "We've sent a lot of email to that address. Try again in an hour.",
  otp_expired: "That link has expired. Request a new one.",
  validation_failed: "Check the details above and try again.",
  provider_disabled: "That sign-in method isn't switched on yet.",
  signup_disabled: "New signups are paused right now.",
  user_not_found: "That link is no longer valid. Request a new one.",
  session_expired: "Your session expired. Log in again.",
};

/** Matched on the message when a code is absent — older errors carry no code. */
const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, "That email and password don't match."],
  [/email not confirmed/i, "Check your email and confirm your address first."],
  [
    /already registered|already exists/i,
    "There's already an account with that email. Try logging in.",
  ],
  [/rate limit/i, "Too many attempts. Wait a minute and try again."],
  [/expired/i, "That link has expired. Request a new one."],
  [/provider is not enabled/i, "That sign-in method isn't switched on yet."],
  [/password should be at least/i, "Use at least 8 characters."],
  [/failed to fetch|network/i, "Couldn't reach the server. Check your connection."],
];

export function authErrorMessage(error: AuthError | Error | null): string {
  if (error === null) return "";

  const code = (error as AuthError).code;
  if (typeof code === "string") {
    const mapped = BY_CODE[code];
    if (mapped !== undefined) return mapped;
  }

  for (const [pattern, message] of BY_MESSAGE) {
    if (pattern.test(error.message)) return message;
  }

  // Nothing matched. Say so plainly rather than leaking an internal string.
  return "Something went wrong. Try again in a moment.";
}
