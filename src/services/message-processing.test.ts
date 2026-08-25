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
import type {
  SpeechToTextService,
  SpeechToTextInput,
  TranscriptionResult,
} from "../audio/speech-to-text.service.js";
import type {
  TextToSpeechService,
  TextToSpeechInput,
  TextToSpeechResult,
} from "../audio/text-to-speech.service.js";

describe("MessageProcessingService — Text & Voice Pipeline with Response Modality", () => {
  const testTelegramId = 889000000 + Math.floor(Math.random() * 100000);
  let testUserId: string;

  const fakeTTSAudio = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);

  const mockTTS: TextToSpeechService = {
    synthesize: async (input: TextToSpeechInput): Promise<TextToSpeechResult> => {
      return {
        audio: fakeTTSAudio,
        format: "opus",
        mimeType: "audio/ogg",
        durationSeconds: 3.5,
        usage: { characters: input.text.length },
      };
    },
  };

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

  it("should process a text message, defaulting to text output", async () => {
    const service = new MessageProcessingService(
      userService,
      learningService,
      conversationService,
      usageService,
      assessmentService,
      mockSTT,
      mockTTS,
    );

    const result = await service.processTextMessage({
      telegramUser: {
        id: testTelegramId,
        username: "modality_tester",
        first_name: "Modality",
        last_name: "Tester",
      },
      text: "Hello! What is the weather like today?",
    });

    assert.equal(result.finalModality, "text");
    assert.equal(result.audioBuffer, undefined);
    assert.ok(result.response);
    assert.ok(result.userMessageId);
    assert.ok(result.assistantMessageId);

    // Verify user message in DB
    const [userMsg] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, result.userMessageId!));

    assert.ok(userMsg);
    assert.equal(userMsg.messageType, "text");
    assert.equal(userMsg.role, "user");

    // Verify assistant message in DB
    const [assistantMsg] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, result.assistantMessageId!));

    assert.ok(assistantMsg);
    assert.equal(assistantMsg.messageType, "text");
    assert.equal(assistantMsg.role, "assistant");

    // Get user id for cleanup
    const user = await userService.findOrCreateByTelegram({
      id: testTelegramId,
    });
    testUserId = user.id;
  });

  it("should process voice message, defaulting to voice output with TTS synthesis and ai_usage", async () => {
    const service = new MessageProcessingService(
      userService,
      learningService,
      conversationService,
      usageService,
      assessmentService,
      mockSTT,
      mockTTS,
    );

    const result = await service.processVoiceMessage({
      telegramUser: {
        id: testTelegramId,
        username: "modality_tester",
        first_name: "Modality",
        last_name: "Tester",
      },
      audioBuffer: Buffer.from("mock-audio-data"),
      mimeType: "audio/ogg",
      telegramFileId: "tg_file_voice_12345",
      durationSeconds: 4,
    });

    assert.equal(result.finalModality, "voice");
    assert.ok(result.audioBuffer);
    assert.equal(result.audioMimeType, "audio/ogg");
    assert.equal(result.transcript, "Yesterday I went to the grocery store.");
    assert.ok(result.response);
    assert.ok(result.userMessageId);
    assert.ok(result.assistantMessageId);

    // Verify conversation message in DB recorded as voice
    const [savedAssistantMsg] = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.id, result.assistantMessageId!));

    assert.ok(savedAssistantMsg);
    assert.equal(savedAssistantMsg.messageType, "voice");

    // Verify AI Usage records: speech_to_text, agent_response, and text_to_speech
    const usageRecords = await db
      .select()
      .from(aiUsage)
      .where(eq(aiUsage.userId, testUserId));

    const sttUsage = usageRecords.find((r) => r.operation === "speech_to_text");
    assert.ok(sttUsage, "Expected speech_to_text in ai_usage");

    const ttsUsage = usageRecords.find((r) => r.operation === "text_to_speech");
    assert.ok(ttsUsage, "Expected text_to_speech in ai_usage");
    assert.equal(ttsUsage.inputModality, "text");
    assert.equal(ttsUsage.outputModality, "audio");
  });

  it("should respect explicit written request during voice message (voice -> text)", async () => {
    const customSTT: SpeechToTextService = {
      transcribe: async (): Promise<TranscriptionResult> => {
        return {
          text: "Explain Past Simple, but answer in writing please.",
          language: "en",
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
      customSTT,
      mockTTS,
    );

    const result = await service.processVoiceMessage({
      telegramUser: {
        id: testTelegramId,
        username: "modality_tester",
      },
      audioBuffer: Buffer.from("mock-audio-data"),
    });

    assert.equal(result.finalModality, "text");
    assert.equal(result.audioBuffer, undefined);
  });

  it("should respect explicit voice request during text message (text -> voice)", async () => {
    const service = new MessageProcessingService(
      userService,
      learningService,
      conversationService,
      usageService,
      assessmentService,
      mockSTT,
      mockTTS,
    );

    const result = await service.processTextMessage({
      telegramUser: {
        id: testTelegramId,
        username: "modality_tester",
      },
      text: "Can you pronounce this word for me? Please answer with a voice message.",
    });

    assert.equal(result.finalModality, "voice");
    assert.ok(result.audioBuffer);
  });

  it("should fallback gracefully to text when TTS fails", async () => {
    const failingTTS: TextToSpeechService = {
      synthesize: async () => {
        throw new Error("TTS provider connection failed");
      },
    };

    const service = new MessageProcessingService(
      userService,
      learningService,
      conversationService,
      usageService,
      assessmentService,
      mockSTT,
      failingTTS,
    );

    const result = await service.processVoiceMessage({
      telegramUser: {
        id: testTelegramId,
        username: "modality_tester",
      },
      audioBuffer: Buffer.from("mock-audio-data"),
    });

    // Should not throw; should deliver text response
    assert.equal(result.finalModality, "text");
    assert.equal(result.audioBuffer, undefined);
    assert.ok(result.response);
  });

  it("should handle empty transcription by returning a retry message without calling Agent or TTS", async () => {
    const emptySTT: SpeechToTextService = {
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
      emptySTT,
      mockTTS,
    );

    const result = await service.processVoiceMessage({
      telegramUser: {
        id: testTelegramId,
        username: "modality_tester",
      },
      audioBuffer: Buffer.from("silent-audio"),
    });

    assert.equal(result.finalModality, "text");
    assert.match(result.response, /couldn't understand that voice message/i);
    assert.equal(result.userMessageId, undefined);
  });

  it("should fail gracefully when Speech-to-Text service throws an error", async () => {
    const brokenSTT: SpeechToTextService = {
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
      brokenSTT,
      mockTTS,
    );

    await assert.rejects(
      async () => {
        await service.processVoiceMessage({
          telegramUser: {
            id: testTelegramId,
            username: "modality_tester",
          },
          audioBuffer: Buffer.from("bad-audio"),
        });
      },
      /Speech-to-Text network timeout/,
    );
  });
});
