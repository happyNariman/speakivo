import type { AgentInputItem } from "@openai/agents";
import { env } from "../config/env.js";
import {
  userService,
  type TelegramUserData,
  type UserService,
} from "./user-service.js";
import {
  learningService,
  type LearningService,
  type CEFRLevel,
} from "./learning-service.js";
import {
  conversationService,
  type ConversationService,
} from "./conversation-service.js";
import { usageService, type UsageService } from "./usage-service.js";
import {
  assessmentService,
  type AssessmentService,
} from "./assessment-service.js";
import {
  runLanguageAgent,
  type AgentContext,
  type AgentRunResult,
} from "../agent/language-agent.js";
import type { SpeechToTextService } from "../audio/speech-to-text.service.js";
import { speechToTextService } from "../audio/openai-speech-to-text.service.js";
import type { TextToSpeechService } from "../audio/text-to-speech.service.js";
import { textToSpeechService } from "../audio/openai-text-to-speech.service.js";
import {
  type ResponseModality,
  detectExplicitModalityRequest,
} from "../types/modality.js";
import { normalizeMarkdownForSpeech } from "../audio/markdown-normalizer.js";

export interface ProcessTextMessageParams {
  telegramUser: TelegramUserData;
  text: string;
}

export interface ProcessVoiceMessageParams {
  telegramUser: TelegramUserData;
  audioBuffer: ArrayBuffer | Buffer | Uint8Array;
  mimeType?: string;
  telegramFileId?: string;
  durationSeconds?: number;
}

export interface ProcessMessageResult {
  response: string;
  transcript?: string;
  finalModality: ResponseModality;
  audioBuffer?: Buffer;
  audioMimeType?: string;
  userMessageId?: string;
  assistantMessageId?: string;
}

/**
 * Detects language keywords for automatic active profile switching.
 */
function detectLanguageCode(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("german") || lower.includes("deutsch")) return "de";
  if (lower.includes("spanish") || lower.includes("español")) return "es";
  if (lower.includes("french") || lower.includes("français")) return "fr";
  if (lower.includes("russian") || lower.includes("русский")) return "ru";
  if (lower.includes("italian") || lower.includes("italiano")) return "it";
  if (lower.includes("portuguese") || lower.includes("português")) return "pt";
  if (lower.includes("japanese") || lower.includes("日本語")) return "ja";
  if (lower.includes("korean") || lower.includes("한국어")) return "ko";
  if (lower.includes("chinese") || lower.includes("中文")) return "zh";
  if (lower.includes("english")) return "en";
  return null;
}

export class MessageProcessingService {
  constructor(
    private readonly userSvc: UserService = userService,
    private readonly learnSvc: LearningService = learningService,
    private readonly convSvc: ConversationService = conversationService,
    private readonly useSvc: UsageService = usageService,
    private readonly assessSvc: AssessmentService = assessmentService,
    private readonly sttSvc: SpeechToTextService = speechToTextService,
    private readonly ttsSvc: TextToSpeechService = textToSpeechService,
  ) {}

  /**
   * Processes a text message through user setup, session management, and the Language Learning Agent.
   */
  async processTextMessage(
    params: ProcessTextMessageParams,
  ): Promise<ProcessMessageResult> {
    const { telegramUser, text } = params;

    // 1. Find or create user
    const user = await this.userSvc.findOrCreateByTelegram(telegramUser);

    // 2. Check for explicit language switch
    const detectedLang = detectLanguageCode(text);
    if (detectedLang) {
      await this.learnSvc.setUserLanguage(user.id, detectedLang, "A1");
    }

    // 3. Get active learning language profile
    let userLanguage = await this.learnSvc.getActiveLanguage(user.id);
    if (!userLanguage) {
      userLanguage = await this.learnSvc.setUserLanguage(
        user.id,
        detectedLang ?? "en",
        "A1",
      );
    }

    // 4. Get or create active learning session
    const session = await this.convSvc.getOrCreateActiveSession(
      user.id,
      userLanguage.id,
    );

    // 5. Save user message to database
    const userMsg = await this.convSvc.saveMessage({
      sessionId: session.id,
      role: "user",
      content: text,
      messageType: "text",
    });

    // 6. Detect explicit modality preference
    const requestedOutputModality = detectExplicitModalityRequest(text);

    // 7. Execute Agent pipeline
    const agentResult = await this.executeAgent({
      user,
      userLanguage: {
        id: userLanguage.id,
        languageCode: userLanguage.languageCode,
        level: userLanguage.level as CEFRLevel,
      },
      session,
      currentText: text,
      userMessageId: userMsg.id,
      inputModality: "text",
      requestedOutputModality,
    });

    // 8. Resolve final output modality & synthesize speech if voice
    const delivery = await this.resolveAndDeliverResponse({
      userId: user.id,
      sessionId: session.id,
      userMessageId: userMsg.id,
      languageCode: userLanguage.languageCode,
      agentResult,
      inputModality: "text",
      requestedOutputModality,
    });

    // 9. Save assistant message
    const assistantMsg = await this.convSvc.saveMessage({
      sessionId: session.id,
      role: "assistant",
      content: agentResult.response,
      messageType: delivery.finalModality,
      inputTokens: agentResult.inputTokens,
      outputTokens: agentResult.outputTokens,
    });

    return {
      response: agentResult.response,
      finalModality: delivery.finalModality,
      audioBuffer: delivery.audioBuffer,
      audioMimeType: delivery.audioMimeType,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
    };
  }

  /**
   * Processes an incoming voice message: downloads/receives audio, transcribes it via SpeechToTextService,
   * persists the transcript and voice metadata, and executes the Language Learning Agent.
   */
  async processVoiceMessage(
    params: ProcessVoiceMessageParams,
  ): Promise<ProcessMessageResult> {
    const {
      telegramUser,
      audioBuffer,
      mimeType = "audio/ogg",
      telegramFileId,
      durationSeconds,
    } = params;

    // 1. Find or create user
    const user = await this.userSvc.findOrCreateByTelegram(telegramUser);

    // 2. Get active learning language profile (for language hint)
    let userLanguage = await this.learnSvc.getActiveLanguage(user.id);
    if (!userLanguage) {
      userLanguage = await this.learnSvc.setUserLanguage(user.id, "en", "A1");
    }

    // 3. Get or create active session
    const session = await this.convSvc.getOrCreateActiveSession(
      user.id,
      userLanguage.id,
    );

    // 4. Transcribe audio with SpeechToTextService
    console.log(
      `[voice] transcribing audio | userId=${user.id} mimeType=${mimeType} duration=${durationSeconds ?? "unknown"}s`,
    );

    const sttResult = await this.sttSvc.transcribe({
      audioBuffer,
      mimeType,
      filename: "voice.ogg",
      language: userLanguage.languageCode,
    });

    const transcript = sttResult.text?.trim() ?? "";

    // 5. Validate transcript quality
    if (!transcript) {
      console.warn(`[voice] empty transcript returned for userId=${user.id}`);
      return {
        response:
          "Sorry, I couldn't understand that voice message. Please try sending it again.",
        finalModality: "text",
      };
    }

    console.log(
      `[voice] transcription completed | userId=${user.id} transcriptLength=${transcript.length}`,
    );

    // 6. Check for language switch keyword in transcript
    const detectedLang = detectLanguageCode(transcript);
    if (detectedLang && detectedLang !== userLanguage.languageCode) {
      userLanguage = await this.learnSvc.setUserLanguage(
        user.id,
        detectedLang,
        "A1",
      );
    }

    // 7. Save user voice message with transcript and metadata (no raw audio binary)
    const userMsg = await this.convSvc.saveMessage({
      sessionId: session.id,
      role: "user",
      content: transcript,
      messageType: "voice",
      metadata: {
        telegramFileId: telegramFileId ?? null,
        durationSeconds: durationSeconds ?? sttResult.durationSeconds ?? null,
        mimeType,
      },
    });

    // 8. Record Speech-to-Text AI usage
    try {
      await this.useSvc.recordUsage({
        userId: user.id,
        sessionId: session.id,
        messageId: userMsg.id,
        model: sttResult.model ?? env.OPENAI_TRANSCRIPTION_MODEL,
        provider: "openai",
        operation: "speech_to_text",
        inputModality: "audio",
        outputModality: "text",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        usageDetails: sttResult.usage ?? null,
      });
    } catch (sttUsageErr) {
      console.error(
        "[voice] Failed to record STT usage (non-fatal):",
        sttUsageErr,
      );
    }

    // 9. Detect explicit modality preference in transcript
    const requestedOutputModality = detectExplicitModalityRequest(transcript);

    // 10. Execute Agent pipeline with transcript
    const agentResult = await this.executeAgent({
      user,
      userLanguage: {
        id: userLanguage.id,
        languageCode: userLanguage.languageCode,
        level: userLanguage.level as CEFRLevel,
      },
      session,
      currentText: transcript,
      userMessageId: userMsg.id,
      inputModality: "voice",
      requestedOutputModality,
    });

    // 11. Resolve final output modality & synthesize speech if voice
    const delivery = await this.resolveAndDeliverResponse({
      userId: user.id,
      sessionId: session.id,
      userMessageId: userMsg.id,
      languageCode: userLanguage.languageCode,
      agentResult,
      inputModality: "voice",
      requestedOutputModality,
    });

    // 12. Save assistant response
    const assistantMsg = await this.convSvc.saveMessage({
      sessionId: session.id,
      role: "assistant",
      content: agentResult.response,
      messageType: delivery.finalModality,
      inputTokens: agentResult.inputTokens,
      outputTokens: agentResult.outputTokens,
    });

    return {
      response: agentResult.response,
      transcript,
      finalModality: delivery.finalModality,
      audioBuffer: delivery.audioBuffer,
      audioMimeType: delivery.audioMimeType,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
    };
  }

  /**
   * Resolves the final response modality following the strict precedence rules:
   * 1. Global kill-switch: if VOICE_REPLY_ENABLED = false -> "text".
   * 2. Explicit user request (e.g. "Answer in writing" -> "text", "Answer with voice" -> "voice").
   * 3. Agent decision (e.g. pronunciation practice, listening comprehension -> "voice").
   * 4. Incoming message modality default (voice -> "voice" when DEFAULT_VOICE_REPLY_TO_VOICE_MESSAGE = true).
   * 5. Baseline default ("text").
   *
   * If voice is chosen, synthesizes speech via TextToSpeechService and records AI usage.
   * If synthesis fails, falls back gracefully to "text".
   */
  private async resolveAndDeliverResponse(params: {
    userId: string;
    sessionId: string;
    userMessageId: string;
    languageCode: string;
    agentResult: AgentRunResult;
    inputModality: ResponseModality;
    requestedOutputModality?: ResponseModality;
  }): Promise<{
    finalModality: ResponseModality;
    audioBuffer?: Buffer;
    audioMimeType?: string;
  }> {
    const {
      userId,
      sessionId,
      userMessageId,
      languageCode,
      agentResult,
      inputModality,
      requestedOutputModality,
    } = params;

    let targetModality: ResponseModality = "text";

    if (!env.VOICE_REPLY_ENABLED) {
      targetModality = "text";
    } else if (requestedOutputModality) {
      targetModality = requestedOutputModality;
    } else if (agentResult.modality === "voice") {
      targetModality = "voice";
    } else if (
      inputModality === "voice" &&
      env.DEFAULT_VOICE_REPLY_TO_VOICE_MESSAGE
    ) {
      targetModality = "voice";
    } else {
      targetModality = agentResult.modality ?? "text";
    }

    if (targetModality === "voice") {
      try {
        const speechText = normalizeMarkdownForSpeech(agentResult.response);
        const ttsResult = await this.ttsSvc.synthesize({
          text: speechText,
          languageCode,
        });

        // Record TTS AI usage
        try {
          await this.useSvc.recordUsage({
            userId,
            sessionId,
            messageId: userMessageId,
            model: env.OPENAI_TTS_MODEL,
            provider: "openai",
            operation: "text_to_speech",
            inputModality: "text",
            outputModality: "audio",
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            usageDetails: ttsResult.usage ?? null,
          });
        } catch (ttsUsageErr) {
          console.error(
            "[tts] Failed to record TTS usage (non-fatal):",
            ttsUsageErr,
          );
        }

        return {
          finalModality: "voice",
          audioBuffer: ttsResult.audio,
          audioMimeType: ttsResult.mimeType,
        };
      } catch (ttsError) {
        console.error(
          `[tts] Speech synthesis failed for userId=${userId}, falling back to text response:`,
          ttsError,
        );
        return {
          finalModality: "text",
        };
      }
    }

    return {
      finalModality: "text",
    };
  }

  /**
   * Internal shared helper: prepares context, loads recent history, executes LanguageLearningAgent,
   * and records agent response AI usage.
   */
  private async executeAgent(params: {
    user: { id: string; telegramId: number };
    userLanguage: { id: string; languageCode: string; level: CEFRLevel };
    session: { id: string };
    currentText: string;
    userMessageId: string;
    inputModality: ResponseModality;
    requestedOutputModality?: ResponseModality;
  }): Promise<AgentRunResult> {
    const {
      user,
      userLanguage,
      session,
      currentText,
      userMessageId,
      inputModality,
      requestedOutputModality,
    } = params;

    // Load recent conversation history (excluding the current user message just saved)
    const recentMessages = await this.convSvc.getRecentMessages(
      session.id,
      20,
    );

    // Build AgentInputItem array from history (drop the current user message)
    const priorMessages = recentMessages.filter(
      (m) => m.id !== userMessageId,
    );

    const historyItems: AgentInputItem[] = priorMessages.map(
      (m): AgentInputItem => {
        if (m.role === "assistant") {
          return {
            role: "assistant" as const,
            status: "completed" as const,
            content: [{ type: "output_text" as const, text: m.content }],
          };
        }
        if (m.role === "system") {
          return {
            role: "system" as const,
            content: m.content,
          };
        }
        return {
          role: "user" as const,
          content: m.content,
        };
      },
    );

    // Add current user message
    historyItems.push({
      role: "user" as const,
      content: currentText,
    });

    // Build trusted AgentContext
    const agentContext: AgentContext = {
      userId: user.id,
      telegramUserId: user.telegramId,
      userLanguageId: userLanguage.id,
      languageCode: userLanguage.languageCode,
      level: userLanguage.level,
      sessionId: session.id,
      inputModality,
      requestedOutputModality,
      userService: this.userSvc,
      learningService: this.learnSvc,
      conversationService: this.convSvc,
      assessmentService: this.assessSvc,
    };

    // Execute Agent
    const agentResult = await runLanguageAgent(historyItems, agentContext);

    // Record Agent AI usage
    try {
      await this.useSvc.recordAgentRunUsage({
        userId: user.id,
        sessionId: session.id,
        messageId: userMessageId,
        runId: agentResult.runId,
        model: env.OPENAI_MODEL,
        provider: "openai",
        operation: "agent_response",
        rawResponses: agentResult.rawResponses,
      });
    } catch (usageError) {
      console.error(
        "[agent] AI usage recording failed (non-fatal):",
        usageError,
      );
    }

    return agentResult;
  }
}

export const messageProcessingService = new MessageProcessingService();
