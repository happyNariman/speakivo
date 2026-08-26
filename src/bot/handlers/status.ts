import type { Bot } from "gramio";
import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, learningSessions } from "../../db/schema/index.js";
import { env } from "../../config/env.js";
import { usageService } from "../../services/usage-service.js";
import { openAIAdminUsageService } from "../../services/openai-admin-usage.service.js";

function formatUptime(uptimeSeconds: number): string {
  const days = Math.floor(uptimeSeconds / (24 * 3600));
  const hours = Math.floor((uptimeSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return parts.join(" ");
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

export function registerStatusHandler(bot: Bot): void {
  bot.command(["status", "admin"], async (context) => {
    const fromId = context.from?.id;

    // Security check: restrict /status to configured ADMIN_TELEGRAM_ID if set
    if (env.ADMIN_TELEGRAM_ID && fromId !== env.ADMIN_TELEGRAM_ID) {
      await context.send("🔒 Access denied. This command is restricted to the administrator.");
      return;
    }

    try {
      // 1. System & Uptime
      const uptime = formatUptime(process.uptime());
      const memoryMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

      // 2. Database statistics
      const [userCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);
      const totalUsers = userCountRow?.count ?? 0;

      const [sessionCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(learningSessions);
      const totalSessions = sessionCountRow?.count ?? 0;

      // 3. Database AI Usage Stats (1 Day, 7 Days, All Time)
      const stats1d = await usageService.getSystemUsageSummary(1);
      const stats7d = await usageService.getSystemUsageSummary(7);
      const statsAll = await usageService.getSystemUsageSummary();

      // 4. OpenAI Admin Costs (if OPENAI_ADMIN_API_KEY is present)
      let rep1: any = null;
      let rep7: any = null;
      let rep30: any = null;

      if (openAIAdminUsageService.isConfigured()) {
        [rep1, rep7, rep30] = await Promise.all([
          openAIAdminUsageService.getCosts(1),
          openAIAdminUsageService.getCosts(7),
          openAIAdminUsageService.getCosts(30),
        ]);
      }

      // Build formatted HTML message
      let message = `📊 <b>Speakivo System & Usage Status</b>\n\n`;

      // Health
      message += `🟢 <b>System Health</b>\n`;
      message += `• Status: <b>Online</b>\n`;
      message += `• Uptime: <b>${uptime}</b> | Memory: <b>${memoryMb} MB</b>\n`;
      message += `• Users: <b>${totalUsers}</b> | Sessions: <b>${totalSessions}</b>\n`;
      message += `• Models: <code>${env.OPENAI_MODEL}</code> / <code>${env.OPENAI_TRANSCRIPTION_MODEL}</code> / <code>${env.OPENAI_TTS_MODEL}</code>\n\n`;

      const scopeLabel = env.OPENAI_PROJECT_ID
        ? ` (${env.OPENAI_PROJECT_ID})`
        : "";

      // 1 Day (24 Hours)
      message += `📅 <b>Last 24 Hours (1 Day)</b>\n`;
      message += `• Total Requests: <b>${formatNumber(stats1d.totalRequests)}</b> (Active Users: ${stats1d.activeUsers})\n`;
      message += `• LLM Tokens: <b>${formatNumber(stats1d.totalTokens)}</b> (In: ${formatNumber(stats1d.inputTokens)} | Out: ${formatNumber(stats1d.outputTokens)})\n`;
      if (stats1d.cachedInputTokens > 0) {
        message += `• Cached Tokens: <b>${formatNumber(stats1d.cachedInputTokens)}</b>\n`;
      }
      message += `• Voice Ops: STT: <b>${stats1d.sttRequests}</b> | TTS: <b>${stats1d.ttsRequests}</b>\n`;
      if (rep1) {
        message += `💵 <b>OpenAI Billed Cost${scopeLabel}:</b> <code>$${rep1.totalCost.toFixed(4)} USD</code>\n`;
        const items = Object.entries(rep1.lineItems);
        if (items.length > 0) {
          const breakdown = items
            .map(([k, v]) => `${k}: $${(v as number).toFixed(4)}`)
            .join(" | ");
          message += `  └ <i>${breakdown}</i>\n`;
        }
      }
      message += `\n`;

      // 7 Days
      message += `📅 <b>Last 7 Days</b>\n`;
      message += `• Total Requests: <b>${formatNumber(stats7d.totalRequests)}</b> (Active Users: ${stats7d.activeUsers})\n`;
      message += `• LLM Tokens: <b>${formatNumber(stats7d.totalTokens)}</b> (In: ${formatNumber(stats7d.inputTokens)} | Out: ${formatNumber(stats7d.outputTokens)})\n`;
      message += `• Voice Ops: STT: <b>${stats7d.sttRequests}</b> | TTS: <b>${stats7d.ttsRequests}</b>\n`;
      if (rep7) {
        message += `💵 <b>OpenAI Billed Cost${scopeLabel}:</b> <code>$${rep7.totalCost.toFixed(4)} USD</code>\n`;
        const items = Object.entries(rep7.lineItems);
        if (items.length > 0) {
          const breakdown = items
            .map(([k, v]) => `${k}: $${(v as number).toFixed(4)}`)
            .join(" | ");
          message += `  └ <i>${breakdown}</i>\n`;
        }
      }
      message += `\n`;

      // All Time
      message += `📈 <b>All Time Totals</b>\n`;
      message += `• Requests: <b>${formatNumber(statsAll.totalRequests)}</b>\n`;
      message += `• Tokens: <b>${formatNumber(statsAll.totalTokens)}</b>\n`;
      if (rep30) {
        message += `💵 <b>OpenAI 30-Day Cost${scopeLabel}:</b> <code>$${rep30.totalCost.toFixed(4)} USD</code>\n`;
      }

      if (!openAIAdminUsageService.isConfigured()) {
        message += `\n💡 <i>Tip: Set <code>OPENAI_ADMIN_API_KEY</code> in .env to view live billed dollar costs directly from OpenAI.</i>`;
      }

      await context.send(message, { parse_mode: "HTML" });
    } catch (error) {
      console.error("[handler] error in /status command:", error);
      await context.send("❌ Error fetching status. Please check logs.");
    }
  });
}
