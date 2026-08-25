import { randomUUID } from "node:crypto";
import { Agent, run, type ModelResponse } from "@openai/agents";
import { env } from "../config/env.js";
import { LANGUAGE_TUTOR_INSTRUCTIONS } from "./instructions.js";
import { ContextManager } from "../ai/context/context-manager.js";
import type { AgentInput } from "../ai/context/types.js";
import { agentTools } from "./tools.js";
import type { UserService } from "../services/user-service.js";
import type { LearningService, CEFRLevel } from "../services/learning-service.js";
import type { ConversationService } from "../services/conversation-service.js";
import type { AssessmentService } from "../services/assessment-service.js";

export interface AgentContext {
  userId: string;
  telegramUserId: number;
  userLanguageId: string;
  languageCode: string;
  level: CEFRLevel;
  sessionId: string;
  userService: UserService;
  learningService: LearningService;
  conversationService: ConversationService;
  assessmentService: AssessmentService;
}

export interface AgentRunResult {
  response: string;
  inputTokens: number | null;
  outputTokens: number | null;
  runId: string;
  rawResponses: ModelResponse[];
}

export const languageAgent = new Agent<AgentContext>({
  name: "Language Learning Tutor",
  instructions: LANGUAGE_TUTOR_INSTRUCTIONS,
  model: env.OPENAI_MODEL,
  tools: agentTools,
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
    `[agent] execution started | runId=${runId} userId=${context.userId} language=${context.languageCode} level=${context.level}`,
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
  if (typeof result.finalOutput === "string" && result.finalOutput.trim().length > 0) {
    responseText = result.finalOutput.trim();
  } else if (Array.isArray((result as any).messages)) {
    const msgs = (result as any).messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === "assistant" && Array.isArray(m.content)) {
        const textChunk = m.content.find((c: any) => c.type === "output_text" || c.type === "text");
        if (textChunk?.text?.trim()) {
          responseText = textChunk.text.trim();
          break;
        }
      } else if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) {
        responseText = m.content.trim();
        break;
      }
    }
  }

  if (!responseText) {
    responseText = "I'm here to help you practice! What would you like to focus on next?";
  }

  return {
    response: responseText,
    inputTokens,
    outputTokens,
    runId,
    rawResponses,
  };
}
