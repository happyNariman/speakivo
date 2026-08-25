import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../../src/db/client.js";
import {
  users,
  userLanguages,
  learningTopics,
  userTopicProgress,
  vocabulary,
  userVocabulary,
  learningMistakes,
  learningSessions,
  conversationMessages,
  languageLevelAssessments,
  type User,
  type UserLanguage,
  type LearningSession,
} from "../../src/db/schema/index.js";
import { userService } from "../../src/services/user-service.js";
import { learningService } from "../../src/services/learning-service.js";
import { conversationService } from "../../src/services/conversation-service.js";
import { assessmentService } from "../../src/services/assessment-service.js";
import type { AgentContext } from "../../src/agent/language-agent.js";
import type { EvalCase, EvalSetup } from "../types.js";

export interface EvalFixtureContext {
  user: User;
  userLanguage: UserLanguage;
  session: LearningSession;
  agentContext: AgentContext;
  createdTopicIds: string[];
  createdVocabIds: string[];
  createdAssessmentIds: string[];
  teardown: () => Promise<void>;
}

/**
 * Creates isolated database fixtures for a single evaluation case.
 */
export async function setupEvalFixtures(
  evalCase: EvalCase,
): Promise<EvalFixtureContext> {
  const testTelegramId = 980000000 + Math.floor(Math.random() * 10000000);
  const createdTopicIds: string[] = [];
  const createdVocabIds: string[] = [];
  const createdAssessmentIds: string[] = [];

  // 1. Create isolated user
  const user = await userService.findOrCreateByTelegram({
    id: testTelegramId,
    username: `eval_${evalCase.id.slice(0, 20)}`,
    first_name: "EvalTester",
  });

  // 2. Create user language profile
  const userLang = await learningService.setUserLanguage(
    user.id,
    evalCase.user.languageCode,
    evalCase.user.level,
    evalCase.user.nativeLanguageCode,
  );

  // Set levelSource if specified
  if (evalCase.user.levelSource && evalCase.user.levelSource !== "default") {
    await db
      .update(userLanguages)
      .set({ levelSource: evalCase.user.levelSource })
      .where(eq(userLanguages.id, userLang.id));
    userLang.levelSource = evalCase.user.levelSource;
  }

  // 3. Create active session
  const session = await conversationService.getOrCreateActiveSession(
    user.id,
    userLang.id,
  );

  // 4. Seed previous messages if defined in setup
  if (evalCase.setup?.previousMessages) {
    for (const msg of evalCase.setup.previousMessages) {
      await conversationService.saveMessage({
        sessionId: session.id,
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // 5. Seed topics and topic progress if defined in setup
  if (evalCase.setup?.topics) {
    for (const topicData of evalCase.setup.topics) {
      const slug =
        topicData.slug ??
        `eval-${topicData.name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 6)}`;

      // Check if topic exists
      const existingTopics = await db
        .select()
        .from(learningTopics)
        .where(
          and(
            eq(learningTopics.languageCode, evalCase.user.languageCode),
            eq(learningTopics.slug, slug),
          ),
        )
        .limit(1);

      let topicId: string;
      if (existingTopics.length > 0) {
        topicId = existingTopics[0].id;
      } else {
        const [insertedTopic] = await db
          .insert(learningTopics)
          .values({
            languageCode: evalCase.user.languageCode,
            slug,
            name: topicData.name,
            type: topicData.type,
            level: evalCase.user.level,
          })
          .returning();
        topicId = insertedTopic.id;
        createdTopicIds.push(topicId);
      }

      await db.insert(userTopicProgress).values({
        userLanguageId: userLang.id,
        topicId,
        confidence: topicData.confidence,
        status: topicData.status,
        attempts: topicData.attempts ?? 1,
        correctAttempts: topicData.correctAttempts ?? 1,
      });
    }
  }

  // 6. Seed vocabulary and user_vocabulary if defined in setup
  if (evalCase.setup?.vocabulary) {
    for (const v of evalCase.setup.vocabulary) {
      const existingVocab = await db
        .select()
        .from(vocabulary)
        .where(
          and(
            eq(vocabulary.languageCode, evalCase.user.languageCode),
            eq(vocabulary.lemma, v.lemma.toLowerCase()),
          ),
        )
        .limit(1);

      let vocabId: string;
      if (existingVocab.length > 0) {
        vocabId = existingVocab[0].id;
      } else {
        const [insertedVocab] = await db
          .insert(vocabulary)
          .values({
            languageCode: evalCase.user.languageCode,
            lemma: v.lemma.toLowerCase(),
            word: v.word,
            translation: v.translation ?? null,
            partOfSpeech: v.partOfSpeech ?? null,
          })
          .returning();
        vocabId = insertedVocab.id;
        createdVocabIds.push(vocabId);
      }

      await db.insert(userVocabulary).values({
        userLanguageId: userLang.id,
        vocabularyId: vocabId,
        confidence: v.confidence,
        status: v.status,
        timesSeen: v.timesSeen ?? 1,
        timesCorrect: v.timesCorrect ?? 1,
      });
    }
  }

  // 7. Seed mistakes if defined in setup
  if (evalCase.setup?.mistakes) {
    for (const m of evalCase.setup.mistakes) {
      await db.insert(learningMistakes).values({
        userLanguageId: userLang.id,
        category: m.category,
        sourceText: m.sourceText,
        correctedText: m.correctedText ?? null,
        explanation: m.explanation ?? null,
      });
    }
  }

  // 8. Seed assessments if defined in setup
  if (evalCase.setup?.assessments) {
    for (const a of evalCase.setup.assessments) {
      const [insertedAssessment] = await db
        .insert(languageLevelAssessments)
        .values({
          userLanguageId: userLang.id,
          previousLevel: a.previousLevel,
          proposedLevel: a.proposedLevel,
          confidence: a.confidence,
          evidence: a.evidence,
          reason: a.reason,
          status: a.status,
          confirmedAt: a.status === "confirmed" ? new Date() : null,
        })
        .returning();
      createdAssessmentIds.push(insertedAssessment.id);
    }
  }

  // 9. Build AgentContext
  const agentContext: AgentContext = {
    userId: user.id,
    telegramUserId: testTelegramId,
    userLanguageId: userLang.id,
    languageCode: userLang.languageCode,
    level: userLang.level,
    sessionId: session.id,
    inputModality: "text",
    userService,
    learningService,
    conversationService,
    assessmentService,
  };

  // 10. Self-cleaning teardown function
  const teardown = async () => {
    try {
      if (user.id) {
        // Cascade delete on user removes user_languages, sessions, messages, progress, mistakes, assessments
        await db.delete(users).where(eq(users.id, user.id));
      }
      for (const vocabId of createdVocabIds) {
        await db.delete(vocabulary).where(eq(vocabulary.id, vocabId));
      }
      for (const topicId of createdTopicIds) {
        await db.delete(learningTopics).where(eq(learningTopics.id, topicId));
      }
    } catch (err) {
      console.error(`[eval teardown error] case=${evalCase.id}:`, err);
    }
  };

  return {
    user,
    userLanguage: userLang,
    session,
    agentContext,
    createdTopicIds,
    createdVocabIds,
    createdAssessmentIds,
    teardown,
  };
}
