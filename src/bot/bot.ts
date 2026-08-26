import { Bot } from "gramio";
import { markdownToFormattable } from "@gramio/format/markdown";
import { env } from "../config/env.js";
import { registerMessageHandler } from "./handlers/message.js";
import { registerStatusHandler } from "./handlers/status.js";
import { userService } from "../services/user-service.js";
import { learningService } from "../services/learning-service.js";

export function createBot(): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN)
    .command("start", async (context) => {
      const fromUser = context.from;
      if (fromUser?.id) {
        try {
          const user = await userService.findOrCreateByTelegram({
            id: fromUser.id,
            username: fromUser.username,
            first_name: fromUser.firstName,
            last_name: fromUser.lastName,
          });

          // Ensure default language profile exists
          const active = await learningService.getActiveLanguage(user.id);
          if (!active) {
            await learningService.setUserLanguage(user.id, "en", "A1");
          }
        } catch (err) {
          console.error("[bot] error creating user profile on /start:", err);
        }
      }

      const welcomeMessage =
        "👋 **Hi! I'm your language-learning tutor.** 🌍\n\n" +
        "Tell me which language you'd like to learn and I'll help you practice it!\n\n" +
        "💡 *For example:*\n" +
        '- `"I want to learn English"`\n' +
        '- `"I want to learn German"`\n' +
        '- `"I want to learn Spanish"`\n' +
        '- `"I want to learn Japanese"`';

      try {
        return await context.send(markdownToFormattable(welcomeMessage));
      } catch {
        return await context.send(welcomeMessage);
      }
    })
    .onStart(async ({ info }) => {
      console.log(`[bot] @${info.username} started (long polling)`);

      if (env.ADMIN_TELEGRAM_ID) {
        try {
          await bot.api.sendMessage({
            chat_id: env.ADMIN_TELEGRAM_ID,
            text: `🚀 <b>Speakivo Bot (@${info.username}) has been successfully started!</b>`,
            parse_mode: "HTML",
          });
          console.log(
            `[bot] start notification sent to admin (${env.ADMIN_TELEGRAM_ID})`,
          );
        } catch (adminNotifyErr) {
          console.warn(
            `[bot] failed to send start notification to admin (${env.ADMIN_TELEGRAM_ID}):`,
            adminNotifyErr,
          );
        }
      }
    })
    .onStop(() => {
      console.log("[bot] stopped");
    })
    .onError(({ context, kind, error }) => {
      console.error(`[bot] error [${kind}]:`, error);

      if (context && "send" in context && typeof context.send === "function") {
        context
          .send("Sorry, something went wrong. Please try again.")
          .catch((sendError: unknown) => {
            console.error("[bot] failed to send error message:", sendError);
          });
      }
    });

  registerStatusHandler(bot);
  registerMessageHandler(bot);

  return bot;
}
