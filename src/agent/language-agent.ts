import { Agent, run } from "@openai/agents";
import { env } from "../config/env.js";
import { LANGUAGE_TUTOR_INSTRUCTIONS } from "./instructions.js";
import { ContextManager } from "../ai/context/context-manager.js";

export interface AgentContext {
  userId: string;
  telegramUserId: number;
}

const languageAgent = new Agent<AgentContext>({
  name: "Language Learning Tutor",
  instructions: LANGUAGE_TUTOR_INSTRUCTIONS,
  model: env.OPENAI_MODEL,
});

const contextManager = new ContextManager({
  enabled: env.AI_SHORT_CONTEXT_ENABLED,
  maxInputTokens: env.AI_SHORT_CONTEXT_MAX_INPUT_TOKENS,
  safetyMarginTokens: env.AI_SHORT_CONTEXT_SAFETY_MARGIN_TOKENS,
  strategy: env.AI_SHORT_CONTEXT_STRATEGY,
  model: env.OPENAI_MODEL,
});

export async function runLanguageAgent(
  text: string,
  context: AgentContext,
): Promise<string> {
  console.log(
    `[agent] execution started | userId=${context.userId} telegramUserId=${context.telegramUserId}`,
  );

  // Context management: check and enforce token budget before agent execution
  const contextResult = contextManager.prepare(text, {
    instructions: LANGUAGE_TUTOR_INSTRUCTIONS,
    userId: context.userId,
  });

  const result = await run(languageAgent, contextResult.input, { context });

  console.log(
    `[agent] execution completed | userId=${context.userId}`,
  );

  return result.finalOutput ?? "I'm not sure how to respond. Could you try again?";
}
