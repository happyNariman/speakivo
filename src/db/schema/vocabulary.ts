import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { languages } from "./languages.js";

export const vocabulary = pgTable(
  "vocabulary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    languageCode: text("language_code")
      .notNull()
      .references(() => languages.code, { onDelete: "restrict" }),
    lemma: text("lemma").notNull(),
    word: text("word").notNull(),
    partOfSpeech: text("part_of_speech"),
    translation: text("translation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("vocabulary_lang_lemma_unique").on(table.languageCode, table.lemma),
  ],
);

export type Vocabulary = typeof vocabulary.$inferSelect;
export type NewVocabulary = typeof vocabulary.$inferInsert;
