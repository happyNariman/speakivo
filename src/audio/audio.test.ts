import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { OpenAISpeechToTextService } from "./openai-speech-to-text.service.js";

describe("OpenAI Speech-to-Text Service", () => {
  it("should transcribe audio buffer successfully and return trimmed text", async () => {
    let capturedArgs: unknown = null;

    const mockOpenAI = {
      audio: {
        transcriptions: {
          create: async (args: unknown) => {
            capturedArgs = args;
            return {
              text: "  Hello, this is a transcribed voice message.  ",
              language: "en",
              duration: 3.5,
              usage: { type: "duration", seconds: 3.5 },
            };
          },
        },
      },
    } as unknown as OpenAI;

    const stt = new OpenAISpeechToTextService(mockOpenAI);
    const audioData = new Uint8Array([0x4f, 0x67, 0x67, 0x53]); // Dummy Ogg header bytes

    const result = await stt.transcribe({
      audioBuffer: audioData,
      mimeType: "audio/ogg",
      filename: "test.ogg",
      language: "en",
    });

    assert.equal(result.text, "Hello, this is a transcribed voice message.");
    assert.equal(result.language, "en");
    assert.equal(result.durationSeconds, 3.5);
    assert.equal(result.model, "whisper-1");
    assert.deepEqual(result.usage, { type: "duration", seconds: 3.5 });

    const args = capturedArgs as { language?: string; model?: string };
    assert.equal(args.language, "en");
    assert.equal(args.model, "whisper-1");
  });

  it("should support German language hint", async () => {
    let passedLanguage: string | undefined;

    const mockOpenAI = {
      audio: {
        transcriptions: {
          create: async (args: { language?: string }) => {
            passedLanguage = args.language;
            return {
              text: "Guten Tag, wie geht es dir?",
              language: "de",
              duration: 2.1,
            };
          },
        },
      },
    } as unknown as OpenAI;

    const stt = new OpenAISpeechToTextService(mockOpenAI);
    const audioData = Buffer.from("dummy-german-audio");

    const result = await stt.transcribe({
      audioBuffer: audioData,
      language: "de",
    });

    assert.equal(passedLanguage, "de");
    assert.equal(result.text, "Guten Tag, wie geht es dir?");
    assert.equal(result.language, "de");
  });

  it("should handle empty transcription string from provider", async () => {
    const mockOpenAI = {
      audio: {
        transcriptions: {
          create: async () => {
            return {
              text: "   ",
            };
          },
        },
      },
    } as unknown as OpenAI;

    const stt = new OpenAISpeechToTextService(mockOpenAI);
    const result = await stt.transcribe({
      audioBuffer: Buffer.from("empty-audio"),
    });

    assert.equal(result.text, "");
  });

  it("should propagate provider errors cleanly", async () => {
    const mockOpenAI = {
      audio: {
        transcriptions: {
          create: async () => {
            throw new Error("OpenAI Rate Limit Exceeded (429)");
          },
        },
      },
    } as unknown as OpenAI;

    const stt = new OpenAISpeechToTextService(mockOpenAI);

    await assert.rejects(
      async () => {
        await stt.transcribe({ audioBuffer: Buffer.from("audio") });
      },
      /Rate Limit Exceeded/,
    );
  });
});
