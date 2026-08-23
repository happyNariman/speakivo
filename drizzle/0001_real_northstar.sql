CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"message_id" uuid,
	"run_id" text,
	"agent_name" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_modality" text DEFAULT 'text' NOT NULL,
	"output_modality" text DEFAULT 'text' NOT NULL,
	"request_id" text,
	"response_id" text,
	"input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"total_tokens" bigint NOT NULL,
	"input_text_tokens" bigint,
	"input_audio_tokens" bigint,
	"output_text_tokens" bigint,
	"output_audio_tokens" bigint,
	"cached_input_tokens" bigint,
	"usage_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_session_id_learning_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."learning_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_user_id_created_at_idx" ON "ai_usage" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_user_model_created_at_idx" ON "ai_usage" USING btree ("user_id","model","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_user_op_created_at_idx" ON "ai_usage" USING btree ("user_id","operation","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_session_id_created_at_idx" ON "ai_usage" USING btree ("session_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_model_created_at_idx" ON "ai_usage" USING btree ("model","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_operation_created_at_idx" ON "ai_usage" USING btree ("operation","created_at" DESC NULLS LAST);