import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { userService } from "./user-service.js";
import { learningService } from "./learning-service.js";
import { conversationService } from "./conversation-service.js";
import { db, queryClient } from "../db/client.js";
import {
  learningTopics,
  users,
  vocabulary,
  userVocabulary,
} from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import type { AgentContext } from "../agent/language-agent.js";

describe("Database, Domain Services & Safe Agent Tools", () => {
  const testTelegramId = 999000000 + Math.floor(Math.random() * 100000);
  let testUserId: string;
  let testUserLangId: string;
  let testGermanLangId: string;
  let testSessionId: string;
  let sampleEnglishTopicId: string;
  let sampleGermanTopicId: string;
  let savedVocabId: string;
  let sampleGermanVocabId: string;

  before(async () => {
    await db.delete(users).where(eq(users.telegramId, testTelegramId));
  });

  // Clean up test data and close DB connection pool after suite
  after(async () => {
    try {
      if (testUserId) {
        await db.delete(users).where(eq(users.id, testUserId));
      }
      if (savedVocabId) {
        await db
          .delete(userVocabulary)
          .where(eq(userVocabulary.vocabularyId, savedVocabId));
        await db.delete(vocabulary).where(eq(vocabulary.id, savedVocabId));
      }
    } catch (err) {
      console.error("[test cleanup error]", err);
    } finally {
      await queryClient.end();
    }
  });

  // --- UserService ---
  describe("UserService", () => {
    it("should create a new user from Telegram data", async () => {
      const user = await userService.findOrCreateByTelegram({
        id: testTelegramId,
        username: "test_polyglot",
        first_name: "Alex",
        last_name: "Test",
      });

      assert.ok(user.id);
      assert.equal(user.telegramId, testTelegramId);
      assert.equal(user.username, "test_polyglot");
      testUserId = user.id;
    });

    it("should reuse the existing user (same telegram_id) and update profile fields", async () => {
      const user = await userService.findOrCreateByTelegram({
        id: testTelegramId,
        username: "updated_username",
        first_name: "Alex",
      });

      assert.equal(user.id, testUserId);
      assert.equal(user.username, "updated_username");
    });

    it("should retrieve a user by internal UUID", async () => {
      const user = await userService.getUserById(testUserId);
      assert.ok(user);
      assert.equal(user.id, testUserId);
      assert.equal(user.telegramId, testTelegramId);
    });
  });

  // --- LearningService: Languages ---
  describe("LearningService — Languages", () => {
    it("should create a language profile for the user", async () => {
      const userLang = await learningService.setUserLanguage(
        testUserId,
        "en",
        "A2",
      );

      assert.ok(userLang.id);
      assert.equal(userLang.userId, testUserId);
      assert.equal(userLang.languageCode, "en");
      assert.equal(userLang.level, "A2");
      assert.equal(userLang.status, "active");
      testUserLangId = userLang.id;
    });

    it("should update level without duplicating user_languages record", async () => {
      const updated = await learningService.setUserLanguage(
        testUserId,
        "en",
        "B1",
      );

      assert.equal(updated.id, testUserLangId);
      assert.equal(updated.level, "B1");

      const allLangs = await learningService.getUserLanguages(testUserId);
      const enLangs = allLangs.filter((l) => l.languageCode === "en");
      assert.equal(enLangs.length, 1);
    });

    it("should allow multiple distinct languages for the same user", async () => {
      const deLang = await learningService.setUserLanguage(
        testUserId,
        "de",
        "A1",
      );

      assert.ok(deLang.id);
      assert.notEqual(deLang.id, testUserLangId);
      assert.equal(deLang.languageCode, "de");
      testGermanLangId = deLang.id;

      const allLangs = await learningService.getUserLanguages(testUserId);
      assert.ok(allLangs.length >= 2);
    });

    it("should return the active language profile", async () => {
      const active = await learningService.getActiveLanguage(testUserId);
      assert.ok(active);
      assert.equal(active.status, "active");
    });
  });

  // --- LearningService: Topics & Progress ---
  describe("LearningService — Topics & Progress", () => {
    it("should fetch seeded topics and create topic progress", async () => {
      const enTopics = await db
        .select()
        .from(learningTopics)
        .where(eq(learningTopics.languageCode, "en"))
        .limit(1);

      const deTopics = await db
        .select()
        .from(learningTopics)
        .where(eq(learningTopics.languageCode, "de"))
        .limit(1);

      assert.ok(enTopics.length > 0, "Expected seeded English topics");
      assert.ok(deTopics.length > 0, "Expected seeded German topics");
      sampleEnglishTopicId = enTopics[0].id;
      sampleGermanTopicId = deTopics[0].id;

      const progress = await learningService.updateTopicProgress({
        userLanguageId: testUserLangId,
        topicId: sampleEnglishTopicId,
        isCorrect: true,
      });

      assert.ok(progress.id);
      assert.equal(progress.attempts, 1);
      assert.equal(progress.correctAttempts, 1);
      assert.ok(progress.confidence > 0 && progress.confidence <= 1);
    });

    it("should update progress on subsequent practice", async () => {
      const progress = await learningService.updateTopicProgress({
        userLanguageId: testUserLangId,
        topicId: sampleEnglishTopicId,
        isCorrect: true,
      });

      assert.equal(progress.attempts, 2);
      assert.equal(progress.correctAttempts, 2);
      assert.ok(progress.confidence > 0);
    });

    it("should return weak topics ordered by confidence", async () => {
      const weakTopics = await learningService.getWeakTopics(
        testUserLangId,
        5,
      );
      assert.ok(Array.isArray(weakTopics));
      assert.ok(weakTopics.length > 0);
      assert.equal(weakTopics[0].topicId, sampleEnglishTopicId);
    });
  });

  // --- LearningService: Vocabulary ---
  describe("LearningService — Vocabulary", () => {
    it("should save vocabulary and link to user vocabulary list", async () => {
      const result = await learningService.saveVocabulary({
        userLanguageId: testUserLangId,
        languageCode: "en",
        lemma: "wanderlust",
        word: "wanderlust",
        translation: "a strong desire to travel",
        partOfSpeech: "noun",
      });

      assert.ok(result.vocabulary.id);
      assert.ok(result.userVocabulary.id);
      assert.equal(result.vocabulary.lemma, "wanderlust");
      assert.equal(result.userVocabulary.timesSeen, 1);
      savedVocabId = result.vocabulary.id;

      // Seed German vocab lookup for cross-language check
      const deVocabs = await db
        .select()
        .from(vocabulary)
        .where(eq(vocabulary.languageCode, "de"))
        .limit(1);
      if (deVocabs.length > 0) {
        sampleGermanVocabId = deVocabs[0].id;
      }
    });

    it("should update vocabulary progress on practice", async () => {
      const updated = await learningService.updateVocabularyProgress({
        userLanguageId: testUserLangId,
        vocabularyId: savedVocabId,
        isCorrect: true,
      });

      assert.equal(updated.timesSeen, 2);
      assert.equal(updated.timesCorrect, 1);
      assert.ok(updated.confidence > 0);
    });

    it("should return vocabulary due for review", async () => {
      const reviewList = await learningService.getVocabularyToReview(
        testUserLangId,
        10,
      );
      assert.ok(Array.isArray(reviewList));
      assert.ok(reviewList.some((v) => v.vocabularyId === savedVocabId));
    });

    it("should prevent duplicate vocabulary records when saving existing word", async () => {
      const result = await learningService.saveVocabulary({
        userLanguageId: testUserLangId,
        languageCode: "en",
        lemma: "wanderlust",
        word: "wanderlust",
      });

      assert.equal(result.vocabulary.id, savedVocabId);
      assert.equal(result.userVocabulary.timesSeen, 3); // incremented timesSeen
    });
  });

  // --- LearningService: Mistakes & Recent Mistakes ---
  describe("LearningService — Mistakes & Recent Mistakes", () => {
    let testMistakeId: string;

    it("should record a learning mistake with topic reference", async () => {
      const mistake = await learningService.recordMistake({
        userLanguageId: testUserLangId,
        category: "grammar",
        sourceText: "He go to school yesterday.",
        correctedText: "He went to school yesterday.",
        explanation: "Use past tense 'went' instead of present 'go'.",
        topicId: sampleEnglishTopicId,
        severity: "medium",
      });

      assert.ok(mistake.id);
      assert.equal(mistake.category, "grammar");
      assert.equal(mistake.sourceText, "He go to school yesterday.");
      assert.equal(mistake.topicId, sampleEnglishTopicId);
      testMistakeId = mistake.id;
    });

    it("should record a mistake with nullable topic and vocabulary", async () => {
      const mistake = await learningService.recordMistake({
        userLanguageId: testUserLangId,
        category: "spelling",
        sourceText: "recieve",
        correctedText: "receive",
        explanation: "i before e except after c",
      });

      assert.ok(mistake.id);
      assert.equal(mistake.topicId, null);
      assert.equal(mistake.vocabularyId, null);
    });

    it("should fetch recent mistakes ordered by creation date descending", async () => {
      const recent = await learningService.getRecentMistakes(testUserLangId, 5);

      assert.ok(Array.isArray(recent));
      assert.ok(recent.length >= 2);
      assert.equal(recent[0].category, "spelling"); // most recent first
      assert.ok(recent.some((m) => m.id === testMistakeId));
    });

    it("should aggregate overall learning progress statistics", async () => {
      const stats = await learningService.getLearningProgress(testUserLangId);
      assert.ok(stats.topicsCount >= 1);
      assert.ok(stats.vocabularyCount >= 1);
      assert.ok(stats.totalMistakesCount >= 2);
    });
  });

  // --- Language Consistency & Ownership Invariants ---
  describe("Language Consistency & Domain Invariants", () => {
    it("should reject updating topic progress for a topic from a different language", async () => {
      await assert.rejects(
        async () => {
          // Attempting to update German topic progress under English user profile
          await learningService.updateTopicProgress({
            userLanguageId: testUserLangId, // English
            topicId: sampleGermanTopicId, // German
            isCorrect: true,
          });
        },
        /does not belong to active language/,
      );
    });

    it("should reject updating vocabulary progress for a vocabulary item from a different language", async () => {
      if (sampleGermanVocabId) {
        await assert.rejects(
          async () => {
            // Attempting to update German vocab progress under English profile
            await learningService.updateVocabularyProgress({
              userLanguageId: testUserLangId, // English
              vocabularyId: sampleGermanVocabId, // German
              isCorrect: true,
            });
          },
          /does not belong to active language/,
        );
      }
    });

    it("should reject recording a mistake referencing a topic from a different language", async () => {
      await assert.rejects(
        async () => {
          await learningService.recordMistake({
            userLanguageId: testUserLangId, // English
            category: "grammar",
            sourceText: "Ich habe gegangen",
            topicId: sampleGermanTopicId, // German topic on English profile
          });
        },
        /does not belong to active language/,
      );
    });
  });

  // --- ConversationService ---
  describe("ConversationService", () => {
    it("should create an active session", async () => {
      const session = await conversationService.getOrCreateActiveSession(
        testUserId,
        testUserLangId,
      );

      assert.ok(session.id);
      assert.equal(session.userId, testUserId);
      assert.equal(session.userLanguageId, testUserLangId);
      assert.equal(session.endedAt, null);
      testSessionId = session.id;
    });

    it("should return the same session when called again", async () => {
      const session = await conversationService.getOrCreateActiveSession(
        testUserId,
        testUserLangId,
      );

      assert.equal(session.id, testSessionId);
    });

    it("should save messages and retrieve them chronologically", async () => {
      await conversationService.saveMessage({
        sessionId: testSessionId,
        role: "user",
        content: "Hi! Can we practice past tense?",
      });

      await conversationService.saveMessage({
        sessionId: testSessionId,
        role: "assistant",
        content: "Sure! Let's practice with irregular verbs.",
        inputTokens: 120,
        outputTokens: 45,
      });

      const messages = await conversationService.getRecentMessages(
        testSessionId,
        10,
      );

      assert.equal(messages.length, 2);
      assert.equal(messages[0].role, "user");
      assert.equal(messages[1].role, "assistant");
      assert.equal(messages[1].inputTokens, 120);
      assert.equal(messages[1].outputTokens, 45);
    });

    it("should close a session", async () => {
      const closed = await conversationService.closeSession(testSessionId);
      assert.ok(closed);
      assert.ok(closed.endedAt);
    });

    it("should create a new session after previous one is closed", async () => {
      const newSession = await conversationService.getOrCreateActiveSession(
        testUserId,
        testUserLangId,
      );

      assert.notEqual(newSession.id, testSessionId);
      assert.equal(newSession.endedAt, null);
    });
  });

  // --- Agent Tools Structure & Compact Output ---
  describe("Agent Tools Structure & Compact Payloads", () => {
    it("all 9 tools should be properly defined as function tools", async () => {
      const {
        getUserProfileTool,
        getLearningProgressTool,
        getWeakTopicsTool,
        getVocabularyToReviewTool,
        getRecentMistakesTool,
        recordLearningMistakeTool,
        saveVocabularyTool,
        updateTopicProgressTool,
        updateVocabularyProgressTool,
        assessLanguageLevelTool,
        confirmLanguageLevelTool,
        agentTools,
      } = await import("../agent/tools.js");

      // All 11 tools exist in the array (5 Read + 4 Learning Write + 2 Level Assessment)
      assert.equal(agentTools.length, 11);

      const toolNames = agentTools.map((t) => t.name);
      assert.ok(toolNames.includes("get_user_profile"));
      assert.ok(toolNames.includes("get_learning_progress"));
      assert.ok(toolNames.includes("get_weak_topics"));
      assert.ok(toolNames.includes("get_vocabulary_to_review"));
      assert.ok(toolNames.includes("get_recent_mistakes"));
      assert.ok(toolNames.includes("record_learning_mistake"));
      assert.ok(toolNames.includes("save_vocabulary"));
      assert.ok(toolNames.includes("update_topic_progress"));
      assert.ok(toolNames.includes("update_vocabulary_progress"));
      assert.ok(toolNames.includes("assess_language_level"));
      assert.ok(toolNames.includes("confirm_language_level"));

      for (const t of agentTools) {
        assert.equal(t.type, "function");
        assert.equal(typeof t.invoke, "function");
        assert.ok(t.description, `Tool ${t.name} should have a description`);
      }
    });

    it("read tools should produce compact JSON payloads without raw DB metadata", async () => {
      const { RunContext } = await import("@openai/agents");
      const { assessmentService } = await import("./assessment-service.js");
      const {
        getUserProfileTool,
        getLearningProgressTool,
        getWeakTopicsTool,
        getVocabularyToReviewTool,
        getRecentMistakesTool,
      } = await import("../agent/tools.js");

      const mockCtx: AgentContext = {
        userId: testUserId,
        telegramUserId: testTelegramId,
        userLanguageId: testUserLangId,
        languageCode: "en",
        level: "B1",
        sessionId: testSessionId,
        userService,
        learningService,
        conversationService,
        assessmentService,
      };

      const runCtx = new RunContext(mockCtx);

      // 1. get_user_profile
      const profileJson = (await getUserProfileTool.invoke(
        runCtx,
        "{}",
      )) as string;
      const profile = JSON.parse(profileJson);
      assert.ok(profile.activeLanguage);
      assert.equal(profile.activeLanguage.languageCode, "en");
      assert.equal(profile.userId, undefined); // No internal userId leaked
      assert.equal(profile.telegramUserId, undefined); // No Telegram ID leaked

      // 2. get_learning_progress
      const progressJson = (await getLearningProgressTool.invoke(
        runCtx,
        "{}",
      )) as string;
      const progress = JSON.parse(progressJson);
      assert.equal(progress.languageCode, "en");
      assert.ok(typeof progress.topics.total === "number");
      assert.ok(typeof progress.topics.review === "number");
      assert.ok(typeof progress.vocabulary.total === "number");
      assert.ok(typeof progress.vocabulary.review === "number");
      assert.ok(typeof progress.mistakes.recent === "number");

      // 3. get_weak_topics
      const weakJson = (await getWeakTopicsTool.invoke(
        runCtx,
        JSON.stringify({ limit: 5 }),
      )) as string;
      const weak = JSON.parse(weakJson);
      assert.ok(Array.isArray(weak.topics));

      // 4. get_vocabulary_to_review
      const vocabJson = (await getVocabularyToReviewTool.invoke(
        runCtx,
        JSON.stringify({ limit: 5 }),
      )) as string;
      const vocab = JSON.parse(vocabJson);
      assert.ok(Array.isArray(vocab.vocabulary));

      // 5. get_recent_mistakes
      const mistakesJson = (await getRecentMistakesTool.invoke(
        runCtx,
        JSON.stringify({ limit: 5 }),
      )) as string;
      const mistakes = JSON.parse(mistakesJson);
      assert.ok(Array.isArray(mistakes.mistakes));
    });
  });
});
