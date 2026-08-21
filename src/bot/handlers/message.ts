import type { Bot } from "gramio";
import type { AgentInputItem } from "@openai/agents";
import {
  runLanguageAgent,
  type AgentContext,
} from "../../agent/language-agent.js";
import { userService } from "../../services/user-service.js";
import { learningService } from "../../services/learning-service.js";
import { conversationService } from "../../services/conversation-service.js";

/**
 * Simple language keyword detection for automatic active profile switching.
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

export function registerMessageHandler(bot: Bot): void {
  bot.on("message", async (context) => {
    const text = context.text;

    if (!text) {
      await context.send(
        "I can only handle text messages for now. Please send me a text message!",
      );
      return;
    }

    // Skip commands — they are handled separately
    if (text.startsWith("/")) {
      return;
    }

    const fromUser = context.from;
    if (!fromUser?.id) {
      console.warn("[handler] message without from.id, skipping");
      return;
    }

    console.log(
      `[handler] incoming message | telegramUserId=${fromUser.id} textLength=${text.length}`,
    );

    try {
      // 1. Find or create user in PostgreSQL
      const user = await userService.findOrCreateByTelegram({
        id: fromUser.id,
        username: fromUser.username,
        first_name: fromUser.firstName,
        last_name: fromUser.lastName,
      });

      // 2. Check if user wants to switch / start learning a specific language
      const detectedLang = detectLanguageCode(text);
      if (detectedLang) {
        await learningService.setUserLanguage(user.id, detectedLang, "A1");
      }

      // 3. Get active learning language profile (or create default English A1)
      let userLanguage = await learningService.getActiveLanguage(user.id);
      if (!userLanguage) {
        userLanguage = await learningService.setUserLanguage(
          user.id,
          detectedLang ?? "en",
          "A1",
        );
      }

      // 4. Get or create active learning session
      const session = await conversationService.getOrCreateActiveSession(
        user.id,
        userLanguage.id,
      );

      // 5. Load recent conversation history from database
      const recentMessages = await conversationService.getRecentMessages(
        session.id,
        20,
      );

      // 6. Build AgentInputItem array from history + current message
      const historyItems: AgentInputItem[] = recentMessages.map(
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

      // Append current user message
      historyItems.push({
        role: "user" as const,
        content: text,
      });

      // 7. Save user message to database
      await conversationService.saveMessage({
        sessionId: session.id,
        role: "user",
        content: text,
        messageType: "text",
      });

      // 8. Build trusted AgentContext
      const agentContext: AgentContext = {
        userId: user.id,
        telegramUserId: fromUser.id,
        userLanguageId: userLanguage.id,
        languageCode: userLanguage.languageCode,
        level: userLanguage.level,
        sessionId: session.id,
        userService,
        learningService,
        conversationService,
      };

      // 9. Execute Language Learning Agent with Context Manager + Tools
      const agentResult = await runLanguageAgent(historyItems, agentContext);

      // 10. Save assistant response and token counts to database
      await conversationService.saveMessage({
        sessionId: session.id,
        role: "assistant",
        content: agentResult.response,
        messageType: "text",
        inputTokens: agentResult.inputTokens,
        outputTokens: agentResult.outputTokens,
      });

      // 11. Send response back to user
      await context.send(agentResult.response);
    } catch (error) {
      console.error("[handler] error processing message:", error);
      await context.send("Sorry, something went wrong. Please try again.");
    }
  });
}
