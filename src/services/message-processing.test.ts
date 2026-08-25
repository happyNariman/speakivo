import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, queryClient } from "../db/client.js";
import { users, conversationMessages, aiUsage } from "../db/schema/index.js";
import { MessageProcessingService } from "./message-processing-service.js";
import { userService } from "./user-service.js";
import { learningService } from "./learning-service.js";
import { conversationService } from "./conversation-service.js";
import { usageService } from "./usage-service.js";
import { assessmentService } from "./assessment-service.js";
import type { SpeechToTextService, SpeechToTextInput, TranscriptionResult } from "../audio/speech-to-text.service.js";

describe("MessageProcessingService — Text & Voice Pipeline", () => {
  const testTelegramId = 889000000 + Math.floor(Math.random() * 100000);
  let testUserId: string;

  before(async () => {
    await db.delete(users).where(eq(users.telegramId, testTelegramId));
  });

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

  it("should process a text message, persist messageType = text, and execute agent", async () => {
    const service = new MessageProcessingService(
      userService,
      learningService,
      conversationService,
      usageService,
      assessmentService,
    );

    const result = await service.processTextMessage({
      telegramUser: {
        id: testTelegramId,
        username: "voice_tester",
        first_name: "Voice",
        last_name: "Tester",
      },
      text: "Hello! What is the weather like today?",
    });

    assert.equal(result.isVoice, false);
    assert.ok(result.response);
    assert.ok(result.userMessageId);
    assert.ok(result.assistantMessageId);

    // Verify persisted message
    const [msg] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, result.userMessageId!));

    assert.ok(msg);
    assert.equal(msg.messageType, "text");
    assert.equal(msg.role, "user");
    assert.equal(msg.content, "Hello! What is the weather like today?");

    // Get user id for cleanup
    const user = await userService.findOrCreateByTelegram({
      id: testTelegramId,
    });
    testUserId = user.id;
  });

  it("should process a voice message, persist transcript with messageType = voice and voice metadata", async () => {
    const mockSTT: SpeechToTextService = {
      transcribe: async (input: SpeechToTextInput): Promise<TranscriptionResult> => {
        return {
          text: "Yesterday I went to the grocery store.",
          language: input.language ?? "en",
          durationSeconds: 4.2,
          model: "whisper-1",
          usage: { duration_seconds: 4.2 },
        };
      },
    };

    const service = new MessageProcessingService(
      userService,
      learningService,
      conversationService,
      usageService,
      assessmentService,
      mockSTT,
    );

    const result = await service.processVoiceMessage({
      telegramUser: {
        id: testTelegramId,
        username: "voice_tester",
        first_name: "Voice",
        last_name: "Tester",
      },
      audioBuffer: Buffer.from("mock-audio-data"),
      mimeType: "audio/ogg",
      telegramFileId: "tg_file_voice_12345",
      durationSeconds: 4,
    });

    assert.equal(result.isVoice, true);
    assert.equal(result.transcript, "Yesterday I went to the grocery store.");
    assert.ok(result.response);
    assert.ok(result.userMessageId);

    // Verify conversation message in DB
    const [savedMsg] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, result.userMessageId!));

    assert.ok(savedMsg);
    assert.equal(savedMsg.messageType, "voice");
    assert.equal(savedMsg.role, "user");
    assert.equal(savedMsg.content, "Yesterday I went to the grocery store.");
    assert.deepEqual(savedMsg.metadata, {
      telegramFileId: "tg_file_voice_12345",
      durationSeconds: 4,
      mimeType: "audio/ogg",
    });

    // Verify AI Usage has speech_to_text operation record
    const usageRecords = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.userId, testUserId));

    const sttUsage = usageRecords.find((r) => r.operation === "speech_to_text");
    assert.ok(sttUsage, "Expected speech_to_text usage record in ai_usage");
    assert.equal(sttUsage.inputModality, "audio");
    assert.equal(sttUsage.outputModality, "text");
    assert.equal(sttUsage.model, "whisper-1");
  });

  it("should handle empty transcription by returning a retry message without calling Agent", async () => {
    const mockSTT: SpeechToTextService = {
      transcribe: async (): Promise<TranscriptionResult> => {
        return {
          text: "   ",
          model: "whisper-1",
        };
      },
    };

    const service = new MessageProcessingService(
      userService,
      learningService,
      conversationService,
      usageService,
      assessmentService,
      mockSTT,
    );

    const result = await service.processVoiceMessage({
      telegramUser: {
        id: testTelegramId,
        username: "voice_tester",
      },
      audioBuffer: Buffer.from("silent-audio"),
      mimeType: "audio/ogg",
    });

    assert.equal(result.isVoice, true);
    assert.match(result.response, /couldn't understand that voice message/i);
    assert.equal(result.userMessageId, undefined);
  });

  it("should fail gracefully when Speech-to-Text service throws an error", async () => {
    const mockSTT: SpeechToTextService = {
      transcribe: async (): Promise<TranscriptionResult> => {
        throw new Error("Speech-to-Text network timeout");
      },
    };

    const service = new MessageProcessingService(
      userService,
      learningService,
      conversationService,
      usageService,
      assessmentService,
      mockSTT,
    );

    await assert.rejects(
      async () => {
        await service.processVoiceMessage({
          telegramUser: {
            id: testTelegramId,
            username: "voice_tester",
          },
          audioBuffer: Buffer.from("bad-audio"),
        });
      },
      /Speech-to-Text network timeout/,
    );
  });
});
