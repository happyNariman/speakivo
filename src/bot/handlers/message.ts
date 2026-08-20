import type { Bot } from "gramio";
import { runLanguageAgent, type AgentContext } from "../../agent/language-agent.js";

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

    const telegramUserId = context.from?.id;
    if (!telegramUserId) {
      console.warn("[handler] message without from.id, skipping");
      return;
    }

    console.log(
      `[handler] incoming message | telegramUserId=${telegramUserId}`,
    );

    const agentContext: AgentContext = {
      userId: String(telegramUserId),
      telegramUserId,
    };

    try {
      const response = await runLanguageAgent(text, agentContext);
      await context.send(response);
    } catch (error) {
      console.error("[handler] agent execution error:", error);
      await context.send("Sorry, something went wrong. Please try again.");
    }
  });
}
