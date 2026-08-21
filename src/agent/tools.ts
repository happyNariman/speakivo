import { tool } from "@openai/agents";
import { z } from "zod/v4";
import type { AgentContext } from "./language-agent.js";

/**
 * 1. get_user_profile: Retrieves user information and active language learning profile.
 */
export const getUserProfileTool = tool({
  name: "get_user_profile",
  description:
    "Get the current user's profile and active language learning level. Uses trusted context.",
  parameters: z.object({}),
  execute: async (_args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    const user = await ctx.userService.getUserById(ctx.userId);
    const languages = await ctx.learningService.getUserLanguages(ctx.userId);

    return JSON.stringify({
      userId: ctx.userId,
      telegramUserId: ctx.telegramUserId,
      username: user?.username,
      firstName: user?.firstName,
      activeLanguage: {
        userLanguageId: ctx.userLanguageId,
        languageCode: ctx.languageCode,
        level: ctx.level,
      },
      allLanguages: languages.map((l) => ({
        languageCode: l.languageCode,
        level: l.level,
        status: l.status,
      })),
    });
  },
});

/**
 * 2. get_learning_progress: Retrieves overall progress metrics for the user's active language.
 */
export const getLearningProgressTool = tool({
  name: "get_learning_progress",
  description:
    "Get summary statistics on topics mastered, vocabulary learned, and mistake counts for the current language.",
  parameters: z.object({}),
  execute: async (_args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    const progress = await ctx.learningService.getLearningProgress(
      ctx.userLanguageId,
    );
    return JSON.stringify({
      languageCode: ctx.languageCode,
      ...progress,
    });
  },
});

/**
 * 3. get_weak_topics: Retrieves topics with lowest confidence or marked for review.
 */
export const getWeakTopicsTool = tool({
  name: "get_weak_topics",
  description:
    "Retrieve the user's weakest topics or topics needing review in the current language to focus the lesson.",
  parameters: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe("Maximum number of weak topics to return"),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    const topics = await ctx.learningService.getWeakTopics(
      ctx.userLanguageId,
      args.limit,
    );
    return JSON.stringify({ topics });
  },
});

/**
 * 4. get_vocabulary_to_review: Retrieves vocabulary items due for review or with low confidence.
 */
export const getVocabularyToReviewTool = tool({
  name: "get_vocabulary_to_review",
  description:
    "Get vocabulary words that the user should review or practice in the current conversation.",
  parameters: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe("Maximum number of vocabulary words to review"),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    const vocabList = await ctx.learningService.getVocabularyToReview(
      ctx.userLanguageId,
      args.limit,
    );
    return JSON.stringify({ vocabulary: vocabList });
  },
});

/**
 * 5. record_learning_mistake: Records a grammar/vocabulary/spelling mistake made by the user.
 */
export const recordLearningMistakeTool = tool({
  name: "record_learning_mistake",
  description:
    "Record a language mistake made by the user (grammar, vocabulary, pronunciation, spelling, word_order) with correction and explanation.",
  parameters: z.object({
    category: z.enum([
      "grammar",
      "vocabulary",
      "pronunciation",
      "word_order",
      "spelling",
      "other",
    ]),
    sourceText: z
      .string()
      .describe("The text or phrase containing the user's mistake"),
    correctedText: z
      .string()
      .optional()
      .describe("The corrected version of the text"),
    explanation: z
      .string()
      .optional()
      .describe("Short explanation of the mistake and rule"),
    severity: z.enum(["low", "medium", "high"]).optional().default("medium"),
    topicId: z.string().uuid().optional(),
    vocabularyId: z.string().uuid().optional(),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    const mistake = await ctx.learningService.recordMistake({
      userLanguageId: ctx.userLanguageId,
      category: args.category,
      sourceText: args.sourceText,
      correctedText: args.correctedText,
      explanation: args.explanation,
      severity: args.severity,
      topicId: args.topicId,
      vocabularyId: args.vocabularyId,
    });

    return JSON.stringify({ success: true, mistakeId: mistake.id });
  },
});

/**
 * 6. save_vocabulary: Saves a new vocabulary word to the dictionary and links it to user.
 */
export const saveVocabularyTool = tool({
  name: "save_vocabulary",
  description:
    "Save a new word or phrase to the user's vocabulary list for tracking and future review.",
  parameters: z.object({
    word: z.string().describe("The word or phrase as used"),
    lemma: z
      .string()
      .describe("The dictionary base form (lemma) of the word, e.g. 'book', 'speak'"),
    translation: z.string().optional().describe("Translation or definition"),
    partOfSpeech: z
      .string()
      .optional()
      .describe("Part of speech: noun, verb, adjective, adverb, phrase"),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    const result = await ctx.learningService.saveVocabulary({
      userLanguageId: ctx.userLanguageId,
      languageCode: ctx.languageCode,
      word: args.word,
      lemma: args.lemma,
      translation: args.translation,
      partOfSpeech: args.partOfSpeech,
    });

    return JSON.stringify({
      success: true,
      vocabularyId: result.vocabulary.id,
      timesSeen: result.userVocabulary.timesSeen,
    });
  },
});

/**
 * 7. update_topic_progress: Updates user practice attempts and confidence on a topic.
 */
export const updateTopicProgressTool = tool({
  name: "update_topic_progress",
  description:
    "Update user progress and confidence after practicing a specific grammar or learning topic.",
  parameters: z.object({
    topicId: z.string().uuid().describe("The UUID of the learning topic"),
    isCorrect: z
      .boolean()
      .describe("Whether the user answered or applied the topic correctly"),
    status: z
      .enum(["not_started", "learning", "review", "mastered"])
      .optional(),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    const updated = await ctx.learningService.updateTopicProgress({
      userLanguageId: ctx.userLanguageId,
      topicId: args.topicId,
      isCorrect: args.isCorrect,
      status: args.status,
    });

    return JSON.stringify({
      success: true,
      attempts: updated.attempts,
      correctAttempts: updated.correctAttempts,
      confidence: updated.confidence,
      status: updated.status,
    });
  },
});

/**
 * 8. update_vocabulary_progress: Updates user practice attempts and confidence on a vocabulary word.
 */
export const updateVocabularyProgressTool = tool({
  name: "update_vocabulary_progress",
  description:
    "Update user progress, repetitions, and confidence after practicing a vocabulary word.",
  parameters: z.object({
    vocabularyId: z
      .string()
      .uuid()
      .describe("The UUID of the vocabulary item"),
    isCorrect: z
      .boolean()
      .describe("Whether the user used or recalled the word correctly"),
    status: z
      .enum(["not_started", "learning", "review", "mastered"])
      .optional(),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    const updated = await ctx.learningService.updateVocabularyProgress({
      userLanguageId: ctx.userLanguageId,
      vocabularyId: args.vocabularyId,
      isCorrect: args.isCorrect,
      status: args.status,
    });

    return JSON.stringify({
      success: true,
      timesSeen: updated.timesSeen,
      timesCorrect: updated.timesCorrect,
      confidence: updated.confidence,
      status: updated.status,
    });
  },
});

export const agentTools = [
  getUserProfileTool,
  getLearningProgressTool,
  getWeakTopicsTool,
  getVocabularyToReviewTool,
  recordLearningMistakeTool,
  saveVocabularyTool,
  updateTopicProgressTool,
  updateVocabularyProgressTool,
];
