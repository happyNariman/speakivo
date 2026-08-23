import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ModelResponse } from "@openai/agents";
import { Usage } from "@openai/agents";
import { usageService, UsageService } from "./usage-service.js";
import { userService } from "./user-service.js";
import { learningService } from "./learning-service.js";
import { conversationService } from "./conversation-service.js";
import { db, queryClient } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

describe("Stage 4 — AI Usage Tracking & Analytics", () => {
  const testTelegramId = 888000000 + Math.floor(Math.random() * 100000);
  let testUserId: string;
  let testSessionId: string;
  let testMessageId: string;

  before(async () => {
    await db.delete(users).where(eq(users.telegramId, testTelegramId));
  });

  // Close DB connection pool and clean up test data after test suite
  after(async () => {
    try {
      if (testUserId) {
        await db.delete(users).where(eq(users.id, testUserId));
      }
    } catch (err) {
      console.error("[test cleanup error]", err);
    } finally {
      await queryClient.end();
    }
  });

  it("setup: create test user, session, and message", async () => {
    const user = await userService.findOrCreateByTelegram({
      id: testTelegramId,
      username: "usage_test_user",
      first_name: "Usage",
      last_name: "Tester",
    });
    testUserId = user.id;

    const userLang = await learningService.setUserLanguage(
      testUserId,
      "en",
      "B1",
    );

    const session = await conversationService.getOrCreateActiveSession(
      testUserId,
      userLang.id,
    );
    testSessionId = session.id;

    const message = await conversationService.saveMessage({
      sessionId: testSessionId,
      role: "user",
      content: "Hello, testing AI usage tracking!",
    });
    testMessageId = message.id;

    assert.ok(testUserId);
    assert.ok(testSessionId);
    assert.ok(testMessageId);
  });

  // 1. Single usage record persistence
  describe("recordUsage", () => {
    it("should persist a single AI usage record with all token counters and metadata", async () => {
      const record = await usageService.recordUsage({
        userId: testUserId,
        sessionId: testSessionId,
        messageId: testMessageId,
        runId: randomUUID(),
        agentName: "language-tutor",
        provider: "openai",
        model: "gpt-5.6-luna",
        operation: "agent_response",
        inputModality: "text",
        outputModality: "text",
        requestId: "req_test_123",
        responseId: "resp_test_456",
        inputTokens: 150,
        outputTokens: 50,
        totalTokens: 200,
        inputTextTokens: 150,
        cachedInputTokens: 30,
        usageDetails: { custom_flag: true, speed_tier: "standard" },
      });

      assert.ok(record.id);
      assert.equal(record.userId, testUserId);
      assert.equal(record.sessionId, testSessionId);
      assert.equal(record.messageId, testMessageId);
      assert.equal(record.provider, "openai");
      assert.equal(record.model, "gpt-5.6-luna");
      assert.equal(record.operation, "agent_response");
      assert.equal(record.inputTokens, 150);
      assert.equal(record.outputTokens, 50);
      assert.equal(record.totalTokens, 200);
      assert.equal(record.inputTextTokens, 150);
      assert.equal(record.inputAudioTokens, null);
      assert.equal(record.cachedInputTokens, 30);
      assert.deepEqual(record.usageDetails, {
        custom_flag: true,
        speed_tier: "standard",
      });
    });

    it("should persist a usage record with nullable session and message", async () => {
      const record = await usageService.recordUsage({
        userId: testUserId,
        provider: "openai",
        model: "gpt-4o-mini",
        operation: "embedding",
        inputTokens: 25,
        outputTokens: 0,
        totalTokens: 25,
      });

      assert.ok(record.id);
      assert.equal(record.userId, testUserId);
      assert.equal(record.sessionId, null);
      assert.equal(record.messageId, null);
      assert.equal(record.inputTokens, 25);
    });
  });

  // 2. Multiple model requests in one Agent run
  describe("recordAgentRunUsage — multiple requests", () => {
    it("should record multiple usage rows correlated by runId for one Agent run", async () => {
      const runId = randomUUID();

      // Simulate 3 model responses generated during 1 Agent run (e.g. initial request -> tool call -> final response)
      const mockUsage1 = new Usage({
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 10, text_tokens: 90 },
      });
      const mockUsage2 = new Usage({
        input_tokens: 200,
        output_tokens: 40,
        total_tokens: 240,
      });
      const mockUsage3 = new Usage({
        input_tokens: 150,
        output_tokens: 60,
        total_tokens: 210,
      });

      const mockResponses: ModelResponse[] = [
        {
          usage: mockUsage1,
          output: [],
          requestId: "req_multi_1",
          responseId: "resp_multi_1",
        },
        {
          usage: mockUsage2,
          output: [],
          requestId: "req_multi_2",
          responseId: "resp_multi_2",
        },
        {
          usage: mockUsage3,
          output: [],
          requestId: "req_multi_3",
          responseId: "resp_multi_3",
        },
      ];

      const records = await usageService.recordAgentRunUsage({
        userId: testUserId,
        sessionId: testSessionId,
        messageId: testMessageId,
        runId,
        agentName: "language-tutor",
        provider: "openai",
        model: "gpt-5.6-luna",
        operation: "agent_response",
        rawResponses: mockResponses,
      });

      assert.equal(records.length, 3);
      for (const rec of records) {
        assert.equal(rec.runId, runId);
        assert.equal(rec.userId, testUserId);
        assert.equal(rec.sessionId, testSessionId);
      }

      assert.equal(records[0].inputTokens, 100);
      assert.equal(records[0].outputTokens, 20);
      assert.equal(records[0].cachedInputTokens, 10);
      assert.equal(records[0].requestId, "req_multi_1");

      assert.equal(records[1].inputTokens, 200);
      assert.equal(records[1].outputTokens, 40);

      assert.equal(records[2].inputTokens, 150);
      assert.equal(records[2].outputTokens, 60);
    });
  });

  // 3. Analytical summary queries
  describe("getUserUsageSummary", () => {
    it("should calculate correct aggregate totals for a user", async () => {
      const summary = await usageService.getUserUsageSummary(testUserId);

      // We inserted 1 (first test) + 1 (nullable test) + 3 (multi test) = 5 records
      assert.ok(summary.requestCount >= 5);
      assert.ok(summary.inputTokens >= 150 + 25 + 100 + 200 + 150);
      assert.ok(summary.outputTokens >= 50 + 0 + 20 + 40 + 60);
      assert.equal(
        summary.totalTokens,
        summary.inputTokens + summary.outputTokens,
      );
    });

    it("should return zeros for a user with no usage", async () => {
      const nonExistentUserId = randomUUID();
      const summary = await usageService.getUserUsageSummary(nonExistentUserId);

      assert.equal(summary.requestCount, 0);
      assert.equal(summary.inputTokens, 0);
      assert.equal(summary.outputTokens, 0);
      assert.equal(summary.totalTokens, 0);
    });
  });

  // 4. Grouped analytics queries
  describe("Grouped Analytics Queries", () => {
    it("getUserUsageByModel should group usage by model", async () => {
      const byModel = await usageService.getUserUsageByModel(testUserId);

      assert.ok(Array.isArray(byModel));
      assert.ok(byModel.length >= 2); // gpt-5.6-luna and gpt-4o-mini

      const lunaStats = byModel.find((m) => m.model === "gpt-5.6-luna");
      assert.ok(lunaStats);
      assert.ok(lunaStats.requestCount >= 4);
      assert.ok(lunaStats.totalTokens > 0);

      const miniStats = byModel.find((m) => m.model === "gpt-4o-mini");
      assert.ok(miniStats);
      assert.equal(miniStats.requestCount, 1);
      assert.equal(miniStats.totalTokens, 25);
    });

    it("getUserUsageByOperation should group usage by operation", async () => {
      const byOp = await usageService.getUserUsageByOperation(testUserId);

      assert.ok(Array.isArray(byOp));
      assert.ok(byOp.length >= 2); // agent_response and embedding

      const agentStats = byOp.find((o) => o.operation === "agent_response");
      assert.ok(agentStats);
      assert.ok(agentStats.requestCount >= 4);

      const embedStats = byOp.find((o) => o.operation === "embedding");
      assert.ok(embedStats);
      assert.equal(embedStats.requestCount, 1);
    });

    it("getUserUsage should retrieve individual records ordered chronologically descending", async () => {
      const records = await usageService.getUserUsage(testUserId, { limit: 10 });

      assert.ok(Array.isArray(records));
      assert.ok(records.length >= 5);
      // Verify descending order
      for (let i = 0; i < records.length - 1; i++) {
        assert.ok(
          new Date(records[i].createdAt).getTime() >=
            new Date(records[i + 1].createdAt).getTime(),
        );
      }
    });
  });

  // 5. Date range filtering
  describe("Date range filtering", () => {
    it("should filter usage by date range", async () => {
      const past = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const future = new Date(Date.now() + 1000 * 60 * 60); // 1 hour ahead

      const summary = await usageService.getUserUsageSummary(testUserId, {
        from: past,
        to: future,
      });
      assert.ok(summary.requestCount >= 5);

      const emptySummary = await usageService.getUserUsageSummary(testUserId, {
        from: new Date(Date.now() + 1000 * 60 * 10), // in the future
      });
      assert.equal(emptySummary.requestCount, 0);
    });
  });

  // 6. Error tolerance & resilience
  describe("Error tolerance", () => {
    it("recordAgentRunUsage should catch database errors and return empty array without throwing", async () => {
      const invalidUserId = randomUUID(); // Non-existent user will violate FK constraint

      // Temporarily silence console.error for expected DB failure in this test
      const originalConsoleError = console.error;
      console.error = () => {};

      try {
        const records = await usageService.recordAgentRunUsage({
          userId: invalidUserId,
          model: "gpt-5.6-luna",
          rawResponses: [
            {
              usage: new Usage({ input_tokens: 50, output_tokens: 10, total_tokens: 60 }),
              output: [],
            },
          ],
        });

        // Does not throw, returns empty array
        assert.deepEqual(records, []);
      } finally {
        console.error = originalConsoleError;
      }
    });
  });
});
