import { eq } from "drizzle-orm";
import { db, type Database } from "../db/client.js";
import { users, type User } from "../db/schema/index.js";

export interface TelegramUserData {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export class UserService {
  constructor(private readonly database: Database = db) {}

  /**
   * Finds an existing user by Telegram ID or creates a new one.
   * Updates username, firstName, lastName if they changed.
   */
  async findOrCreateByTelegram(
    telegramUser: TelegramUserData,
  ): Promise<User> {
    const existing = await this.database
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramUser.id))
      .limit(1);

    if (existing.length > 0) {
      const user = existing[0];
      // Check if profile fields need an update
      const needsUpdate =
        user.username !== (telegramUser.username ?? null) ||
        user.firstName !== (telegramUser.first_name ?? null) ||
        user.lastName !== (telegramUser.last_name ?? null);

      if (needsUpdate) {
        const [updated] = await this.database
          .update(users)
          .set({
            username: telegramUser.username ?? null,
            firstName: telegramUser.first_name ?? null,
            lastName: telegramUser.last_name ?? null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        return updated;
      }

      return user;
    }

    // Insert new user
    const [newUser] = await this.database
      .insert(users)
      .values({
        telegramId: telegramUser.id,
        username: telegramUser.username ?? null,
        firstName: telegramUser.first_name ?? null,
        lastName: telegramUser.last_name ?? null,
      })
      .returning();

    return newUser;
  }

  /**
   * Retrieves a user by their internal UUID.
   */
  async getUserById(userId: string): Promise<User | null> {
    const rows = await this.database
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }
}

export const userService = new UserService();
