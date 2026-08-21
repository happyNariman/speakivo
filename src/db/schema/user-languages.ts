import { pgTable, uuid, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { languages } from "./languages.js";

export const userLanguages = pgTable(
  "user_languages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    languageCode: text("language_code")
      .notNull()
      .references(() => languages.code, { onDelete: "restrict" }),
    nativeLanguageCode: text("native_language_code").references(
      () => languages.code,
      { onDelete: "restrict" },
    ),
    level: text("level", { enum: ["A1", "A2", "B1", "B2", "C1", "C2"] })
      .notNull()
      .default("A1"),
    status: text("status", { enum: ["active", "paused", "completed"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("user_languages_user_id_language_code_unique").on(
      table.userId,
      table.languageCode,
    ),
    index("user_languages_user_id_status_idx").on(table.userId, table.status),
    index("user_languages_language_code_idx").on(table.languageCode),
  ],
);

export type UserLanguage = typeof userLanguages.$inferSelect;
export type NewUserLanguage = typeof userLanguages.$inferInsert;
