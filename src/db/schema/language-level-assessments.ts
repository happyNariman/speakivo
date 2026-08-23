import {
  pgTable,
  uuid,
  text,
  real,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { userLanguages } from "./user-languages.js";

export const languageLevelAssessments = pgTable(
  "language_level_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userLanguageId: uuid("user_language_id")
      .notNull()
      .references(() => userLanguages.id, { onDelete: "cascade" }),
    previousLevel: text("previous_level", {
      enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
    }).notNull(),
    proposedLevel: text("proposed_level", {
      enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
    }).notNull(),
    confidence: real("confidence").notNull(),
    evidence: jsonb("evidence").$type<string[]>().notNull(),
    reason: text("reason").notNull(),
    status: text("status", {
      enum: ["pending", "confirmed", "rejected", "expired"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    index("language_level_assessments_user_lang_status_idx").on(
      table.userLanguageId,
      table.status,
    ),
    index("language_level_assessments_user_lang_created_idx").on(
      table.userLanguageId,
      table.createdAt,
    ),
  ],
);

export type LanguageLevelAssessment =
  typeof languageLevelAssessments.$inferSelect;
export type NewLanguageLevelAssessment =
  typeof languageLevelAssessments.$inferInsert;
export type AssessmentStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "expired";
export type LevelSource =
  | "default"
  | "self_reported"
  | "assessed"
  | "confirmed";
