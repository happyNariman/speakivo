CREATE TABLE "language_level_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_language_id" uuid NOT NULL,
	"previous_level" text NOT NULL,
	"proposed_level" text NOT NULL,
	"confidence" real NOT NULL,
	"evidence" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_languages" ADD COLUMN "level_source" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "language_level_assessments" ADD CONSTRAINT "language_level_assessments_user_language_id_user_languages_id_fk" FOREIGN KEY ("user_language_id") REFERENCES "public"."user_languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "language_level_assessments_user_lang_status_idx" ON "language_level_assessments" USING btree ("user_language_id","status");--> statement-breakpoint
CREATE INDEX "language_level_assessments_user_lang_created_idx" ON "language_level_assessments" USING btree ("user_language_id","created_at");