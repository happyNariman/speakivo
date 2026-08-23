import { tool } from "@openai/agents";
import { z } from "zod/v4";
import type { AgentContext } from "./language-agent.js";

// ============================================================================
// READ-ONLY TOOLS (May be used whenever relevant to orient the lesson)
// ============================================================================

/**
 * 1. get_user_profile: Retrieves active learning language and registered language profiles.
 */
export const getUserProfileTool = tool({
  name: "get_user_profile",
  description:
    "Get the user's active learning language, level, and available language profiles.",
  parameters: z.object({}),
  execute: async (_args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    try {
      const languages = await ctx.learningService.getUserLanguages(ctx.userId);

      return JSON.stringify({
        activeLanguage: {
          languageCode: ctx.languageCode,
          level: ctx.level,
        },
        languages: languages.map((l) => ({
          languageCode: l.languageCode,
          level: l.level,
          status: l.status,
        })),
      });
    } catch (error) {
      return JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to get user profile",
      });
    }
  },
});

/**
 * 2. get_learning_progress: Retrieves aggregate learning stats for the active language.
 */
export const getLearningProgressTool = tool({
  name: "get_learning_progress",
  description:
    "Get aggregate learning stats (topics, vocabulary, mistakes count) for the active language.",
  parameters: z.object({}),
  execute: async (_args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    try {
      const progress = await ctx.learningService.getLearningProgress(
        ctx.userLanguageId,
      );

      return JSON.stringify({
        languageCode: ctx.languageCode,
        topics: {
          total: progress.topicsCount,
          mastered: progress.masteredTopicsCount,
          learning: progress.learningTopicsCount,
          review: progress.reviewTopicsCount,
        },
        vocabulary: {
          total: progress.vocabularyCount,
          mastered: progress.masteredVocabularyCount,
          learning: progress.learningVocabularyCount,
          review: progress.reviewVocabularyCount,
        },
        mistakes: {
          total: progress.totalMistakesCount,
          recent: progress.recentMistakesCount,
        },
      });
    } catch (error) {
      return JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get learning progress",
      });
    }
  },
});

/**
 * 3. get_weak_topics: Retrieves topics with lowest confidence or needing review.
 */
export const getWeakTopicsTool = tool({
  name: "get_weak_topics",
  description:
    "Retrieve topics with low confidence or needing review in the active learning language.",
  parameters: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe("Maximum number of weak topics to return (1-10)"),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    try {
      const topics = await ctx.learningService.getWeakTopics(
        ctx.userLanguageId,
        args.limit,
      );

      return JSON.stringify({
        topics: topics.map((t) => ({
          id: t.topicId,
          name: t.name,
          type: t.type,
          confidence: Number(t.confidence.toFixed(2)),
          status: t.status,
        })),
      });
    } catch (error) {
      return JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to get weak topics",
      });
    }
  },
});

/**
 * 4. get_vocabulary_to_review: Retrieves vocabulary items due for review.
 */
export const getVocabularyToReviewTool = tool({
  name: "get_vocabulary_to_review",
  description:
    "Retrieve vocabulary words due for review or needing practice in the active language.",
  parameters: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe("Maximum number of vocabulary words to return (1-20)"),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    try {
      const vocabList = await ctx.learningService.getVocabularyToReview(
        ctx.userLanguageId,
        args.limit,
      );

      return JSON.stringify({
        vocabulary: vocabList.map((v) => ({
          id: v.vocabularyId,
          word: v.word,
          lemma: v.lemma,
          translation: v.translation,
          confidence: Number(v.confidence.toFixed(2)),
          status: v.status,
        })),
      });
    } catch (error) {
      return JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get vocabulary to review",
      });
    }
  },
});

/**
 * 5. get_recent_mistakes: Retrieves recent meaningful mistakes in the active language.
 */
export const getRecentMistakesTool = tool({
  name: "get_recent_mistakes",
  description:
    "Retrieve recent meaningful mistakes made by the user in the active learning language.",
  parameters: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe("Maximum number of recent mistakes to return (1-10)"),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    try {
      const mistakes = await ctx.learningService.getRecentMistakes(
        ctx.userLanguageId,
        args.limit,
      );

      return JSON.stringify({
        mistakes: mistakes.map((m) => ({
          id: m.id,
          category: m.category,
          sourceText: m.sourceText,
          correctedText: m.correctedText,
          explanation: m.explanation,
          topicId: m.topicId,
          vocabularyId: m.vocabularyId,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      return JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get recent mistakes",
      });
    }
  },
});

// ============================================================================
// STATE-CHANGING / WRITE TOOLS (Only after concrete learning events / exercises)
// ============================================================================

/**
 * 6. record_learning_mistake: Records a genuine language error made by user.
 */
export const recordLearningMistakeTool = tool({
  name: "record_learning_mistake",
  description:
    "Record a genuine user mistake in target language with correction and explanation. Call only on real errors.",
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
    topicId: z.string().uuid().optional().describe("UUID from get_weak_topics"),
    vocabularyId: z
      .string()
      .uuid()
      .optional()
      .describe("UUID from get_vocabulary_to_review"),
  }),
  execute: async (args, runContext) => {
    const ctx = runContext?.context as AgentContext | undefined;
    if (!ctx) {
      return JSON.stringify({ error: "Missing agent context" });
    }

    try {
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
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to record mistake",
      });
    }
  },
});

/**
 * 7. save_vocabulary: Saves a new target language word to dictionary and user list.
 */
export const saveVocabularyTool = tool({
  name: "save_vocabulary",
  description:
    "Save a new target language word/phrase to user's vocabulary. Call only when explicitly taught or requested.",
  parameters: z.object({
    word: z.string().describe("The word or phrase as used"),
    lemma: z
      .string()
      .describe("The dictionary base form (lemma), e.g. 'book', 'speak'"),
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

    try {
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
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to save vocabulary",
      });
    }
  },
});

/**
 * 8. update_topic_progress: Updates progress on a topic after active practice.
 */
export const updateTopicProgressTool = tool({
  name: "update_topic_progress",
  description:
    "Update practice progress on a grammar topic after user actively practiced or answered an exercise.",
  parameters: z.object({
    topicId: z.string().uuid().describe("The exact UUID of the learning topic"),
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

    try {
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
        confidence: Number(updated.confidence.toFixed(2)),
        status: updated.status,
      });
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to update topic progress",
      });
    }
  },
});

/**
 * 9. update_vocabulary_progress: Updates progress on a word after active practice.
 */
export const updateVocabularyProgressTool = tool({
  name: "update_vocabulary_progress",
  description:
    "Update practice progress on a vocabulary word after user actively recalled or practiced that word.",
  parameters: z.object({
    vocabularyId: z
      .string()
      .uuid()
      .describe("The exact UUID of the vocabulary item"),
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

    try {
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
        confidence: Number(updated.confidence.toFixed(2)),
        status: updated.status,
      });
    } catch (error) {
      return JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to update vocabulary progress",
      });
    }
  },
});

// All 9 tools exported for Language Learning Agent
export const agentTools = [
  // 5 Read tools
  getUserProfileTool,
  getLearningProgressTool,
  getWeakTopicsTool,
  getVocabularyToReviewTool,
  getRecentMistakesTool,
  // 4 Write tools
  recordLearningMistakeTool,
  saveVocabularyTool,
  updateTopicProgressTool,
  updateVocabularyProgressTool,
];
