CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" bigint NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"native_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language_code" text NOT NULL,
	"native_language_code" text,
	"level" text DEFAULT 'A1' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_languages_user_id_language_code_unique" UNIQUE("user_id","language_code")
);
--> statement-breakpoint
CREATE TABLE "learning_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_code" text NOT NULL,
	"type" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_topic_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_topics_lang_slug_unique" UNIQUE("language_code","slug")
);
--> statement-breakpoint
CREATE TABLE "user_topic_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_language_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"correct_attempts" integer DEFAULT 0 NOT NULL,
	"last_practiced_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_topic_progress_user_lang_topic_unique" UNIQUE("user_language_id","topic_id"),
	CONSTRAINT "user_topic_confidence_check" CHECK ("user_topic_progress"."confidence" >= 0 AND "user_topic_progress"."confidence" <= 1),
	CONSTRAINT "user_topic_attempts_check" CHECK ("user_topic_progress"."attempts" >= 0),
	CONSTRAINT "user_topic_correct_attempts_check" CHECK ("user_topic_progress"."correct_attempts" >= 0 AND "user_topic_progress"."correct_attempts" <= "user_topic_progress"."attempts")
);
--> statement-breakpoint
CREATE TABLE "vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language_code" text NOT NULL,
	"lemma" text NOT NULL,
	"word" text NOT NULL,
	"part_of_speech" text,
	"translation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_lang_lemma_unique" UNIQUE("language_code","lemma")
);
--> statement-breakpoint
CREATE TABLE "user_vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_language_id" uuid NOT NULL,
	"vocabulary_id" uuid NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"times_seen" integer DEFAULT 0 NOT NULL,
	"times_correct" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_vocabulary_user_lang_vocab_unique" UNIQUE("user_language_id","vocabulary_id"),
	CONSTRAINT "user_vocab_confidence_check" CHECK ("user_vocabulary"."confidence" >= 0 AND "user_vocabulary"."confidence" <= 1),
	CONSTRAINT "user_vocab_times_seen_check" CHECK ("user_vocabulary"."times_seen" >= 0),
	CONSTRAINT "user_vocab_times_correct_check" CHECK ("user_vocabulary"."times_correct" >= 0 AND "user_vocabulary"."times_correct" <= "user_vocabulary"."times_seen")
);
--> statement-breakpoint
CREATE TABLE "learning_mistakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_language_id" uuid NOT NULL,
	"topic_id" uuid,
	"vocabulary_id" uuid,
	"category" text NOT NULL,
	"severity" text,
	"source_text" text NOT NULL,
	"corrected_text" text,
	"explanation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_language_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_languages" ADD CONSTRAINT "user_languages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_languages" ADD CONSTRAINT "user_languages_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_languages" ADD CONSTRAINT "user_languages_native_language_code_languages_code_fk" FOREIGN KEY ("native_language_code") REFERENCES "public"."languages"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_parent_topic_id_learning_topics_id_fk" FOREIGN KEY ("parent_topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_progress" ADD CONSTRAINT "user_topic_progress_user_language_id_user_languages_id_fk" FOREIGN KEY ("user_language_id") REFERENCES "public"."user_languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_topic_progress" ADD CONSTRAINT "user_topic_progress_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary" ADD CONSTRAINT "vocabulary_language_code_languages_code_fk" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vocabulary" ADD CONSTRAINT "user_vocabulary_user_language_id_user_languages_id_fk" FOREIGN KEY ("user_language_id") REFERENCES "public"."user_languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_vocabulary" ADD CONSTRAINT "user_vocabulary_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_mistakes" ADD CONSTRAINT "learning_mistakes_user_language_id_user_languages_id_fk" FOREIGN KEY ("user_language_id") REFERENCES "public"."user_languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_mistakes" ADD CONSTRAINT "learning_mistakes_topic_id_learning_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."learning_topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_mistakes" ADD CONSTRAINT "learning_mistakes_vocabulary_id_vocabulary_id_fk" FOREIGN KEY ("vocabulary_id") REFERENCES "public"."vocabulary"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_user_language_id_user_languages_id_fk" FOREIGN KEY ("user_language_id") REFERENCES "public"."user_languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_languages_user_id_status_idx" ON "user_languages" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_languages_language_code_idx" ON "user_languages" USING btree ("language_code");--> statement-breakpoint
CREATE INDEX "learning_topics_lang_type_idx" ON "learning_topics" USING btree ("language_code","type");--> statement-breakpoint
CREATE INDEX "learning_topics_parent_topic_idx" ON "learning_topics" USING btree ("parent_topic_id");--> statement-breakpoint
CREATE INDEX "user_topic_progress_confidence_idx" ON "user_topic_progress" USING btree ("user_language_id","confidence");--> statement-breakpoint
CREATE INDEX "user_topic_progress_next_review_idx" ON "user_topic_progress" USING btree ("user_language_id","next_review_at");--> statement-breakpoint
CREATE INDEX "user_topic_progress_status_idx" ON "user_topic_progress" USING btree ("user_language_id","status");--> statement-breakpoint
CREATE INDEX "user_vocab_confidence_idx" ON "user_vocabulary" USING btree ("user_language_id","confidence");--> statement-breakpoint
CREATE INDEX "user_vocab_next_review_idx" ON "user_vocabulary" USING btree ("user_language_id","next_review_at");--> statement-breakpoint
CREATE INDEX "learning_mistakes_created_at_idx" ON "learning_mistakes" USING btree ("user_language_id","created_at");--> statement-breakpoint
CREATE INDEX "learning_mistakes_category_idx" ON "learning_mistakes" USING btree ("user_language_id","category");--> statement-breakpoint
CREATE INDEX "learning_mistakes_topic_idx" ON "learning_mistakes" USING btree ("user_language_id","topic_id");--> statement-breakpoint
CREATE INDEX "learning_sessions_user_started_idx" ON "learning_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "learning_sessions_lang_started_idx" ON "learning_sessions" USING btree ("user_language_id","started_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_session_created_idx" ON "conversation_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_session_id_idx" ON "conversation_messages" USING btree ("session_id","id");