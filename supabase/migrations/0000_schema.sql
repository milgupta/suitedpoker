CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text,
	"offer_shown" text,
	"offer_accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_id" uuid,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"spot_refs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"score" integer,
	"ev_loss_total" numeric(10, 3),
	"rank" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_spot_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id" uuid NOT NULL,
	"spot_index" integer NOT NULL,
	"attempt_id" uuid,
	"grade" text,
	"ev_loss" numeric(10, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drill_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"node_ref" text NOT NULL,
	"spot_snapshot" jsonb,
	"hero_hand" text,
	"board" text,
	"chosen_action" text,
	"grade" text,
	"ev_loss" numeric(10, 3),
	"time_ms" integer,
	"source" text,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"leak_key" text NOT NULL,
	"severity" numeric(10, 3),
	"sample_size" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"best_accuracy" numeric(10, 3),
	"scroll_pos" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer NOT NULL,
	"mdx_path" text,
	"drill_filter" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer NOT NULL,
	"tier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postflop_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"hand_class" text NOT NULL,
	"strategy" jsonb NOT NULL,
	"ev" jsonb NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postflop_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_set_id" uuid NOT NULL,
	"label" text NOT NULL,
	"street" text NOT NULL,
	"hero_pos" text NOT NULL,
	"villain_pos" text NOT NULL,
	"pot_bb" numeric(10, 3) NOT NULL,
	"eff_stack_bb" numeric(10, 3) NOT NULL,
	"board_tags" text[],
	"hero_range_ref" text,
	"villain_range_ref" text,
	"action_history" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preflop_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solution_set_id" uuid NOT NULL,
	"hero_pos" text NOT NULL,
	"action_seq" text NOT NULL,
	"strategy" jsonb NOT NULL,
	"ev" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"timezone" text,
	"onboarding" jsonb,
	"skill_tier" text,
	"primary_leak_key" text,
	"rating" integer,
	"rating_deviation" integer DEFAULT 350 NOT NULL,
	"streak_count" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_daily_at" date,
	"streak_freeze_used_month" date,
	"age_confirmed_at" timestamp with time zone,
	"fbclid" text,
	"fbp" text,
	"fbc" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"hand_history" jsonb,
	"hero_ev_loss" numeric(10, 3),
	"reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"config" jsonb,
	"hands_played" integer DEFAULT 0 NOT NULL,
	"net_bb" numeric(10, 3) DEFAULT '0' NOT NULL,
	"live_state" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "solution_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"game" text NOT NULL,
	"table_size" integer NOT NULL,
	"stack_depth_bb" integer NOT NULL,
	"rake_model" text,
	"source" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"price_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"past_due_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_messages" ADD CONSTRAINT "coach_messages_attempt_id_drill_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."drill_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_challenge_id_daily_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."daily_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_spot_results" ADD CONSTRAINT "daily_spot_results_result_id_daily_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."daily_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_spot_results" ADD CONSTRAINT "daily_spot_results_attempt_id_drill_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."drill_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postflop_strategies" ADD CONSTRAINT "postflop_strategies_template_id_postflop_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."postflop_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postflop_templates" ADD CONSTRAINT "postflop_templates_solution_set_id_solution_sets_id_fk" FOREIGN KEY ("solution_set_id") REFERENCES "public"."solution_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preflop_nodes" ADD CONSTRAINT "preflop_nodes_solution_set_id_solution_sets_id_fk" FOREIGN KEY ("solution_set_id") REFERENCES "public"."solution_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_hands" ADD CONSTRAINT "sim_hands_session_id_sim_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sim_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_idx" ON "ai_usage" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cancellations_user_id_idx" ON "cancellations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coach_messages_user_created_idx" ON "coach_messages" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "daily_challenges_date_key" ON "daily_challenges" USING btree ("date");--> statement-breakpoint
CREATE INDEX "daily_results_user_id_idx" ON "daily_results" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_results_user_challenge_key" ON "daily_results" USING btree ("user_id","challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_spot_results_result_spot_key" ON "daily_spot_results" USING btree ("result_id","spot_index");--> statement-breakpoint
CREATE INDEX "drill_attempts_user_created_idx" ON "drill_attempts" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "drill_attempts_user_node_idx" ON "drill_attempts" USING btree ("user_id","node_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "leaks_user_leak_key" ON "leaks" USING btree ("user_id","leak_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_user_lesson_key" ON "lesson_progress" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lessons_slug_key" ON "lessons" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "lessons_module_id_idx" ON "lessons" USING btree ("module_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modules_slug_key" ON "modules" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "postflop_strategies_template_hand_class_key" ON "postflop_strategies" USING btree ("template_id","hand_class");--> statement-breakpoint
CREATE INDEX "postflop_templates_solution_set_id_idx" ON "postflop_templates" USING btree ("solution_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preflop_nodes_set_pos_seq_key" ON "preflop_nodes" USING btree ("solution_set_id","hero_pos","action_seq");--> statement-breakpoint
CREATE INDEX "sim_hands_session_id_idx" ON "sim_hands" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sim_sessions_user_id_idx" ON "sim_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions" USING btree ("stripe_subscription_id");