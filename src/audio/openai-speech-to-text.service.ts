import OpenAI, { toFile } from "openai";
import { env } from "../config/env.js";
import type {
  SpeechToTextService,
  SpeechToTextInput,
  TranscriptionResult,
} from "./speech-to-text.service.js";

export class OpenAISpeechToTextService implements SpeechToTextService {
  private readonly client: OpenAI;

  constructor(client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async transcribe(input: SpeechToTextInput): Promise<TranscriptionResult> {
    const {
      audioBuffer,
      mimeType = "audio/ogg",
      filename = "voice.ogg",
      language,
    } = input;

    let buffer: Buffer;
    if (Buffer.isBuffer(audioBuffer)) {
      buffer = audioBuffer;
    } else if (audioBuffer instanceof Uint8Array) {
      buffer = Buffer.from(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength);
    } else {
      buffer = Buffer.from(audioBuffer);
    }

    const file = await toFile(buffer, filename, { type: mimeType });
    const model = env.OPENAI_TRANSCRIPTION_MODEL;

    const response = await this.client.audio.transcriptions.create({
      file,
      model,
      ...(language ? { language } : {}),
    });

    const text = typeof response === "string" ? response : response.text ?? "";
    const resObj = (typeof response === "object" && response !== null
      ? (response as unknown as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    return {
      text: text.trim(),
      language: (resObj.language as string | undefined) ?? language,
      durationSeconds: typeof resObj.duration === "number" ? resObj.duration : undefined,
      model,
      usage: resObj.usage as Record<string, unknown> | undefined,
    };
  }
}

export const speechToTextService = new OpenAISpeechToTextService();
