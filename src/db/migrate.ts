import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { env } from "../config/env.js";

async function runMigrations(): Promise<void> {
  console.log("[db] Running migrations...");
  const sql = postgres(env.DATABASE_URL, { max: 1 });

  try {
    // Ensure migrations table exists in public schema
    await sql`
      CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL,
        created_at BIGINT
      );
    `;

    // Read journal file to get ordered migrations
    const journalPath = path.resolve("./drizzle/meta/_journal.json");
    if (!fs.existsSync(journalPath)) {
      throw new Error(`Migration journal not found at ${journalPath}`);
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string; when: number }>;
    };

    // Get applied migrations
    const appliedRows = await sql<Array<{ id: number; hash: string; created_at: string }>>`
      SELECT * FROM public.__drizzle_migrations ORDER BY id ASC;
    `;
    const appliedTags = new Set(appliedRows.map((r) => r.hash));

    for (const entry of journal.entries) {
      if (appliedTags.has(entry.tag)) {
        console.log(`[db] Skipping already applied migration: ${entry.tag}`);
        continue;
      }

      const sqlFilePath = path.resolve(`./drizzle/${entry.tag}.sql`);
      if (!fs.existsSync(sqlFilePath)) {
        throw new Error(`Migration SQL file not found at ${sqlFilePath}`);
      }

      console.log(`[db] Applying migration: ${entry.tag}...`);
      const sqlContent = fs.readFileSync(sqlFilePath, "utf-8");

      // Split into statements by Drizzle statement breakpoint
      const statements = sqlContent
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Execute in a transaction
      await sql.begin(async (tx) => {
        for (const statement of statements) {
          await tx.unsafe(statement);
        }
        await tx`
          INSERT INTO public.__drizzle_migrations (hash, created_at)
          VALUES (${entry.tag}, ${entry.when});
        `;
      });

      console.log(`[db] Applied migration: ${entry.tag}`);
    }

    console.log("✅ [db] All migrations applied successfully");
  } catch (error) {
    console.error("❌ [db] Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
