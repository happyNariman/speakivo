import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  integer,
  unique,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { userLanguages } from "./user-languages.js";
import { learningTopics } from "./learning-topics.js";

export const userTopicProgress = pgTable(
  "user_topic_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userLanguageId: uuid("user_language_id")
      .notNull()
      .references(() => userLanguages.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => learningTopics.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["not_started", "learning", "review", "mastered"],
    })
      .notNull()
      .default("not_started"),
    confidence: real("confidence").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    correctAttempts: integer("correct_attempts").notNull().default(0),
    lastPracticedAt: timestamp("last_practiced_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("user_topic_progress_user_lang_topic_unique").on(
      table.userLanguageId,
      table.topicId,
    ),
    check(
      "user_topic_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check("user_topic_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "user_topic_correct_attempts_check",
      sql`${table.correctAttempts} >= 0 AND ${table.correctAttempts} <= ${table.attempts}`,
    ),
    index("user_topic_progress_confidence_idx").on(
      table.userLanguageId,
      table.confidence,
    ),
    index("user_topic_progress_next_review_idx").on(
      table.userLanguageId,
      table.nextReviewAt,
    ),
    index("user_topic_progress_status_idx").on(
      table.userLanguageId,
      table.status,
    ),
  ],
);

export type UserTopicProgress = typeof userTopicProgress.$inferSelect;
export type NewUserTopicProgress = typeof userTopicProgress.$inferInsert;
