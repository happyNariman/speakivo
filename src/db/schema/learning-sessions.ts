import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { userLanguages } from "./user-languages.js";

export const learningSessions = pgTable(
  "learning_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userLanguageId: uuid("user_language_id")
      .notNull()
      .references(() => userLanguages.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("learning_sessions_user_started_idx").on(
      table.userId,
      table.startedAt,
    ),
    index("learning_sessions_lang_started_idx").on(
      table.userLanguageId,
      table.startedAt,
    ),
  ],
);

export type LearningSession = typeof learningSessions.$inferSelect;
export type NewLearningSession = typeof learningSessions.$inferInsert;
