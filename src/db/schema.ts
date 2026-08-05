/**
 * The complete database schema.
 *
 * Conventions, applied without exception:
 *   - snake_case columns, camelCase TypeScript keys
 *   - uuid primary keys defaulting to gen_random_uuid()
 *   - timestamptz with defaults, never a bare timestamp
 *   - EV and money are numeric(10,3), NEVER float — a binary float cannot
 *     represent 0.1, and these values are summed over thousands of hands
 *   - every user-scoped table carries `user_id` referencing auth.users with
 *     ON DELETE CASCADE, so deleting an account really deletes the data
 *
 * Row Level Security lives in supabase/migrations/0002_rls.sql, not here —
 * Drizzle does not model policies, and splitting them out keeps the security
 * boundary in one readable file.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Supabase owns `auth.users`, and Drizzle must never emit DDL for it.
 *
 * Declaring it here as a pgSchema table made `drizzle-kit generate` write
 * `CREATE TABLE "auth"."users"` into the migration — which would collide with
 * the table Supabase already manages. So `user_id` is a plain uuid here, and
 * every foreign key to auth.users is added in 0001_auth_fks_rls.sql instead.
 *
 * The cost is that Drizzle does not know about those FKs. That is the right
 * trade: they are a Supabase concern, and the database still enforces them.
 */
const userId = () => uuid("user_id").notNull();

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ── IDENTITY ────────────────────────────────────────────────────────────── */

export const profiles = pgTable("profiles", {
  /** Mirrors auth.users.id. The FK is added in 0001_auth_fks_rls.sql. */
  id: uuid("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  timezone: text("timezone"),
  /** The five onboarding answers. */
  onboarding: jsonb("onboarding"),
  skillTier: text("skill_tier"),
  /** Derived from onboarding Q2. */
  primaryLeakKey: text("primary_leak_key"),
  /**
   * Deliberately has NO default. Substage 3.3 sets it from the onboarding
   * diagnosis — a default would silently give every user a rating they never
   * earned and quietly break the calibration.
   */
  rating: integer("rating"),
  /** Glicko rating deviation. */
  ratingDeviation: integer("rating_deviation").notNull().default(350),
  streakCount: integer("streak_count").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastDailyAt: date("last_daily_at"),
  /** First-of-month date; one streak freeze per calendar month. */
  streakFreezeUsedMonth: date("streak_freeze_used_month"),
  /** Nullable until the 9.6 age gate is answered. */
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),

  // Attribution, captured at signup (8.2).
  fbclid: text("fbclid"),
  fbp: text("fbp"),
  fbc: text("fbc"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),

  createdAt: createdAt(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status"),
    priceId: text("price_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    /** Drives the 8.3 dunning schedule. */
    pastDueSince: timestamp("past_due_since", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("subscriptions_user_id_idx").on(t.userId),
    uniqueIndex("subscriptions_stripe_subscription_id_key").on(t.stripeSubscriptionId),
  ],
);

/** Webhook idempotency (7.4). Keyed by Stripe's own event id. */
export const stripeEvents = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  outcome: text("outcome"),
});

/** Exit-survey data (7.5). */
export const cancellations = pgTable(
  "cancellations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    reason: text("reason"),
    offerShown: text("offer_shown"),
    offerAccepted: boolean("offer_accepted").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("cancellations_user_id_idx").on(t.userId)],
);

/* ── SOLUTION DATA (the moat) ────────────────────────────────────────────── */

export const solutionSets = pgTable("solution_sets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  game: text("game").notNull(),
  tableSize: integer("table_size").notNull(),
  stackDepthBb: integer("stack_depth_bb").notNull(),
  rakeModel: text("rake_model"),
  source: text("source"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: createdAt(),
});

export const preflopNodes = pgTable(
  "preflop_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solutionSetId: uuid("solution_set_id")
      .notNull()
      .references(() => solutionSets.id, { onDelete: "cascade" }),
    /** UTG MP CO BTN SB BB */
    heroPos: text("hero_pos").notNull(),
    /** 'rfi' | 'vs_rfi_CO' | 'vs_3bet_BB' | 'vs_4bet_BTN' */
    actionSeq: text("action_seq").notNull(),
    /** { "AKs": {"raise":1.0}, "AJo": {"raise":.62,"fold":.38} } */
    strategy: jsonb("strategy").notNull(),
    /** { "AJo": {"raise":2.1,"fold":0.0} }, in big blinds. */
    ev: jsonb("ev").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("preflop_nodes_set_pos_seq_key").on(t.solutionSetId, t.heroPos, t.actionSeq)],
);

export const postflopTemplates = pgTable(
  "postflop_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    solutionSetId: uuid("solution_set_id")
      .notNull()
      .references(() => solutionSets.id, { onDelete: "cascade" }),
    /** "BTN opens, BB calls, BB checks flop" */
    label: text("label").notNull(),
    street: text("street").notNull(),
    heroPos: text("hero_pos").notNull(),
    villainPos: text("villain_pos").notNull(),
    potBb: numeric("pot_bb", { precision: 10, scale: 3 }).notNull(),
    effStackBb: numeric("eff_stack_bb", { precision: 10, scale: 3 }).notNull(),
    /** ['dry','ace-high','rainbow'] */
    boardTags: text("board_tags").array(),
    heroRangeRef: text("hero_range_ref"),
    villainRangeRef: text("villain_range_ref"),
    actionHistory: jsonb("action_history"),
    /** Optional hand_choice / sizing questions attached by an author. */
    questions: jsonb("questions"),
    createdAt: createdAt(),
  },
  (t) => [index("postflop_templates_solution_set_id_idx").on(t.solutionSetId)],
);

export const postflopStrategies = pgTable(
  "postflop_strategies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => postflopTemplates.id, { onDelete: "cascade" }),
    /** 'top_pair_good_kicker' | 'flush_draw' | 'air_bdfd' … */
    handClass: text("hand_class").notNull(),
    /** { "bet_33":.70, "check":.30 } */
    strategy: jsonb("strategy").notNull(),
    ev: jsonb("ev").notNull(),
    /** The author's note. Seeds the AI explanation — it never invents strategy. */
    rationale: text("rationale"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("postflop_strategies_template_hand_class_key").on(t.templateId, t.handClass)],
);

/* ── PRACTICE ────────────────────────────────────────────────────────────── */

export const drillAttempts = pgTable(
  "drill_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    nodeRef: text("node_ref").notNull(),
    /** The spot as it was shown, so a replay is faithful even if solutions change. */
    spotSnapshot: jsonb("spot_snapshot"),
    heroHand: text("hero_hand"),
    board: text("board"),
    chosenAction: text("chosen_action"),
    grade: text("grade"),
    evLoss: numeric("ev_loss", { precision: 10, scale: 3 }),
    timeMs: integer("time_ms"),
    source: text("source"),
    /** 'action' | 'hand_choice' | 'sizing'. See src/poker/questions.ts. */
    questionType: text("question_type").notNull().default("action"),
    /** The question as asked, so a replay shows the same four candidates. */
    questionPayload: jsonb("question_payload"),
    hintsUsed: integer("hints_used").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("drill_attempts_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("drill_attempts_user_node_idx").on(t.userId, t.nodeRef),
  ],
);

export const dailyChallenges = pgTable(
  "daily_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    spotRefs: jsonb("spot_refs").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("daily_challenges_date_key").on(t.date)],
);

export const dailyResults = pgTable(
  "daily_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: "cascade" }),
    score: integer("score"),
    evLossTotal: numeric("ev_loss_total", { precision: 10, scale: 3 }),
    rank: integer("rank"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("daily_results_user_id_idx").on(t.userId),
    uniqueIndex("daily_results_user_challenge_key").on(t.userId, t.challengeId),
  ],
);

export const dailySpotResults = pgTable(
  "daily_spot_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resultId: uuid("result_id")
      .notNull()
      .references(() => dailyResults.id, { onDelete: "cascade" }),
    spotIndex: integer("spot_index").notNull(),
    attemptId: uuid("attempt_id").references(() => drillAttempts.id, { onDelete: "set null" }),
    grade: text("grade"),
    evLoss: numeric("ev_loss", { precision: 10, scale: 3 }),
    createdAt: createdAt(),
  },
  // Enforces one attempt per spot — without this the daily challenge is
  // retryable until perfect, and the leaderboard means nothing.
  (t) => [uniqueIndex("daily_spot_results_result_spot_key").on(t.resultId, t.spotIndex)],
);

/* ── LEARNING ────────────────────────────────────────────────────────────── */

export const modules = pgTable(
  "modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** Named `sort_order` in SQL — `order` is reserved and needs quoting forever. */
    order: integer("sort_order").notNull(),
    tier: text("tier"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("modules_slug_key").on(t.slug)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    order: integer("sort_order").notNull(),
    mdxPath: text("mdx_path"),
    drillFilter: jsonb("drill_filter"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("lessons_slug_key").on(t.slug),
    index("lessons_module_id_idx").on(t.moduleId),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("not_started"),
    attempts: integer("attempts").notNull().default(0),
    bestAccuracy: numeric("best_accuracy", { precision: 10, scale: 3 }),
    scrollPos: integer("scroll_pos"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lesson_progress_user_lesson_key").on(t.userId, t.lessonId)],
);

/* ── SIM ─────────────────────────────────────────────────────────────────── */

export const simSessions = pgTable(
  "sim_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    config: jsonb("config"),
    handsPlayed: integer("hands_played").notNull().default(0),
    netBb: numeric("net_bb", { precision: 10, scale: 3 }).notNull().default("0"),
    /**
     * The authoritative in-progress game. It lives server-side for the same
     * reason grading does: a client holding game state can rewrite it.
     */
    liveState: jsonb("live_state"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("sim_sessions_user_id_idx").on(t.userId)],
);

export const simHands = pgTable(
  "sim_hands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => simSessions.id, { onDelete: "cascade" }),
    handHistory: jsonb("hand_history"),
    heroEvLoss: numeric("hero_ev_loss", { precision: 10, scale: 3 }),
    reviewed: boolean("reviewed").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("sim_hands_session_id_idx").on(t.sessionId)],
);

/* ── COACH ───────────────────────────────────────────────────────────────── */

export const coachMessages = pgTable(
  "coach_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    attemptId: uuid("attempt_id").references(() => drillAttempts.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    tokens: integer("tokens"),
    createdAt: createdAt(),
  },
  (t) => [index("coach_messages_user_created_idx").on(t.userId, t.createdAt.desc())],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    endpoint: text("endpoint").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    cached: boolean("cached").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_user_created_idx").on(t.userId, t.createdAt.desc())],
);

/** Also mirrored in Redis (0.4); this is the durable copy. */
export const coachCache = pgTable("coach_cache", {
  cacheKey: text("cache_key").primaryKey(),
  content: text("content").notNull(),
  model: text("model"),
  createdAt: createdAt(),
});

export const leaks = pgTable(
  "leaks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    leakKey: text("leak_key").notNull(),
    severity: numeric("severity", { precision: 10, scale: 3 }),
    sampleSize: integer("sample_size").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leaks_user_leak_key").on(t.userId, t.leakKey)],
);

/* ── Relations ───────────────────────────────────────────────────────────── */

export const solutionSetsRelations = relations(solutionSets, ({ many }) => ({
  preflopNodes: many(preflopNodes),
  postflopTemplates: many(postflopTemplates),
}));

export const preflopNodesRelations = relations(preflopNodes, ({ one }) => ({
  solutionSet: one(solutionSets, {
    fields: [preflopNodes.solutionSetId],
    references: [solutionSets.id],
  }),
}));

export const postflopTemplatesRelations = relations(postflopTemplates, ({ one, many }) => ({
  solutionSet: one(solutionSets, {
    fields: [postflopTemplates.solutionSetId],
    references: [solutionSets.id],
  }),
  strategies: many(postflopStrategies),
}));

export const postflopStrategiesRelations = relations(postflopStrategies, ({ one }) => ({
  template: one(postflopTemplates, {
    fields: [postflopStrategies.templateId],
    references: [postflopTemplates.id],
  }),
}));

export const modulesRelations = relations(modules, ({ many }) => ({
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  module: one(modules, { fields: [lessons.moduleId], references: [modules.id] }),
  progress: many(lessonProgress),
}));

export const simSessionsRelations = relations(simSessions, ({ many }) => ({
  hands: many(simHands),
}));

export const simHandsRelations = relations(simHands, ({ one }) => ({
  session: one(simSessions, { fields: [simHands.sessionId], references: [simSessions.id] }),
}));

/**
 * Tables scoped to a single user. RLS must restrict every one of these to
 * `auth.uid() = user_id`, and a test asserts this list matches the policies in
 * the migration.
 */
export const USER_SCOPED_TABLES = [
  "subscriptions",
  "cancellations",
  "drill_attempts",
  "daily_results",
  "lesson_progress",
  "sim_sessions",
  "coach_messages",
  "ai_usage",
  "leaks",
] as const;

/**
 * Read-only reference data. Authenticated, entitled users may SELECT; nothing
 * may write from the client, ever — the service role owns these.
 */
export const READ_ONLY_TABLES = [
  "solution_sets",
  "preflop_nodes",
  "postflop_templates",
  "postflop_strategies",
  "modules",
  "lessons",
  "daily_challenges",
] as const;
