import { eq, and, or, ilike, sql, desc, asc } from "drizzle-orm";
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
   * Retrieves a user language profile by its internal UUID.
   */
  async getUserLanguageById(userLanguageId: string): Promise<UserLanguage | null> {
    const rows = await this.database
      .select()
      .from(userLanguages)
      .where(eq(userLanguages.id, userLanguageId))
      .limit(1);

    return rows[0] ?? null;
  }

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
    learningTopicsCount: number;
    reviewTopicsCount: number;
    avgTopicConfidence: number;
    vocabularyCount: number;
    masteredVocabularyCount: number;
    learningVocabularyCount: number;
    reviewVocabularyCount: number;
    avgVocabularyConfidence: number;
    totalMistakesCount: number;
    recentMistakesCount: number;
  }> {
    const topicStats = await this.database
      .select({
        count: sql<number>`count(*)::int`,
        mastered: sql<number>`count(case when ${userTopicProgress.status} = 'mastered' then 1 end)::int`,
        learning: sql<number>`count(case when ${userTopicProgress.status} = 'learning' then 1 end)::int`,
        review: sql<number>`count(case when ${userTopicProgress.status} = 'review' then 1 end)::int`,
        avgConfidence: sql<number>`coalesce(avg(${userTopicProgress.confidence}), 0)::real`,
      })
      .from(userTopicProgress)
      .where(eq(userTopicProgress.userLanguageId, userLanguageId));

    const vocabStats = await this.database
      .select({
        count: sql<number>`count(*)::int`,
        mastered: sql<number>`count(case when ${userVocabulary.status} = 'mastered' then 1 end)::int`,
        learning: sql<number>`count(case when ${userVocabulary.status} = 'learning' then 1 end)::int`,
        review: sql<number>`count(case when ${userVocabulary.status} = 'review' then 1 end)::int`,
        avgConfidence: sql<number>`coalesce(avg(${userVocabulary.confidence}), 0)::real`,
      })
      .from(userVocabulary)
      .where(eq(userVocabulary.userLanguageId, userLanguageId));

    const mistakeStats = await this.database
      .select({
        count: sql<number>`count(*)::int`,
        recent: sql<number>`count(case when ${learningMistakes.createdAt} >= now() - interval '7 days' then 1 end)::int`,
      })
      .from(learningMistakes)
      .where(eq(learningMistakes.userLanguageId, userLanguageId));

    return {
      topicsCount: topicStats[0]?.count ?? 0,
      masteredTopicsCount: topicStats[0]?.mastered ?? 0,
      learningTopicsCount: topicStats[0]?.learning ?? 0,
      reviewTopicsCount: topicStats[0]?.review ?? 0,
      avgTopicConfidence: topicStats[0]?.avgConfidence ?? 0,
      vocabularyCount: vocabStats[0]?.count ?? 0,
      masteredVocabularyCount: vocabStats[0]?.mastered ?? 0,
      learningVocabularyCount: vocabStats[0]?.learning ?? 0,
      reviewVocabularyCount: vocabStats[0]?.review ?? 0,
      avgVocabularyConfidence: vocabStats[0]?.avgConfidence ?? 0,
      totalMistakesCount: mistakeStats[0]?.count ?? 0,
      recentMistakesCount: mistakeStats[0]?.recent ?? 0,
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
   * Finds a topic in the given language by name or slug.
   */
  async findTopicByNameOrSlug(
    languageCode: string,
    nameOrSlug: string,
  ): Promise<LearningTopic | null> {
    const trimmed = nameOrSlug.trim();
    if (!trimmed) return null;

    const rows = await this.database
      .select()
      .from(learningTopics)
      .where(
        and(
          eq(learningTopics.languageCode, languageCode),
          or(
            ilike(learningTopics.name, `%${trimmed}%`),
            ilike(learningTopics.slug, `%${trimmed.toLowerCase().replace(/\s+/g, "-")}%`),
          ),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Finds a vocabulary item in the given language by word or lemma.
   */
  async findVocabularyByWordOrLemma(
    languageCode: string,
    wordOrLemma: string,
  ): Promise<Vocabulary | null> {
    const trimmed = wordOrLemma.trim();
    if (!trimmed) return null;

    const rows = await this.database
      .select()
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.languageCode, languageCode),
          or(
            ilike(vocabulary.word, `%${trimmed}%`),
            ilike(vocabulary.lemma, `%${trimmed.toLowerCase()}%`),
          ),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Retrieves recent meaningful mistakes made by the user in the active language profile.
   */
  async getRecentMistakes(
    userLanguageId: string,
    limit = 5,
  ): Promise<
    Array<{
      id: string;
      category: MistakeCategory;
      sourceText: string;
      correctedText: string | null;
      explanation: string | null;
      topicId: string | null;
      vocabularyId: string | null;
      createdAt: Date;
    }>
  > {
    const effectiveLimit = Math.max(1, Math.min(10, limit));
    const rows = await this.database
      .select({
        id: learningMistakes.id,
        category: learningMistakes.category,
        sourceText: learningMistakes.sourceText,
        correctedText: learningMistakes.correctedText,
        explanation: learningMistakes.explanation,
        topicId: learningMistakes.topicId,
        vocabularyId: learningMistakes.vocabularyId,
        createdAt: learningMistakes.createdAt,
      })
      .from(learningMistakes)
      .where(eq(learningMistakes.userLanguageId, userLanguageId))
      .orderBy(desc(learningMistakes.createdAt))
      .limit(effectiveLimit);

    return rows;
  }

  /**
   * Records a user language learning mistake with strict language boundary validation.
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
    const userLang = await this.getUserLanguageById(data.userLanguageId);
    if (!userLang) {
      throw new Error(`User language profile ${data.userLanguageId} not found`);
    }

    // Language consistency: validate topic belongs to the same learning language
    if (data.topicId) {
      const [topic] = await this.database
        .select()
        .from(learningTopics)
        .where(eq(learningTopics.id, data.topicId))
        .limit(1);

      if (!topic) {
        throw new Error(`Topic with ID ${data.topicId} not found`);
      }
      if (topic.languageCode !== userLang.languageCode) {
        throw new Error(
          `Topic '${topic.name}' (${topic.languageCode}) does not belong to active language (${userLang.languageCode})`,
        );
      }
    }

    // Language consistency: validate vocabulary belongs to the same learning language
    if (data.vocabularyId) {
      const [vocab] = await this.database
        .select()
        .from(vocabulary)
        .where(eq(vocabulary.id, data.vocabularyId))
        .limit(1);

      if (!vocab) {
        throw new Error(`Vocabulary item with ID ${data.vocabularyId} not found`);
      }
      if (vocab.languageCode !== userLang.languageCode) {
        throw new Error(
          `Vocabulary '${vocab.lemma}' (${vocab.languageCode}) does not belong to active language (${userLang.languageCode})`,
        );
      }
    }

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
   * Prevents duplicates and strictly validates language consistency.
   */
  async saveVocabulary(data: {
    userLanguageId: string;
    languageCode: string;
    lemma: string;
    word: string;
    translation?: string;
    partOfSpeech?: string;
  }): Promise<{ vocabulary: Vocabulary; userVocabulary: UserVocabulary }> {
    const userLang = await this.getUserLanguageById(data.userLanguageId);
    if (!userLang) {
      throw new Error(`User language profile ${data.userLanguageId} not found`);
    }

    const targetLanguageCode = userLang.languageCode;
    const normalizedLemma = data.lemma.trim().toLowerCase();
    const normalizedWord = data.word.trim();

    // 1. Find or insert vocabulary
    const existingVocab = await this.database
      .select()
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.languageCode, targetLanguageCode),
          eq(vocabulary.lemma, normalizedLemma),
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
          languageCode: targetLanguageCode,
          lemma: normalizedLemma,
          word: normalizedWord,
          translation: data.translation?.trim() ?? null,
          partOfSpeech: data.partOfSpeech?.trim() ?? null,
        })
        .returning();
      vocabItem = inserted;
    }

    // 2. Link to user_vocabulary (prevent duplicate records)
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
   * Updates topic progress for a user with language validation and invariant checks.
   */
  async updateTopicProgress(data: {
    userLanguageId: string;
    topicId: string;
    status?: ProgressStatus;
    isCorrect?: boolean;
    confidenceDelta?: number;
  }): Promise<UserTopicProgress> {
    const userLang = await this.getUserLanguageById(data.userLanguageId);
    if (!userLang) {
      throw new Error(`User language profile ${data.userLanguageId} not found`);
    }

    // Validate topic existence and language consistency
    const [topic] = await this.database
      .select()
      .from(learningTopics)
      .where(eq(learningTopics.id, data.topicId))
      .limit(1);

    if (!topic) {
      throw new Error(`Topic with ID ${data.topicId} not found`);
    }
    if (topic.languageCode !== userLang.languageCode) {
      throw new Error(
        `Topic '${topic.name}' (${topic.languageCode}) does not belong to active language (${userLang.languageCode})`,
      );
    }

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
      const newCorrect = Math.min(
        newAttempts,
        current.correctAttempts + (isCorrect ? 1 : 0),
      );
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
   * Updates vocabulary progress for a user with language validation and invariant checks.
   */
  async updateVocabularyProgress(data: {
    userLanguageId: string;
    vocabularyId: string;
    status?: ProgressStatus;
    isCorrect?: boolean;
    confidenceDelta?: number;
  }): Promise<UserVocabulary> {
    const userLang = await this.getUserLanguageById(data.userLanguageId);
    if (!userLang) {
      throw new Error(`User language profile ${data.userLanguageId} not found`);
    }

    // Validate vocabulary existence and language consistency
    const [vocab] = await this.database
      .select()
      .from(vocabulary)
      .where(eq(vocabulary.id, data.vocabularyId))
      .limit(1);

    if (!vocab) {
      throw new Error(`Vocabulary item with ID ${data.vocabularyId} not found`);
    }
    if (vocab.languageCode !== userLang.languageCode) {
      throw new Error(
        `Vocabulary '${vocab.lemma}' (${vocab.languageCode}) does not belong to active language (${userLang.languageCode})`,
      );
    }

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
      const newTimesCorrect = Math.min(
        newTimesSeen,
        current.timesCorrect + (isCorrect ? 1 : 0),
      );
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
