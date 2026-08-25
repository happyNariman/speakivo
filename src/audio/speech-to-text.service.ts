export interface SpeechToTextInput {
  /**
   * Raw audio data in ArrayBuffer or Buffer.
   */
  audioBuffer: ArrayBuffer | Buffer | Uint8Array;

  /**
   * MIME type of the audio (e.g. "audio/ogg", "audio/mpeg"). Defaults to "audio/ogg".
   */
  mimeType?: string;

  /**
   * Filename for the audio upload. Defaults to "voice.ogg".
   */
  filename?: string;

  /**
   * Optional ISO-639-1 language code hint (e.g. "en", "de", "es", "fr").
   */
  language?: string;
}

export interface TranscriptionResult {
  /**
   * The transcribed text.
   */
  text: string;

  /**
   * Detected or provided language code.
   */
  language?: string;

  /**
   * Audio duration in seconds if available from provider metadata.
   */
  durationSeconds?: number;

  /**
   * Model used for transcription.
   */
  model?: string;

  /**
   * Optional provider-specific usage details if available.
   */
  usage?: Record<string, unknown>;
}

export interface SpeechToTextService {
  /**
   * Transcribes the provided audio into text.
   */
  transcribe(input: SpeechToTextInput): Promise<TranscriptionResult>;
}
