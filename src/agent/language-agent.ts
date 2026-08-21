import { Agent, run } from "@openai/agents";
import { env } from "../config/env.js";
import { LANGUAGE_TUTOR_INSTRUCTIONS } from "./instructions.js";
import { ContextManager } from "../ai/context/context-manager.js";
import type { AgentInput } from "../ai/context/types.js";
import { agentTools } from "./tools.js";
import type { UserService } from "../services/user-service.js";
import type { LearningService } from "../services/learning-service.js";
import type { ConversationService } from "../services/conversation-service.js";

export interface AgentContext {
  userId: string;
  telegramUserId: number;
  userLanguageId: string;
  languageCode: string;
  level: string;
  sessionId: string;
  userService: UserService;
  learningService: LearningService;
  conversationService: ConversationService;
}

export interface AgentRunResult {
  response: string;
  inputTokens: number | null;
  outputTokens: number | null;
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
  console.log(
    `[agent] execution started | userId=${context.userId} language=${context.languageCode} level=${context.level}`,
  );

  // 1. Context management: check and enforce token budget before agent execution
  const contextResult = contextManager.prepare(input, {
    instructions: LANGUAGE_TUTOR_INSTRUCTIONS,
    userId: context.userId,
  });

  // 2. Execute Agent with OpenAI Agents SDK
  const result = await run(languageAgent, contextResult.input, { context });

  // 3. Extract token usage if available from raw LLM responses
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  if (result.rawResponses && result.rawResponses.length > 0) {
    for (const raw of result.rawResponses) {
      if (raw.usage) {
        inputTokens = (inputTokens ?? 0) + (raw.usage.inputTokens ?? 0);
        outputTokens = (outputTokens ?? 0) + (raw.usage.outputTokens ?? 0);
      }
    }
  }

  console.log(
    `[agent] execution completed | userId=${context.userId} inputTokens=${inputTokens ?? "N/A"} outputTokens=${outputTokens ?? "N/A"}`,
  );

  const responseText =
    typeof result.finalOutput === "string"
      ? result.finalOutput
      : "I'm here to help you practice! What would you like to focus on next?";

  return {
    response: responseText,
    inputTokens,
    outputTokens,
  };
}
