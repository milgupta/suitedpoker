/**
 * The typed event schema.
 *
 * NO RAW STRING EVENT NAMES ANYWHERE IN THE CODEBASE. Every call site goes
 * through `capture()`, which only accepts a name from this map and forces the
 * matching property shape. A typo'd event name is a silently missing funnel
 * step three weeks later, and you cannot recover the data.
 *
 * Property names are camelCase to match the code; PostHog does not care, and
 * one convention beats two.
 */

/** Matches the Stripe products and STRIPE_PRICE_* env vars — one vocabulary. */
export type Plan = "monthly" | "annual";
export type SignupMethod = "email" | "google";
export type Grade = "sharp" | "best" | "solid" | "inaccuracy" | "mistake" | "blunder";

export interface EventMap {
  // ── Acquisition and activation ────────────────────────────────────────────
  landing_viewed: Record<string, never>;
  signup_started: { method: SignupMethod };
  signup_completed: { method: SignupMethod };
  onboarding_started: Record<string, never>;
  /** Fired PER QUESTION — the whole point is seeing which one loses people. */
  onboarding_question_answered: { question: string; answer: string; index: number };
  onboarding_completed: { skillTier: string; primaryLeak: string; rating: number };
  diagnosis_viewed: { primaryLeak: string; annualCost: number };
  paywall_viewed: { annualCost: number };
  checkout_started: { plan: Plan };
  purchase_completed: { plan: Plan; revenue: number };
  checkout_abandoned: { plan: Plan };

  // ── Engagement ────────────────────────────────────────────────────────────
  drill_started: { source: string; config: string };
  drill_answered: {
    grade: Grade;
    evLoss: number;
    timeMs: number;
    difficulty: number;
    hintsUsed: number;
  };
  session_ended: { hands: number; accuracy: number; evLostPer100: number };
  daily_started: Record<string, never>;
  daily_completed: { score: number; rank: number; streak: number };
  streak_milestone: { days: number };
  lesson_started: { lessonId: string };
  lesson_completed: { lessonId: string; accuracy: number };
  module_completed: { moduleId: string };
  sim_session_started: { tableType: string };
  sim_session_ended: { hands: number; netBb: number };
  coach_hint_requested: { level: number; source: string };
  coach_explanation_viewed: Record<string, never>;
  coach_chat_message: Record<string, never>;
  rating_tier_changed: { from: string; to: string };

  // ── Retention and revenue ─────────────────────────────────────────────────
  subscription_cancelled: { reason: string; daysActive: number };
  cancellation_offer_shown: { offer: string };
  cancellation_offer_accepted: { offer: string };
}

export type EventName = keyof EventMap;

/** Every event name, for the test that walks the schema. */
export const EVENT_NAMES = [
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
] as const satisfies readonly EventName[];

/** Properties attached to the person, not the event. */
export interface UserTraits {
  skillTier: string;
  plan: string;
  rating: number;
  signupDate: string;
  primaryLeak: string;
}

/**
 * No dollar-denominated RESULTS claims — that is an ad-account and compliance
 * boundary, not a copy preference. `revenue` and `annualCost` are prices and
 * costs, which is a different thing, and they never reach the UI as a claim
 * about what a user won.
 */
export const REVENUE_EVENTS = ["purchase_completed"] as const;
