import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { learningSessions } from "./learning-sessions.js";
import { conversationMessages } from "./conversation-messages.js";

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => learningSessions.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => conversationMessages.id, {
      onDelete: "set null",
    }),
    runId: text("run_id"),
    agentName: text("agent_name"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    operation: text("operation").notNull(),
    inputModality: text("input_modality").notNull().default("text"),
    outputModality: text("output_modality").notNull().default("text"),
    requestId: text("request_id"),
    responseId: text("response_id"),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull(),
    totalTokens: bigint("total_tokens", { mode: "number" }).notNull(),
    inputTextTokens: bigint("input_text_tokens", { mode: "number" }),
    inputAudioTokens: bigint("input_audio_tokens", { mode: "number" }),
    outputTextTokens: bigint("output_text_tokens", { mode: "number" }),
    outputAudioTokens: bigint("output_audio_tokens", { mode: "number" }),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "number" }),
    usageDetails: jsonb("usage_details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_usage_user_id_created_at_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("ai_usage_user_model_created_at_idx").on(
      table.userId,
      table.model,
      table.createdAt.desc(),
    ),
    index("ai_usage_user_op_created_at_idx").on(
      table.userId,
      table.operation,
      table.createdAt.desc(),
    ),
    index("ai_usage_session_id_created_at_idx").on(
      table.sessionId,
      table.createdAt.desc(),
    ),
    index("ai_usage_model_created_at_idx").on(
      table.model,
      table.createdAt.desc(),
    ),
    index("ai_usage_operation_created_at_idx").on(
      table.operation,
      table.createdAt.desc(),
    ),
  ],
);

export type AIUsage = typeof aiUsage.$inferSelect;
export type NewAIUsage = typeof aiUsage.$inferInsert;
