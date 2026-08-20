import { createBot } from "./bot/bot.js";

async function main(): Promise<void> {
  console.log("[app] starting Language Learning Agent...");

  const bot = createBot();

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[app] shutting down...");
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await bot.start();
}

main().catch((error) => {
  console.error("[app] fatal error:", error);
  process.exit(1);
});
