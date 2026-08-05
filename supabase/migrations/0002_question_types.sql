ALTER TABLE "drill_attempts" ADD COLUMN "question_type" text DEFAULT 'action' NOT NULL;--> statement-breakpoint
ALTER TABLE "drill_attempts" ADD COLUMN "question_payload" jsonb;--> statement-breakpoint
ALTER TABLE "postflop_templates" ADD COLUMN "questions" jsonb;