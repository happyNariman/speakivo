import { eq, and, isNull, desc, asc } from "drizzle-orm";
import { db, type Database } from "../db/client.js";
import {
  learningSessions,
  conversationMessages,
  type LearningSession,
  type ConversationMessage,
} from "../db/schema/index.js";

export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageType = "text" | "voice" | "tool";

export class ConversationService {
  constructor(private readonly database: Database = db) {}

  /**
   * Finds an active (open) session for the user and language, or creates a new one.
   */
  async getOrCreateActiveSession(
    userId: string,
    userLanguageId: string,
  ): Promise<LearningSession> {
    const existing = await this.database
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.userId, userId),
          eq(learningSessions.userLanguageId, userLanguageId),
          isNull(learningSessions.endedAt),
        ),
      )
      .orderBy(desc(learningSessions.startedAt))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const [newSession] = await this.database
      .insert(learningSessions)
      .values({
        userId,
        userLanguageId,
      })
      .returning();

    return newSession;
  }

  /**
   * Closes a learning session by setting endedAt timestamp.
   */
  async closeSession(sessionId: string): Promise<LearningSession | null> {
    const [closed] = await this.database
      .update(learningSessions)
      .set({ endedAt: new Date() })
      .where(eq(learningSessions.id, sessionId))
      .returning();

    return closed ?? null;
  }

  /**
   * Saves a message to the conversation history.
   */
  async saveMessage(data: {
    sessionId: string;
    role: MessageRole;
    content: string;
    messageType?: MessageType;
    inputTokens?: number | null;
    outputTokens?: number | null;
  }): Promise<ConversationMessage> {
    const [message] = await this.database
      .insert(conversationMessages)
      .values({
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        messageType: data.messageType ?? "text",
        inputTokens: data.inputTokens ?? null,
        outputTokens: data.outputTokens ?? null,
      })
      .returning();

    return message;
  }

  /**
   * Retrieves the most recent conversation messages in chronological order (oldest to newest).
   */
  async getRecentMessages(
    sessionId: string,
    limit = 20,
  ): Promise<ConversationMessage[]> {
    // Query last `limit` messages ordered by createdAt DESC, then reverse to get chronological order
    const rows = await this.database
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.sessionId, sessionId))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(limit);

    // Return in chronological order (oldest to newest)
    return rows.reverse();
  }
}

export const conversationService = new ConversationService();
