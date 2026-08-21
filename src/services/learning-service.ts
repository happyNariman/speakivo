import { eq, and, sql, desc, asc } from "drizzle-orm";
import { db, type Database } from "../db/client.js";
import {
  userLanguages,
  learningTopics,
  userTopicProgress,
  vocabulary,
  userVocabulary,
  learningMistakes,
  type UserLanguage,
  type LearningTopic,
  type Vocabulary,
  type LearningMistake,
  type UserTopicProgress,
  type UserVocabulary,
} from "../db/schema/index.js";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type LanguageStatus = "active" | "paused" | "completed";
export type ProgressStatus = "not_started" | "learning" | "review" | "mastered";
export type MistakeCategory =
  | "grammar"
  | "vocabulary"
  | "pronunciation"
  | "word_order"
  | "spelling"
  | "other";

export class LearningService {
  constructor(private readonly database: Database = db) {}

  /**
   * Retrieves all language profiles for a user.
   */
  async getUserLanguages(userId: string): Promise<UserLanguage[]> {
    return this.database
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.userId, userId))
      .orderBy(desc(userLanguages.updatedAt));
  }

  /**
   * Retrieves the active language learning profile for a user.
   */
  async getActiveLanguage(userId: string): Promise<UserLanguage | null> {
    const rows = await this.database
      .select()
      .from(userLanguages)
      .where(
        and(
          eq(userLanguages.userId, userId),
          eq(userLanguages.status, "active"),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Sets or creates an active language profile for a user.
   */
  async setUserLanguage(
    userId: string,
    languageCode: string,
    level: CEFRLevel = "A1",
    nativeLanguageCode?: string,
  ): Promise<UserLanguage> {
    // Check if profile exists
    const existing = await this.database
      .select()
      .from(userLanguages)
      .where(
        and(
          eq(userLanguages.userId, userId),
          eq(userLanguages.languageCode, languageCode),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await this.database
        .update(userLanguages)
        .set({
          level,
          status: "active",
          nativeLanguageCode: nativeLanguageCode ?? existing[0].nativeLanguageCode,
          updatedAt: new Date(),
        })
        .where(eq(userLanguages.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await this.database
      .insert(userLanguages)
      .values({
        userId,
        languageCode,
        nativeLanguageCode: nativeLanguageCode ?? null,
        level,
        status: "active",
      })
      .returning();

    return created;
  }

  /**
   * Aggregates learning progress metrics for a user's language profile.
   */
  async getLearningProgress(userLanguageId: string): Promise<{
    topicsCount: number;
    masteredTopicsCount: number;
    avgTopicConfidence: number;
    vocabularyCount: number;
    masteredVocabularyCount: number;
    avgVocabularyConfidence: number;
    totalMistakesCount: number;
  }> {
    const topicStats = await this.database
      .select({
        count: sql<number>`count(*)::int`,
        mastered: sql<number>`count(case when ${userTopicProgress.status} = 'mastered' then 1 end)::int`,
        avgConfidence: sql<number>`coalesce(avg(${userTopicProgress.confidence}), 0)::real`,
      })
      .from(userTopicProgress)
      .where(eq(userTopicProgress.userLanguageId, userLanguageId));

    const vocabStats = await this.database
      .select({
        count: sql<number>`count(*)::int`,
        mastered: sql<number>`count(case when ${userVocabulary.status} = 'mastered' then 1 end)::int`,
        avgConfidence: sql<number>`coalesce(avg(${userVocabulary.confidence}), 0)::real`,
      })
      .from(userVocabulary)
      .where(eq(userVocabulary.userLanguageId, userLanguageId));

    const mistakeStats = await this.database
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(learningMistakes)
      .where(eq(learningMistakes.userLanguageId, userLanguageId));

    return {
      topicsCount: topicStats[0]?.count ?? 0,
      masteredTopicsCount: topicStats[0]?.mastered ?? 0,
      avgTopicConfidence: topicStats[0]?.avgConfidence ?? 0,
      vocabularyCount: vocabStats[0]?.count ?? 0,
      masteredVocabularyCount: vocabStats[0]?.mastered ?? 0,
      avgVocabularyConfidence: vocabStats[0]?.avgConfidence ?? 0,
      totalMistakesCount: mistakeStats[0]?.count ?? 0,
    };
  }

  /**
   * Retrieves weak topics (lowest confidence or needs review).
   */
  async getWeakTopics(
    userLanguageId: string,
    limit = 5,
  ): Promise<
    Array<{
      topicId: string;
      slug: string;
      name: string;
      type: string;
      confidence: number;
      status: string;
      attempts: number;
      correctAttempts: number;
    }>
  > {
    const rows = await this.database
      .select({
        topicId: learningTopics.id,
        slug: learningTopics.slug,
        name: learningTopics.name,
        type: learningTopics.type,
        confidence: userTopicProgress.confidence,
        status: userTopicProgress.status,
        attempts: userTopicProgress.attempts,
        correctAttempts: userTopicProgress.correctAttempts,
      })
      .from(userTopicProgress)
      .innerJoin(
        learningTopics,
        eq(userTopicProgress.topicId, learningTopics.id),
      )
      .where(eq(userTopicProgress.userLanguageId, userLanguageId))
      .orderBy(asc(userTopicProgress.confidence), desc(userTopicProgress.attempts))
      .limit(limit);

    return rows;
  }

  /**
   * Retrieves vocabulary items due for review or with lowest confidence.
   */
  async getVocabularyToReview(
    userLanguageId: string,
    limit = 10,
  ): Promise<
    Array<{
      vocabularyId: string;
      word: string;
      lemma: string;
      translation: string | null;
      confidence: number;
      status: string;
      timesSeen: number;
      timesCorrect: number;
    }>
  > {
    const rows = await this.database
      .select({
        vocabularyId: vocabulary.id,
        word: vocabulary.word,
        lemma: vocabulary.lemma,
        translation: vocabulary.translation,
        confidence: userVocabulary.confidence,
        status: userVocabulary.status,
        timesSeen: userVocabulary.timesSeen,
        timesCorrect: userVocabulary.timesCorrect,
      })
      .from(userVocabulary)
      .innerJoin(vocabulary, eq(userVocabulary.vocabularyId, vocabulary.id))
      .where(eq(userVocabulary.userLanguageId, userLanguageId))
      .orderBy(asc(userVocabulary.confidence), asc(userVocabulary.lastSeenAt))
      .limit(limit);

    return rows;
  }

  /**
   * Records a user language learning mistake.
   */
  async recordMistake(data: {
    userLanguageId: string;
    category: MistakeCategory;
    sourceText: string;
    correctedText?: string;
    explanation?: string;
    topicId?: string;
    vocabularyId?: string;
    severity?: "low" | "medium" | "high";
  }): Promise<LearningMistake> {
    const [mistake] = await this.database
      .insert(learningMistakes)
      .values({
        userLanguageId: data.userLanguageId,
        category: data.category,
        sourceText: data.sourceText,
        correctedText: data.correctedText ?? null,
        explanation: data.explanation ?? null,
        topicId: data.topicId ?? null,
        vocabularyId: data.vocabularyId ?? null,
        severity: data.severity ?? "medium",
      })
      .returning();

    return mistake;
  }

  /**
   * Saves a vocabulary word to the dictionary and links it to the user's vocabulary list.
   */
  async saveVocabulary(data: {
    userLanguageId: string;
    languageCode: string;
    lemma: string;
    word: string;
    translation?: string;
    partOfSpeech?: string;
  }): Promise<{ vocabulary: Vocabulary; userVocabulary: UserVocabulary }> {
    // 1. Find or insert vocabulary
    const existingVocab = await this.database
      .select()
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.languageCode, data.languageCode),
          eq(vocabulary.lemma, data.lemma),
        ),
      )
      .limit(1);

    let vocabItem: Vocabulary;
    if (existingVocab.length > 0) {
      vocabItem = existingVocab[0];
    } else {
      const [inserted] = await this.database
        .insert(vocabulary)
        .values({
          languageCode: data.languageCode,
          lemma: data.lemma,
          word: data.word,
          translation: data.translation ?? null,
          partOfSpeech: data.partOfSpeech ?? null,
        })
        .returning();
      vocabItem = inserted;
    }

    // 2. Link to user_vocabulary
    const existingUserVocab = await this.database
      .select()
      .from(userVocabulary)
      .where(
        and(
          eq(userVocabulary.userLanguageId, data.userLanguageId),
          eq(userVocabulary.vocabularyId, vocabItem.id),
        ),
      )
      .limit(1);

    let userVocabItem: UserVocabulary;
    if (existingUserVocab.length > 0) {
      const [updated] = await this.database
        .update(userVocabulary)
        .set({
          timesSeen: existingUserVocab[0].timesSeen + 1,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userVocabulary.id, existingUserVocab[0].id))
        .returning();
      userVocabItem = updated;
    } else {
      const [insertedUserVocab] = await this.database
        .insert(userVocabulary)
        .values({
          userLanguageId: data.userLanguageId,
          vocabularyId: vocabItem.id,
          status: "learning",
          confidence: 0.1,
          timesSeen: 1,
          timesCorrect: 0,
          lastSeenAt: new Date(),
        })
        .returning();
      userVocabItem = insertedUserVocab;
    }

    return { vocabulary: vocabItem, userVocabulary: userVocabItem };
  }

  /**
   * Updates topic progress for a user (attempts, correct attempts, confidence, status).
   */
  async updateTopicProgress(data: {
    userLanguageId: string;
    topicId: string;
    status?: ProgressStatus;
    isCorrect?: boolean;
    confidenceDelta?: number;
  }): Promise<UserTopicProgress> {
    const existing = await this.database
      .select()
      .from(userTopicProgress)
      .where(
        and(
          eq(userTopicProgress.userLanguageId, data.userLanguageId),
          eq(userTopicProgress.topicId, data.topicId),
        ),
      )
      .limit(1);

    const isCorrect = data.isCorrect ?? true;
    const delta = data.confidenceDelta ?? (isCorrect ? 0.1 : -0.1);

    if (existing.length > 0) {
      const current = existing[0];
      const newAttempts = current.attempts + 1;
      const newCorrect = current.correctAttempts + (isCorrect ? 1 : 0);
      const newConfidence = Math.max(0, Math.min(1, current.confidence + delta));
      const newStatus =
        data.status ??
        (newConfidence >= 0.85
          ? "mastered"
          : newConfidence >= 0.5
            ? "review"
            : "learning");

      const [updated] = await this.database
        .update(userTopicProgress)
        .set({
          attempts: newAttempts,
          correctAttempts: newCorrect,
          confidence: newConfidence,
          status: newStatus,
          lastPracticedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userTopicProgress.id, current.id))
        .returning();

      return updated;
    }

    const initialConfidence = Math.max(0, Math.min(1, isCorrect ? 0.3 : 0.0));
    const [inserted] = await this.database
      .insert(userTopicProgress)
      .values({
        userLanguageId: data.userLanguageId,
        topicId: data.topicId,
        status: data.status ?? "learning",
        confidence: initialConfidence,
        attempts: 1,
        correctAttempts: isCorrect ? 1 : 0,
        lastPracticedAt: new Date(),
      })
      .returning();

    return inserted;
  }

  /**
   * Updates vocabulary progress for a user (repetitions, correct count, confidence).
   */
  async updateVocabularyProgress(data: {
    userLanguageId: string;
    vocabularyId: string;
    status?: ProgressStatus;
    isCorrect?: boolean;
    confidenceDelta?: number;
  }): Promise<UserVocabulary> {
    const existing = await this.database
      .select()
      .from(userVocabulary)
      .where(
        and(
          eq(userVocabulary.userLanguageId, data.userLanguageId),
          eq(userVocabulary.vocabularyId, data.vocabularyId),
        ),
      )
      .limit(1);

    const isCorrect = data.isCorrect ?? true;
    const delta = data.confidenceDelta ?? (isCorrect ? 0.15 : -0.1);

    if (existing.length > 0) {
      const current = existing[0];
      const newTimesSeen = current.timesSeen + 1;
      const newTimesCorrect = current.timesCorrect + (isCorrect ? 1 : 0);
      const newConfidence = Math.max(0, Math.min(1, current.confidence + delta));
      const newStatus =
        data.status ??
        (newConfidence >= 0.85
          ? "mastered"
          : newConfidence >= 0.5
            ? "review"
            : "learning");

      const [updated] = await this.database
        .update(userVocabulary)
        .set({
          timesSeen: newTimesSeen,
          timesCorrect: newTimesCorrect,
          confidence: newConfidence,
          status: newStatus,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userVocabulary.id, current.id))
        .returning();

      return updated;
    }

    const [inserted] = await this.database
      .insert(userVocabulary)
      .values({
        userLanguageId: data.userLanguageId,
        vocabularyId: data.vocabularyId,
        status: data.status ?? "learning",
        confidence: isCorrect ? 0.3 : 0.0,
        timesSeen: 1,
        timesCorrect: isCorrect ? 1 : 0,
        lastSeenAt: new Date(),
      })
      .returning();

    return inserted;
  }
}

export const learningService = new LearningService();
