import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { userLanguages } from "./user-languages.js";
import { learningTopics } from "./learning-topics.js";
import { vocabulary } from "./vocabulary.js";

export const learningMistakes = pgTable(
  "learning_mistakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userLanguageId: uuid("user_language_id")
      .notNull()
      .references(() => userLanguages.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => learningTopics.id, {
      onDelete: "set null",
    }),
    vocabularyId: uuid("vocabulary_id").references(() => vocabulary.id, {
      onDelete: "set null",
    }),
    category: text("category", {
      enum: [
        "grammar",
        "vocabulary",
        "pronunciation",
        "word_order",
        "spelling",
        "other",
      ],
    }).notNull(),
    severity: text("severity", { enum: ["low", "medium", "high"] }),
    sourceText: text("source_text").notNull(),
    correctedText: text("corrected_text"),
    explanation: text("explanation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("learning_mistakes_created_at_idx").on(
      table.userLanguageId,
      table.createdAt,
    ),
    index("learning_mistakes_category_idx").on(
      table.userLanguageId,
      table.category,
    ),
    index("learning_mistakes_topic_idx").on(
      table.userLanguageId,
      table.topicId,
    ),
  ],
);

export type LearningMistake = typeof learningMistakes.$inferSelect;
export type NewLearningMistake = typeof learningMistakes.$inferInsert;
