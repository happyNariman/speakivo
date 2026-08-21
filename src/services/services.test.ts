import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { userService } from "./user-service.js";
import { learningService } from "./learning-service.js";
import { conversationService } from "./conversation-service.js";
import { db, queryClient } from "../db/client.js";
import { learningTopics } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

// Close the DB connection pool after all tests complete
after(async () => {
  await queryClient.end();
});

describe("Stage 3 — Database & Domain Services", () => {
  const testTelegramId = 999000000 + Math.floor(Math.random() * 100000);
  let testUserId: string;
  let testUserLangId: string;
  let testSessionId: string;
  let sampleTopicId: string;
  let savedVocabId: string;

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
      const topics = await db
        .select()
        .from(learningTopics)
        .where(eq(learningTopics.languageCode, "en"))
        .limit(1);

      assert.ok(topics.length > 0, "Expected seeded English topics");
      sampleTopicId = topics[0].id;

      const progress = await learningService.updateTopicProgress({
        userLanguageId: testUserLangId,
        topicId: sampleTopicId,
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
        topicId: sampleTopicId,
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
      assert.equal(weakTopics[0].topicId, sampleTopicId);
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
  });

  // --- LearningService: Mistakes ---
  describe("LearningService — Mistakes", () => {
    it("should record a learning mistake with topic reference", async () => {
      const mistake = await learningService.recordMistake({
        userLanguageId: testUserLangId,
        category: "grammar",
        sourceText: "He go to school yesterday.",
        correctedText: "He went to school yesterday.",
        explanation: "Use past tense 'went' instead of present 'go'.",
        topicId: sampleTopicId,
        severity: "medium",
      });

      assert.ok(mistake.id);
      assert.equal(mistake.category, "grammar");
      assert.equal(mistake.sourceText, "He go to school yesterday.");
      assert.equal(mistake.topicId, sampleTopicId);
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

    it("should aggregate overall learning progress statistics", async () => {
      const stats = await learningService.getLearningProgress(testUserLangId);
      assert.ok(stats.topicsCount >= 1);
      assert.ok(stats.vocabularyCount >= 1);
      assert.ok(stats.totalMistakesCount >= 1);
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
      // Chronological order: first user, then assistant
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

  // --- Agent tools structure ---
  describe("Agent Tools Structure", () => {
    it("all 8 tools should be properly defined as function tools", async () => {
      const {
        getUserProfileTool,
        getLearningProgressTool,
        getWeakTopicsTool,
        getVocabularyToReviewTool,
        recordLearningMistakeTool,
        saveVocabularyTool,
        updateTopicProgressTool,
        updateVocabularyProgressTool,
        agentTools,
      } = await import("../agent/tools.js");

      // All 8 tools exist in the array
      assert.equal(agentTools.length, 8);

      // Each tool has correct type and structure
      const toolNames = agentTools.map((t) => t.name);
      assert.ok(toolNames.includes("get_user_profile"));
      assert.ok(toolNames.includes("get_learning_progress"));
      assert.ok(toolNames.includes("get_weak_topics"));
      assert.ok(toolNames.includes("get_vocabulary_to_review"));
      assert.ok(toolNames.includes("record_learning_mistake"));
      assert.ok(toolNames.includes("save_vocabulary"));
      assert.ok(toolNames.includes("update_topic_progress"));
      assert.ok(toolNames.includes("update_vocabulary_progress"));

      // All are function tools with invoke method
      for (const t of agentTools) {
        assert.equal(t.type, "function");
        assert.equal(typeof t.invoke, "function");
        assert.ok(t.description, `Tool ${t.name} should have a description`);
      }
    });
  });
});
