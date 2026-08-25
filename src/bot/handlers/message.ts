import type { Bot } from "gramio";
import { markdownToFormattable } from "@gramio/format/markdown";
import { messageProcessingService } from "../../services/message-processing-service.js";

export function registerMessageHandler(bot: Bot): void {
  bot.on("message", async (context) => {
    const fromUser = context.from;
    if (!fromUser?.id) {
      console.warn("[handler] message without from.id, skipping");
      return;
    }

    const telegramUser = {
      id: fromUser.id,
      username: fromUser.username,
      first_name: fromUser.firstName,
      last_name: fromUser.lastName,
    };

    // 1. Text Message Flow
    if (context.text) {
      const text = context.text;

      // Skip slash commands — handled separately by command handlers
      if (text.startsWith("/")) {
        return;
      }

      console.log(
        `[handler] incoming text message | telegramUserId=${fromUser.id} textLength=${text.length}`,
      );

      const sendTyping = () => {
        context.sendChatAction("typing").catch(() => {});
      };
      sendTyping();
      const typingInterval = setInterval(sendTyping, 4000);

      try {
        const result = await messageProcessingService.processTextMessage({
          telegramUser,
          text,
        });

        try {
          await context.send(markdownToFormattable(result.response));
        } catch (formatErr) {
          console.warn(
            "[handler] Markdown send failed, falling back to plain text:",
            formatErr,
          );
          await context.send(result.response);
        }
      } catch (error) {
        console.error("[handler] error processing text message:", error);
        await context.send("Sorry, something went wrong. Please try again.");
      } finally {
        clearInterval(typingInterval);
      }
      return;
    }

    // 2. Voice Message Flow
    if (context.voice) {
      const voice = context.voice;

      console.log(
        `[handler] incoming voice message | telegramUserId=${fromUser.id} fileId=${voice.fileId} duration=${voice.duration}s`,
      );

      const sendTyping = () => {
        context.sendChatAction("typing").catch(() => {});
      };
      sendTyping();
      const typingInterval = setInterval(sendTyping, 4000);

      try {
        // Download audio data via GramIO
        let audioBuffer: ArrayBuffer;
        try {
          audioBuffer = await context.download();
        } catch (downloadErr) {
          console.error(
            "[handler] Failed to download Telegram voice audio:",
            downloadErr,
          );
          await context.send(
            "Sorry, I couldn't understand that voice message. Please try sending it again.",
          );
          return;
        }

        const result = await messageProcessingService.processVoiceMessage({
          telegramUser,
          audioBuffer,
          mimeType: voice.mimeType ?? "audio/ogg",
          telegramFileId: voice.fileId,
          durationSeconds: voice.duration,
        });

        try {
          await context.send(markdownToFormattable(result.response));
        } catch (formatErr) {
          console.warn(
            "[handler] Markdown send failed, falling back to plain text:",
            formatErr,
          );
          await context.send(result.response);
        }
      } catch (error) {
        console.error("[handler] error processing voice message:", error);
        await context.send(
          "Sorry, I couldn't understand that voice message. Please try sending it again.",
        );
      } finally {
        clearInterval(typingInterval);
      }
      return;
    }

    // 3. Unsupported Message Type
    await context.send(
      "I can only handle text and voice messages for now. Please send me a text or voice message!",
    );
  });
}
