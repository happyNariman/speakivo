import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { RunContext } from "@openai/agents";
import { env } from "../config/env.js";
import { userService } from "./user-service.js";
import { learningService } from "./learning-service.js";
import { conversationService } from "./conversation-service.js";
import { assessmentService } from "./assessment-service.js";
import { db, queryClient } from "../db/client.js";
import {
  users,
  userLanguages,
  languageLevelAssessments,
} from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import type { AgentContext } from "../agent/language-agent.js";

describe("Dynamic Language Level Assessment & Confirmation", () => {
  const testTelegramId = 998000000 + Math.floor(Math.random() * 100000);
  const foreignTelegramId = 997000000 + Math.floor(Math.random() * 100000);

  let testUserId: string;
  let foreignUserId: string;
  let testUserLangId: string;
  let foreignUserLangId: string;
  let sampleAssessmentId: string;

  before(async () => {
    // Clean up any potential collisions
    await db.delete(users).where(eq(users.telegramId, testTelegramId));
    await db.delete(users).where(eq(users.telegramId, foreignTelegramId));

    // Setup primary test user & English A1 profile
    const user = await userService.findOrCreateByTelegram({
      id: testTelegramId,
      username: "assessment_tester",
      first_name: "John",
    });
    testUserId = user.id;

    const userLang = await learningService.setUserLanguage(
      testUserId,
      "en",
      "A1",
    );
    testUserLangId = userLang.id;

    // Setup secondary foreign user for ownership tests
    const foreignUser = await userService.findOrCreateByTelegram({
      id: foreignTelegramId,
      username: "foreign_tester",
      first_name: "Maria",
    });
    foreignUserId = foreignUser.id;

    const foreignLang = await learningService.setUserLanguage(
      foreignUserId,
      "en",
      "A1",
    );
    foreignUserLangId = foreignLang.id;
  });

  after(async () => {
    try {
      if (testUserId) {
        await db.delete(users).where(eq(users.id, testUserId));
      }
      if (foreignUserId) {
        await db.delete(users).where(eq(users.id, foreignUserId));
      }
    } catch (err) {
      console.error("[test cleanup error]", err);
    } finally {
      await queryClient.end();
    }
  });

  // 1. Assessment Creation & Validation Invariants
  describe("Assessment Creation & Validation", () => {
    it("should create a valid pending assessment proposal with evidence and confidence", async () => {
      const assessment = await assessmentService.createAssessment({
        userLanguageId: testUserLangId,
        proposedLevel: "B1",
        confidence: 0.85,
        evidence: [
          "Uses past, present, and future tenses consistently",
          "Can explain everyday situations with minor errors",
          "Demonstrates solid intermediate vocabulary",
          "Understands multi-step questions spontaneously",
          "Maintains conversational flow without long pauses",
        ],
        reason: "User answers demonstrate consistent B1 capability.",
      });

      assert.ok(assessment.id);
      assert.equal(assessment.userLanguageId, testUserLangId);
      assert.equal(assessment.previousLevel, "A1");
      assert.equal(assessment.proposedLevel, "B1");
      assert.equal(assessment.confidence, 0.85);
      assert.equal(assessment.status, "pending");
      assert.equal(assessment.evidence.length, 5);
      assert.equal(assessment.confirmedAt, null);

      sampleAssessmentId = assessment.id;

      // Ensure user_languages.level was NOT modified yet
      const lang = await learningService.getUserLanguageById(testUserLangId);
      assert.equal(lang?.level, "A1");
    });

    it("should reject assessment with confidence below env threshold", async () => {
      await assert.rejects(
        async () => {
          await assessmentService.createAssessment({
            userLanguageId: testUserLangId,
            proposedLevel: "B1",
            confidence: 0.5, // below env.LANGUAGE_LEVEL_MIN_CONFIDENCE (0.75)
            evidence: ["1", "2", "3", "4", "5"],
            reason: "Sample reason",
          });
        },
        /below required minimum threshold/,
      );
    });

    it("should reject assessment with invalid confidence (> 1 or < 0)", async () => {
      await assert.rejects(
        async () => {
          await assessmentService.createAssessment({
            userLanguageId: testUserLangId,
            proposedLevel: "B1",
            confidence: 1.5, // invalid
            evidence: ["1", "2", "3", "4", "5"],
            reason: "Sample reason",
          });
        },
        /Confidence must be a number between 0.0 and 1.0/,
      );
    });

    it("should reject assessment with fewer evidence items than env threshold", async () => {
      await assert.rejects(
        async () => {
          await assessmentService.createAssessment({
            userLanguageId: testUserLangId,
            proposedLevel: "B1",
            confidence: 0.85,
            evidence: ["Only one evidence point", "Second point"], // fewer than 5
            reason: "Sample reason",
          });
        },
        /below required minimum threshold/,
      );
    });

    it("should reject assessment with empty reason", async () => {
      await assert.rejects(
        async () => {
          await assessmentService.createAssessment({
            userLanguageId: testUserLangId,
            proposedLevel: "B1",
            confidence: 0.8,
            evidence: ["1", "2", "3", "4", "5"],
            reason: "   ", // empty whitespace
          });
        },
        /Assessment reason must not be empty/,
      );
    });

    it("should automatically expire prior pending assessment when creating a new one", async () => {
      const newAssessment = await assessmentService.createAssessment({
        userLanguageId: testUserLangId,
        proposedLevel: "B2",
        confidence: 0.88,
        evidence: [
          "Understands nuanced idioms",
          "Maintains fluent discussion",
          "Applies complex subjunctive conditionals",
          "Rich topical vocabulary range",
          "Spontaneous discourse management",
        ],
        reason: "Further practice indicates B2 fluency.",
      });

      assert.equal(newAssessment.status, "pending");
      assert.equal(newAssessment.proposedLevel, "B2");

      // Verify previous assessment was marked expired
      const prev = await assessmentService.getAssessmentById(sampleAssessmentId);
      assert.equal(prev?.status, "expired");

      sampleAssessmentId = newAssessment.id;
    });
  });

  // 2. Assessment Ownership & Security
  describe("Assessment Ownership & Security", () => {
    it("should reject confirming an assessment belonging to another user", async () => {
      await assert.rejects(
        async () => {
          // Foreign user attempts to confirm test user's assessment
          await assessmentService.confirmAssessment({
            userLanguageId: foreignUserLangId,
            assessmentId: sampleAssessmentId,
          });
        },
        /does not belong to user language/,
      );
    });

    it("should reject rejecting an assessment belonging to another user", async () => {
      await assert.rejects(
        async () => {
          await assessmentService.rejectAssessment({
            userLanguageId: foreignUserLangId,
            assessmentId: sampleAssessmentId,
          });
        },
        /does not belong to user language/,
      );
    });
  });

  // 3. Confirmation & Atomic Persistence
  describe("Confirmation & Atomic Transaction", () => {
    it("should atomically confirm pending assessment and update user_languages.level", async () => {
      const result = await assessmentService.confirmAssessment({
        userLanguageId: testUserLangId,
        assessmentId: sampleAssessmentId,
      });

      // Assessment record updated
      assert.equal(result.assessment.status, "confirmed");
      assert.ok(result.assessment.confirmedAt);

      // User language updated
      assert.equal(result.userLanguage.level, "B2");
      assert.equal(result.userLanguage.levelSource, "confirmed");

      // Verify in DB directly
      const dbLang = await learningService.getUserLanguageById(testUserLangId);
      assert.equal(dbLang?.level, "B2");
      assert.equal(dbLang?.levelSource, "confirmed");
    });

    it("should reject confirming an already confirmed assessment", async () => {
      await assert.rejects(
        async () => {
          await assessmentService.confirmAssessment({
            userLanguageId: testUserLangId,
            assessmentId: sampleAssessmentId,
          });
        },
        /cannot be confirmed because it is already 'confirmed'/,
      );
    });
  });

  // 4. Rejection Handling
  describe("Rejection Handling", () => {
    it("should reject a pending assessment without modifying user_languages.level", async () => {
      const proposal = await assessmentService.createAssessment({
        userLanguageId: testUserLangId,
        proposedLevel: "C1",
        confidence: 0.76,
        evidence: [
          "Attempted advanced syntax",
          "Used sophisticated idioms",
          "Understood complex podcast excerpt",
          "Demonstrated near-native fluency",
          "Minor lexical collocation errors",
        ],
        reason: "C1 trial proposal.",
      });

      assert.equal(proposal.status, "pending");

      const rejected = await assessmentService.rejectAssessment({
        userLanguageId: testUserLangId,
        assessmentId: proposal.id,
      });

      assert.equal(rejected.status, "rejected");

      // Verify level remains B2
      const lang = await learningService.getUserLanguageById(testUserLangId);
      assert.equal(lang?.level, "B2");
    });
  });

  // 5. Level Regression Support (e.g. B2 -> B1)
  describe("Level Regression Support", () => {
    it("should support lowering level when evidence indicates regression (B2 -> B1)", async () => {
      const regressionProposal = await assessmentService.createAssessment({
        userLanguageId: testUserLangId,
        proposedLevel: "B1",
        confidence: 0.82,
        evidence: [
          "Consistent struggle with complex conditionals",
          "Frequent basic tense errors during spontaneous production",
          "Limited vocabulary range in unfamiliar topics",
          "Need for simplified explanations",
          "Difficulty following fast paced speech",
        ],
        reason: "User feels more comfortable solidifying B1 foundation.",
      });

      assert.equal(regressionProposal.previousLevel, "B2");
      assert.equal(regressionProposal.proposedLevel, "B1");

      const confirmed = await assessmentService.confirmAssessment({
        userLanguageId: testUserLangId,
        assessmentId: regressionProposal.id,
      });

      assert.equal(confirmed.userLanguage.level, "B1");
      assert.equal(confirmed.userLanguage.levelSource, "confirmed");
    });
  });

  // 6. Agent Tools Layer
  describe("Agent Tools (assess_language_level & confirm_language_level)", () => {
    it("all 11 tools should be registered and properly configured", async () => {
      const { agentTools } = await import("../agent/tools.js");

      assert.equal(agentTools.length, 11);
      const names = agentTools.map((t) => t.name);

      assert.ok(names.includes("get_user_profile"));
      assert.ok(names.includes("get_learning_progress"));
      assert.ok(names.includes("get_weak_topics"));
      assert.ok(names.includes("get_vocabulary_to_review"));
      assert.ok(names.includes("get_recent_mistakes"));
      assert.ok(names.includes("record_learning_mistake"));
      assert.ok(names.includes("save_vocabulary"));
      assert.ok(names.includes("update_topic_progress"));
      assert.ok(names.includes("update_vocabulary_progress"));
      assert.ok(names.includes("assess_language_level"));
      assert.ok(names.includes("confirm_language_level"));
    });

    it("assess_language_level tool should create proposal and return compact JSON", async () => {
      const { assessLanguageLevelTool } = await import("../agent/tools.js");

      const mockCtx: AgentContext = {
        userId: testUserId,
        telegramUserId: testTelegramId,
        userLanguageId: testUserLangId,
        languageCode: "en",
        level: "B1",
        sessionId: randomUUID(),
        inputModality: "text",
        userService,
        learningService,
        conversationService,
        assessmentService,
      };

      const runCtx = new RunContext(mockCtx);

      const assessJson = (await assessLanguageLevelTool.invoke(
        runCtx,
        JSON.stringify({
          proposedLevel: "B2",
          confidence: 0.85,
          evidence: [
            "Consistent complex syntax",
            "Rich vocabulary in context",
            "Accurate tense shifts across narrative",
            "Spontaneous reaction to abstract prompts",
            "Low error rate on subordinate clauses",
          ],
          reason: "Candidate demonstrated B2 competence in diagnostic exercises.",
        }),
      )) as string;

      const assessResult = JSON.parse(assessJson);
      assert.equal(assessResult.success, true);
      assert.ok(assessResult.assessmentId);
      assert.equal(assessResult.proposedLevel, "B2");
      assert.equal(assessResult.status, "pending");

      // Verify level not changed yet
      const currentLang = await learningService.getUserLanguageById(testUserLangId);
      assert.equal(currentLang?.level, "B1");

      // Now confirm through confirm_language_level tool (without explicit assessmentId - resolves latest pending)
      const { confirmLanguageLevelTool } = await import("../agent/tools.js");

      const confirmJson = (await confirmLanguageLevelTool.invoke(
        runCtx,
        "{}",
      )) as string;

      const confirmResult = JSON.parse(confirmJson);
      assert.equal(confirmResult.success, true);
      assert.equal(confirmResult.newLevel, "B2");
      assert.equal(confirmResult.status, "confirmed");

      // Verify level is now B2
      const updatedLang = await learningService.getUserLanguageById(testUserLangId);
      assert.equal(updatedLang?.level, "B2");
    });
  });
});
