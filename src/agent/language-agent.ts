import { randomUUID } from "node:crypto";
import { Agent, run, type ModelResponse } from "@openai/agents";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  LANGUAGE_TUTOR_INSTRUCTIONS,
  getAgentInstructions,
} from "./instructions.js";
import { ContextManager } from "../ai/context/context-manager.js";
import type { AgentInput } from "../ai/context/types.js";
import { agentTools } from "./tools.js";
import type { UserService } from "../services/user-service.js";
import type { LearningService, CEFRLevel } from "../services/learning-service.js";
import type { ConversationService } from "../services/conversation-service.js";
import type { AssessmentService } from "../services/assessment-service.js";
import type { ResponseModality } from "../types/modality.js";

export const AgentResponseSchema = z.object({
  text: z
    .string()
    .describe(
      "Your complete, natural conversational response to the student in Telegram Markdown format",
    ),
  modality: z
    .enum(["text", "voice"])
    .describe(
      "The chosen response modality: 'voice' for spoken/audio response, 'text' for written response",
    ),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export interface AgentContext {
  userId: string;
  telegramUserId: number;
  userLanguageId: string;
  languageCode: string;
  level: CEFRLevel;
  sessionId: string;
  inputModality: ResponseModality;
  requestedOutputModality?: ResponseModality;
  userService: UserService;
  learningService: LearningService;
  conversationService: ConversationService;
  assessmentService: AssessmentService;
}

export interface AgentRunResult {
  response: string;
  modality: ResponseModality;
  inputTokens: number | null;
  outputTokens: number | null;
  runId: string;
  rawResponses: ModelResponse[];
}

export const languageAgent = new Agent<AgentContext, typeof AgentResponseSchema>({
  name: "Language Learning Tutor",
  instructions: (runContext) => getAgentInstructions(runContext),
  model: env.OPENAI_MODEL,
  tools: agentTools,
  outputType: AgentResponseSchema,
});

export const contextManager = new ContextManager({
  enabled: env.AI_SHORT_CONTEXT_ENABLED,
  maxInputTokens: env.AI_SHORT_CONTEXT_MAX_INPUT_TOKENS,
  safetyMarginTokens: env.AI_SHORT_CONTEXT_SAFETY_MARGIN_TOKENS,
  strategy: env.AI_SHORT_CONTEXT_STRATEGY,
  model: env.OPENAI_MODEL,
});

export async function runLanguageAgent(
  input: AgentInput,
  context: AgentContext,
): Promise<AgentRunResult> {
  const runId = randomUUID();

  console.log(
    `[agent] execution started | runId=${runId} userId=${context.userId} language=${context.languageCode} level=${context.level} inputModality=${context.inputModality}`,
  );

  // 1. Context management: check and enforce token budget before agent execution
  const contextResult = contextManager.prepare(input, {
    instructions: LANGUAGE_TUTOR_INSTRUCTIONS,
    userId: context.userId,
  });

  // 2. Execute Agent with OpenAI Agents SDK
  const result = await run(languageAgent, contextResult.input, { context });

  // 3. Extract aggregate token usage if available from raw LLM responses
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  const rawResponses: ModelResponse[] = result.rawResponses ?? [];

  if (rawResponses.length > 0) {
    for (const raw of rawResponses) {
      if (raw.usage) {
        inputTokens = (inputTokens ?? 0) + (raw.usage.inputTokens ?? 0);
        outputTokens = (outputTokens ?? 0) + (raw.usage.outputTokens ?? 0);
      }
    }
  }

  console.log(
    `[agent] execution completed | runId=${runId} userId=${context.userId} ` +
      `rawRequests=${rawResponses.length} inputTokens=${inputTokens ?? "N/A"} outputTokens=${outputTokens ?? "N/A"}`,
  );

  let responseText = "";
  let selectedModality: ResponseModality =
    context.requestedOutputModality ??
    (context.inputModality === "voice" ? "voice" : "text");

  // 4. Extract structured final output (text & modality)
  const finalOutput = result.finalOutput as any;
  if (
    finalOutput &&
    typeof finalOutput === "object" &&
    typeof finalOutput.text === "string"
  ) {
    responseText = finalOutput.text.trim();
    if (
      finalOutput.modality === "voice" ||
      finalOutput.modality === "text"
    ) {
      selectedModality = finalOutput.modality;
    }
  } else if (typeof finalOutput === "string" && finalOutput.trim().length > 0) {
    try {
      const parsed = JSON.parse(finalOutput);
      if (parsed.text) {
        responseText = String(parsed.text).trim();
        if (parsed.modality === "voice" || parsed.modality === "text") {
          selectedModality = parsed.modality;
        }
      } else {
        responseText = finalOutput.trim();
      }
    } catch {
      responseText = finalOutput.trim();
    }
  } else if (Array.isArray((result as any).messages)) {
    const msgs = (result as any).messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === "assistant" && Array.isArray(m.content)) {
        const textChunk = m.content.find(
          (c: any) => c.type === "output_text" || c.type === "text",
        );
        if (textChunk?.text?.trim()) {
          try {
            const parsed = JSON.parse(textChunk.text);
            responseText = (parsed.text ?? textChunk.text).trim();
            if (parsed.modality === "voice" || parsed.modality === "text") {
              selectedModality = parsed.modality;
            }
          } catch {
            responseText = textChunk.text.trim();
          }
          break;
        }
      } else if (
        m.role === "assistant" &&
        typeof m.content === "string" &&
        m.content.trim()
      ) {
        try {
          const parsed = JSON.parse(m.content);
          responseText = (parsed.text ?? m.content).trim();
          if (parsed.modality === "voice" || parsed.modality === "text") {
            selectedModality = parsed.modality;
          }
        } catch {
          responseText = m.content.trim();
        }
        break;
      }
    }
  }

  if (!responseText) {
    responseText =
      "I'm here to help you practice! What would you like to focus on next?";
  }

  return {
    response: responseText,
    modality: selectedModality,
    inputTokens,
    outputTokens,
    runId,
    rawResponses,
  };
}
