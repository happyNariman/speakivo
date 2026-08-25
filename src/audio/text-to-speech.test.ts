import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeMarkdownForSpeech } from "./markdown-normalizer.js";
import { OpenAITextToSpeechService } from "./openai-text-to-speech.service.js";
import { detectExplicitModalityRequest } from "../types/modality.js";

describe("Markdown Normalizer for TTS", () => {
  it("should strip bold, italic, and strikethrough formatting", () => {
    const input =
      "A small correction: **Yesterday I went to the cinema.** Use *went* instead of *go*.";
    const expected =
      "A small correction: Yesterday I went to the cinema. Use went instead of go.";
    assert.equal(normalizeMarkdownForSpeech(input), expected);
  });

  it("should strip inline code and code blocks while preserving words", () => {
    const input =
      "In this sentence, `went` is the past tense of `go`.\n```english\nI went home.\n```";
    const result = normalizeMarkdownForSpeech(input);
    assert.ok(result.includes("went is the past tense of go"));
    assert.ok(result.includes("I went home"));
    assert.ok(!result.includes("`"));
    assert.ok(!result.includes("```"));
  });

  it("should convert markdown links to plain text labels", () => {
    const input = "Check out this [Grammar Guide](https://example.com/grammar) for more examples.";
    const result = normalizeMarkdownForSpeech(input);
    assert.equal(result, "Check out this Grammar Guide for more examples.");
  });

  it("should normalize bullet points and numbered lists into readable sentences", () => {
    const input =
      "Here are three tips:\n- Practice daily\n- Record mistakes\n- Review vocabulary";
    const result = normalizeMarkdownForSpeech(input);
    assert.equal(
      result,
      "Here are three tips:. Practice daily. Record mistakes. Review vocabulary.",
    );
  });

  it("should handle empty or whitespace-only inputs gracefully", () => {
    assert.equal(normalizeMarkdownForSpeech(""), "");
    assert.equal(normalizeMarkdownForSpeech("   \n\n  "), "");
  });
});

describe("Explicit Modality Request Detection", () => {
  it("should detect explicit text requests", () => {
    assert.equal(
      detectExplicitModalityRequest("Explain Past Simple, but answer in writing."),
      "text",
    );
    assert.equal(
      detectExplicitModalityRequest("Please write the answer."),
      "text",
    );
    assert.equal(
      detectExplicitModalityRequest("Don't send a voice message, text only."),
      "text",
    );
    assert.equal(
      detectExplicitModalityRequest("Please reply in text."),
      "text",
    );
  });

  it("should detect explicit voice requests", () => {
    assert.equal(
      detectExplicitModalityRequest("Please answer with a voice message."),
      "voice",
    );
    assert.equal(
      detectExplicitModalityRequest("Can you say this out loud?"),
      "voice",
    );
    assert.equal(
      detectExplicitModalityRequest("Explain this word verbally."),
      "voice",
    );
    assert.equal(
      detectExplicitModalityRequest("Please reply by voice."),
      "voice",
    );
  });

  it("should return undefined for neutral messages and negative keyword mentions", () => {
    assert.equal(detectExplicitModalityRequest("What is the past tense of go?"), undefined);
    assert.equal(
      detectExplicitModalityRequest("Why do people say 'voice message'?"),
      undefined,
    );
    assert.equal(
      detectExplicitModalityRequest("I left a voice message for my mom yesterday."),
      undefined,
    );
  });
});

describe("OpenAITextToSpeechService", () => {
  it("should synthesize audio buffer using mock client", async () => {
    const fakeAudioData = new Uint8Array([0x4f, 0x67, 0x67, 0x53]); // OggS header
    const mockOpenAIClient: any = {
      audio: {
        speech: {
          create: async (params: any) => {
            assert.equal(params.input, "Hello world");
            assert.equal(params.response_format, "opus");
            return {
              arrayBuffer: async () => fakeAudioData.buffer,
            };
          },
        },
      },
    };

    const service = new OpenAITextToSpeechService(mockOpenAIClient);
    const result = await service.synthesize({
      text: "Hello world",
      languageCode: "en",
    });

    assert.ok(result.audio instanceof Buffer);
    assert.equal(result.format, "opus");
    assert.equal(result.mimeType, "audio/ogg");
    assert.equal(result.usage?.characters, 11);
  });

  it("should throw an error when text is empty", async () => {
    const mockOpenAIClient: any = {};
    const service = new OpenAITextToSpeechService(mockOpenAIClient);

    await assert.rejects(
      async () => service.synthesize({ text: "   " }),
      /Cannot synthesize empty text/,
    );
  });

  it("should propagate provider errors cleanly", async () => {
    const mockOpenAIClient: any = {
      audio: {
        speech: {
          create: async () => {
            throw new Error("Rate limit exceeded");
          },
        },
      },
    };

    const service = new OpenAITextToSpeechService(mockOpenAIClient);

    await assert.rejects(
      async () => service.synthesize({ text: "Test speech" }),
      /Rate limit exceeded/,
    );
  });
});
