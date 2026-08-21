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
import { vocabulary } from "./vocabulary.js";

export const userVocabulary = pgTable(
  "user_vocabulary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userLanguageId: uuid("user_language_id")
      .notNull()
      .references(() => userLanguages.id, { onDelete: "cascade" }),
    vocabularyId: uuid("vocabulary_id")
      .notNull()
      .references(() => vocabulary.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["not_started", "learning", "review", "mastered"],
    })
      .notNull()
      .default("not_started"),
    confidence: real("confidence").notNull().default(0),
    timesSeen: integer("times_seen").notNull().default(0),
    timesCorrect: integer("times_correct").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
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
    unique("user_vocabulary_user_lang_vocab_unique").on(
      table.userLanguageId,
      table.vocabularyId,
    ),
    check(
      "user_vocab_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    check("user_vocab_times_seen_check", sql`${table.timesSeen} >= 0`),
    check(
      "user_vocab_times_correct_check",
      sql`${table.timesCorrect} >= 0 AND ${table.timesCorrect} <= ${table.timesSeen}`,
    ),
    index("user_vocab_confidence_idx").on(
      table.userLanguageId,
      table.confidence,
    ),
    index("user_vocab_next_review_idx").on(
      table.userLanguageId,
      table.nextReviewAt,
    ),
  ],
);

export type UserVocabulary = typeof userVocabulary.$inferSelect;
export type NewUserVocabulary = typeof userVocabulary.$inferInsert;
