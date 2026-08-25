import { MediaUpload, type Bot } from "gramio";
import { markdownToFormattable } from "@gramio/format/markdown";
import {
  messageProcessingService,
  type ProcessMessageResult,
} from "../../services/message-processing-service.js";

/**
 * Dispatches the processed response to Telegram using the resolved modality (voice or text).
 *
 * If sendVoice is blocked by user privacy settings (VOICE_MESSAGES_FORBIDDEN),
 * attempts fallback delivery via sendAudio or sendDocument before falling back to pure text.
 */
async function dispatchTelegramResponse(
  context: any,
  result: ProcessMessageResult,
): Promise<void> {
  if (result.finalModality === "voice" && result.audioBuffer) {
    const audioUpload = MediaUpload.buffer(
      new Uint8Array(result.audioBuffer),
      "voice.ogg",
    );

    // 1. Primary: send as Telegram voice message
    try {
      await context.bot.api.sendVoice({
        chat_id: context.chatId,
        voice: audioUpload,
      });
      return;
    } catch (voiceSendErr: any) {
      console.warn(
        `[handler] sendVoice failed (${voiceSendErr?.message ?? voiceSendErr}), trying sendAudio fallback...`,
      );

      // 2. Secondary fallback: send as standard playable audio file (bypasses VOICE_MESSAGES_FORBIDDEN)
      try {
        await context.bot.api.sendAudio({
          chat_id: context.chatId,
          audio: MediaUpload.buffer(
            new Uint8Array(result.audioBuffer),
            "voice.ogg",
          ),
          title: "Voice Reply",
          performer: "Speakivo Tutor",
        });
        return;
      } catch (audioSendErr: any) {
        console.warn(
          `[handler] sendAudio failed (${audioSendErr?.message ?? audioSendErr}), trying sendDocument fallback...`,
        );

        // 3. Tertiary fallback: send as audio document
        try {
          await context.bot.api.sendDocument({
            chat_id: context.chatId,
            document: MediaUpload.buffer(
              new Uint8Array(result.audioBuffer),
              "voice.ogg",
            ),
          });
          return;
        } catch (docSendErr: any) {
          console.warn(
            `[handler] All audio transmission methods failed (${docSendErr?.message ?? docSendErr}), falling back to text response.`,
          );
        }
      }
    }
  }

  // Fallback or explicit text delivery
  try {
    await context.send(markdownToFormattable(result.response));
  } catch (formatErr) {
    console.warn(
      "[handler] Markdown send failed, falling back to plain text:",
      formatErr,
    );
    await context.send(result.response);
  }
}

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

        await dispatchTelegramResponse(context, result);
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
        context.sendChatAction("record_voice").catch(() => {
          context.sendChatAction("typing").catch(() => {});
        });
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

        await dispatchTelegramResponse(context, result);
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
