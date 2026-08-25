export interface TextToSpeechInput {
  text: string;
  languageCode?: string;
  voice?: string;
  instructions?: string;
  format?: "opus" | "mp3" | "aac" | "flac" | "wav" | "pcm";
}

export interface TextToSpeechResult {
  audio: Buffer;
  format: string; // e.g. "opus"
  mimeType: string; // e.g. "audio/ogg" or "audio/mpeg"
  durationSeconds?: number;
  usage?: {
    characters?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface TextToSpeechService {
  synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult>;
}
