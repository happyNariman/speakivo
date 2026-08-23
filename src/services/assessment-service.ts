import { eq, and, desc } from "drizzle-orm";
import { db, type Database } from "../db/client.js";
import { env } from "../config/env.js";
import {
  languageLevelAssessments,
  userLanguages,
  type LanguageLevelAssessment,
  type UserLanguage,
} from "../db/schema/index.js";
import type { CEFRLevel } from "./learning-service.js";

export class AssessmentService {
  constructor(private readonly database: Database = db) {}

  /**
   * Retrieves an assessment proposal by its ID.
   */
  async getAssessmentById(
    assessmentId: string,
  ): Promise<LanguageLevelAssessment | null> {
    const rows = await this.database
      .select()
      .from(languageLevelAssessments)
      .where(eq(languageLevelAssessments.id, assessmentId))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Retrieves the current pending assessment for a specific user language profile.
   */
  async getPendingAssessment(
    userLanguageId: string,
  ): Promise<LanguageLevelAssessment | null> {
    const rows = await this.database
      .select()
      .from(languageLevelAssessments)
      .where(
        and(
          eq(languageLevelAssessments.userLanguageId, userLanguageId),
          eq(languageLevelAssessments.status, "pending"),
        ),
      )
      .orderBy(desc(languageLevelAssessments.createdAt))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Creates a formal CEFR level assessment proposal based on evidence.
   * Enforces configured minimum confidence and evidence thresholds.
   * Expires any prior pending assessment for this user language profile.
   */
  async createAssessment(data: {
    userLanguageId: string;
    proposedLevel: CEFRLevel;
    confidence: number;
    evidence: string[];
    reason: string;
  }): Promise<LanguageLevelAssessment> {
    // 1. Check feature toggle
    if (!env.LANGUAGE_LEVEL_ASSESSMENT_ENABLED) {
      throw new Error("Language level assessment is currently disabled in configuration");
    }

    // 2. Validate user language existence
    const [userLang] = await this.database
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.id, data.userLanguageId))
      .limit(1);

    if (!userLang) {
      throw new Error(`User language profile ${data.userLanguageId} not found`);
    }

    // 3. Validate assessment data invariants and thresholds
    if (typeof data.confidence !== "number" || data.confidence < 0 || data.confidence > 1) {
      throw new Error(
        `Confidence must be a number between 0.0 and 1.0, got ${data.confidence}`,
      );
    }

    if (data.confidence < env.LANGUAGE_LEVEL_MIN_CONFIDENCE) {
      throw new Error(
        `Assessment confidence (${data.confidence}) is below required minimum threshold (${env.LANGUAGE_LEVEL_MIN_CONFIDENCE})`,
      );
    }

    const validLevels: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
    if (!validLevels.includes(data.proposedLevel)) {
      throw new Error(`Invalid CEFR level: ${data.proposedLevel}`);
    }

    if (!Array.isArray(data.evidence) || data.evidence.length === 0) {
      throw new Error("Evidence list must not be empty");
    }

    if (data.evidence.length < env.LANGUAGE_LEVEL_MIN_EVIDENCE) {
      throw new Error(
        `Evidence count (${data.evidence.length}) is below required minimum threshold (${env.LANGUAGE_LEVEL_MIN_EVIDENCE} items)`,
      );
    }

    const cleanReason = data.reason?.trim();
    if (!cleanReason) {
      throw new Error("Assessment reason must not be empty");
    }

    // 3. Mark previous pending assessments for this language profile as expired
    await this.database
      .update(languageLevelAssessments)
      .set({ status: "expired" })
      .where(
        and(
          eq(languageLevelAssessments.userLanguageId, data.userLanguageId),
          eq(languageLevelAssessments.status, "pending"),
        ),
      );

    // 4. Insert new pending assessment
    const [created] = await this.database
      .insert(languageLevelAssessments)
      .values({
        userLanguageId: data.userLanguageId,
        previousLevel: userLang.level,
        proposedLevel: data.proposedLevel,
        confidence: data.confidence,
        evidence: data.evidence,
        reason: cleanReason,
        status: "pending",
      })
      .returning();

    return created;
  }

  /**
   * Confirms a pending assessment and updates user_languages.level atomically.
   */
  async confirmAssessment(data: {
    userLanguageId: string;
    assessmentId?: string;
  }): Promise<{
    assessment: LanguageLevelAssessment;
    userLanguage: UserLanguage;
  }> {
    let targetAssessment: LanguageLevelAssessment | null = null;

    if (data.assessmentId) {
      targetAssessment = await this.getAssessmentById(data.assessmentId);
      if (!targetAssessment) {
        throw new Error(`Assessment ${data.assessmentId} not found`);
      }
      if (targetAssessment.userLanguageId !== data.userLanguageId) {
        throw new Error(
          `Assessment ${data.assessmentId} does not belong to user language ${data.userLanguageId}`,
        );
      }
    } else {
      targetAssessment = await this.getPendingAssessment(data.userLanguageId);
      if (!targetAssessment) {
        throw new Error(
          `No pending assessment found for user language ${data.userLanguageId}`,
        );
      }
    }

    if (targetAssessment.status !== "pending") {
      throw new Error(
        `Assessment ${targetAssessment.id} cannot be confirmed because it is already '${targetAssessment.status}'`,
      );
    }

    // Atomic transaction: update assessment to confirmed + update user language level
    return this.database.transaction(async (tx) => {
      const [updatedAssessment] = await tx
        .update(languageLevelAssessments)
        .set({
          status: "confirmed",
          confirmedAt: new Date(),
        })
        .where(eq(languageLevelAssessments.id, targetAssessment.id))
        .returning();

      const [updatedUserLang] = await tx
        .update(userLanguages)
        .set({
          level: targetAssessment.proposedLevel,
          levelSource: "confirmed",
          updatedAt: new Date(),
        })
        .where(eq(userLanguages.id, data.userLanguageId))
        .returning();

      return {
        assessment: updatedAssessment,
        userLanguage: updatedUserLang,
      };
    });
  }

  /**
   * Rejects a pending assessment without modifying user_languages.level.
   */
  async rejectAssessment(data: {
    userLanguageId: string;
    assessmentId?: string;
  }): Promise<LanguageLevelAssessment> {
    let targetAssessment: LanguageLevelAssessment | null = null;

    if (data.assessmentId) {
      targetAssessment = await this.getAssessmentById(data.assessmentId);
      if (!targetAssessment) {
        throw new Error(`Assessment ${data.assessmentId} not found`);
      }
      if (targetAssessment.userLanguageId !== data.userLanguageId) {
        throw new Error(
          `Assessment ${data.assessmentId} does not belong to user language ${data.userLanguageId}`,
        );
      }
    } else {
      targetAssessment = await this.getPendingAssessment(data.userLanguageId);
      if (!targetAssessment) {
        throw new Error(
          `No pending assessment found for user language ${data.userLanguageId}`,
        );
      }
    }

    if (targetAssessment.status !== "pending") {
      throw new Error(
        `Assessment ${targetAssessment.id} cannot be rejected because it is already '${targetAssessment.status}'`,
      );
    }

    const [updated] = await this.database
      .update(languageLevelAssessments)
      .set({ status: "rejected" })
      .where(eq(languageLevelAssessments.id, targetAssessment.id))
      .returning();

    return updated;
  }
}

export const assessmentService = new AssessmentService();
