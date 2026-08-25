import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { learningSessions } from "./learning-sessions.js";

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => learningSessions.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
    messageType: text("message_type", {
      enum: ["text", "voice", "tool"],
    })
      .notNull()
      .default("text"),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("conversation_messages_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    index("conversation_messages_session_id_idx").on(
      table.sessionId,
      table.id,
    ),
  ],
);

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;
