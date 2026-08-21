import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { languages } from "./languages.js";

export const learningTopics = pgTable(
  "learning_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    languageCode: text("language_code")
      .notNull()
      .references(() => languages.code, { onDelete: "restrict" }),
    type: text("type", {
      enum: [
        "grammar",
        "vocabulary",
        "speaking",
        "listening",
        "writing",
        "pronunciation",
      ],
    }).notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    parentTopicId: uuid("parent_topic_id").references(
      (): AnyPgColumn => learningTopics.id,
      { onDelete: "restrict" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("learning_topics_lang_slug_unique").on(
      table.languageCode,
      table.slug,
    ),
    index("learning_topics_lang_type_idx").on(table.languageCode, table.type),
    index("learning_topics_parent_topic_idx").on(table.parentTopicId),
  ],
);

export type LearningTopic = typeof learningTopics.$inferSelect;
export type NewLearningTopic = typeof learningTopics.$inferInsert;
