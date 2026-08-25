import OpenAI from "openai";
import { env } from "../config/env.js";
import type {
  TextToSpeechInput,
  TextToSpeechResult,
  TextToSpeechService,
} from "./text-to-speech.service.js";

const MAX_TTS_CHARS = 4000;

export class OpenAITextToSpeechService implements TextToSpeechService {
  private client: OpenAI;

  constructor(client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Synthesizes natural speech audio from input text using OpenAI Audio Speech API.
   */
  async synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    const rawText = input.text.trim();
    if (!rawText) {
      throw new Error("Cannot synthesize empty text.");
    }

    const model = env.OPENAI_TTS_MODEL;
    const voice = (input.voice ?? env.OPENAI_TTS_VOICE) as any;
    const format = input.format ?? "opus";
    const instructions = input.instructions ?? env.OPENAI_TTS_INSTRUCTIONS;

    const mimeType =
      format === "opus"
        ? "audio/ogg"
        : format === "mp3"
          ? "audio/mpeg"
          : format === "aac"
            ? "audio/aac"
            : format === "flac"
              ? "audio/flac"
              : format === "wav"
                ? "audio/wav"
                : "audio/ogg";

    // If text exceeds MAX_TTS_CHARS, split into sentence-preserving chunks
    if (rawText.length > MAX_TTS_CHARS) {
      const chunks = this.splitIntoChunks(rawText, MAX_TTS_CHARS);
      const audioBuffers: Buffer[] = [];
      let totalCharacters = 0;

      for (const chunk of chunks) {
        const chunkResult = await this.synthesizeSingleChunk({
          text: chunk,
          model,
          voice,
          format,
          instructions,
        });
        audioBuffers.push(chunkResult.audio);
        totalCharacters += chunk.length;
      }

      return {
        audio: Buffer.concat(audioBuffers),
        format,
        mimeType,
        usage: {
          characters: totalCharacters,
        },
      };
    }

    return await this.synthesizeSingleChunk({
      text: rawText,
      model,
      voice,
      format,
      instructions,
    });
  }

  private async synthesizeSingleChunk(params: {
    text: string;
    model: string;
    voice: any;
    format: "opus" | "mp3" | "aac" | "flac" | "wav" | "pcm";
    instructions?: string;
  }): Promise<TextToSpeechResult> {
    const { text, model, voice, format, instructions } = params;

    const requestPayload: any = {
      model,
      voice,
      input: text,
      response_format: format,
    };

    // If instructions are provided and model supports it, include instructions
    if (instructions && model.startsWith("gpt-4o-mini-tts")) {
      requestPayload.instructions = instructions;
    }

    const response = await this.client.audio.speech.create(requestPayload);
    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);

    const mimeType =
      format === "opus"
        ? "audio/ogg"
        : format === "mp3"
          ? "audio/mpeg"
          : "audio/ogg";

    return {
      audio,
      format,
      mimeType,
      usage: {
        characters: text.length,
      },
    };
  }

  /**
   * Splits a long text into multiple chunks respecting natural sentence boundaries.
   */
  private splitIntoChunks(text: string, maxChunkLength: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [text];
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= maxChunkLength) {
        currentChunk += sentence;
      } else {
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
        }
        if (sentence.length > maxChunkLength) {
          // If single sentence is somehow longer than maxChunkLength, split by words
          const words = sentence.split(" ");
          let wordChunk = "";
          for (const word of words) {
            if ((wordChunk + " " + word).length <= maxChunkLength) {
              wordChunk += (wordChunk ? " " : "") + word;
            } else {
              if (wordChunk) chunks.push(wordChunk);
              wordChunk = word;
            }
          }
          currentChunk = wordChunk;
        } else {
          currentChunk = sentence;
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

export const textToSpeechService = new OpenAITextToSpeechService();
