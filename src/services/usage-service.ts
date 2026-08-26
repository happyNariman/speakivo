import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import type { ModelResponse } from "@openai/agents";
import { db, type Database } from "../db/client.js";
import { aiUsage, type AIUsage } from "../db/schema/index.js";

export type Modality = "text" | "audio" | "image" | "multimodal" | "unknown";
export type Operation =
  | "agent_response"
  | "speech_to_text"
  | "text_to_speech"
  | "realtime"
  | "embedding"
  | "moderation"
  | "other";

export interface AIUsageInput {
  userId: string;
  sessionId?: string | null;
  messageId?: string | null;
  runId?: string | null;
  agentName?: string | null;
  provider?: string;
  model: string;
  operation?: Operation;
  inputModality?: Modality;
  outputModality?: Modality;
  requestId?: string | null;
  responseId?: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputTextTokens?: number | null;
  inputAudioTokens?: number | null;
  outputTextTokens?: number | null;
  outputAudioTokens?: number | null;
  cachedInputTokens?: number | null;
  usageDetails?: Record<string, unknown> | null;
}

export interface AgentRunUsageParams {
  userId: string;
  sessionId?: string | null;
  messageId?: string | null;
  runId?: string | null;
  agentName?: string | null;
  provider?: string;
  model: string;
  operation?: Operation;
  rawResponses?: ModelResponse[];
}

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface UsageSummary {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface UsageByDimension {
  dimension: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function extractDetailValue(
  details:
    | Record<string, number>
    | Array<Record<string, number>>
    | object
    | undefined,
  keys: string[],
): number | null {
  if (!details) return null;
  if (Array.isArray(details)) {
    let sum: number | null = null;
    for (const item of details) {
      if (typeof item === "object" && item !== null) {
        for (const k of keys) {
          const val = (item as Record<string, unknown>)[k];
          if (typeof val === "number") {
            sum = (sum ?? 0) + val;
          }
        }
      }
    }
    return sum;
  }
  if (typeof details === "object") {
    for (const k of keys) {
      const val = (details as Record<string, unknown>)[k];
      if (typeof val === "number") {
        return val;
      }
    }
  }
  return null;
}

export class UsageService {
  constructor(private readonly database: Database = db) {}

  /**
   * Records a single normalized AI usage event in PostgreSQL.
   */
  async recordUsage(input: AIUsageInput): Promise<AIUsage> {
    const [record] = await this.database
      .insert(aiUsage)
      .values({
        userId: input.userId,
        sessionId: input.sessionId ?? null,
        messageId: input.messageId ?? null,
        runId: input.runId ?? null,
        agentName: input.agentName ?? null,
        provider: input.provider ?? "openai",
        model: input.model,
        operation: input.operation ?? "agent_response",
        inputModality: input.inputModality ?? "text",
        outputModality: input.outputModality ?? "text",
        requestId: input.requestId ?? null,
        responseId: input.responseId ?? null,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        inputTextTokens: input.inputTextTokens ?? null,
        inputAudioTokens: input.inputAudioTokens ?? null,
        outputTextTokens: input.outputTextTokens ?? null,
        outputAudioTokens: input.outputAudioTokens ?? null,
        cachedInputTokens: input.cachedInputTokens ?? null,
        usageDetails: input.usageDetails ?? null,
      })
      .returning();

    console.log(
      `[usage] recorded | userId=${record.userId} model=${record.model} ` +
        `operation=${record.operation} runId=${record.runId ?? "N/A"} ` +
        `tokens=${record.inputTokens}+${record.outputTokens}=${record.totalTokens}`,
    );

    return record;
  }

  /**
   * Extracts and records all per-request usage entries from an OpenAI Agents SDK run result.
   *
   * If multiple model requests occurred in a single Agent run, records one row per request,
   * all correlated by runId.
   *
   * Failures are safely caught and logged without failing the user interaction.
   */
  async recordAgentRunUsage(
    params: AgentRunUsageParams,
  ): Promise<AIUsage[]> {
    try {
      const {
        userId,
        sessionId,
        messageId,
        runId,
        agentName = "language-tutor",
        provider = "openai",
        model,
        operation = "agent_response",
        rawResponses,
      } = params;

      if (!rawResponses || rawResponses.length === 0) {
        // Fallback single entry if no raw responses are available
        const record = await this.recordUsage({
          userId,
          sessionId,
          messageId,
          runId,
          agentName,
          provider,
          model,
          operation,
          inputModality: "text",
          outputModality: "text",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        });
        return [record];
      }

      const recordedList: AIUsage[] = [];

      for (const response of rawResponses) {
        const usage = response.usage;
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;

        const cachedInputTokens = extractDetailValue(
          usage?.inputTokensDetails,
          ["cached_tokens", "cachedTokens"],
        );
        const inputTextTokens = extractDetailValue(
          usage?.inputTokensDetails,
          ["text_tokens", "textTokens"],
        );
        const inputAudioTokens = extractDetailValue(
          usage?.inputTokensDetails,
          ["audio_tokens", "audioTokens"],
        );
        const outputTextTokens = extractDetailValue(
          usage?.outputTokensDetails,
          ["text_tokens", "textTokens"],
        );
        const outputAudioTokens = extractDetailValue(
          usage?.outputTokensDetails,
          ["audio_tokens", "audioTokens"],
        );

        const usageDetails: Record<string, unknown> = {};
        if (response.providerData) {
          usageDetails.providerData = response.providerData;
        }
        if (response.rawUsage) {
          usageDetails.rawUsage = response.rawUsage;
        }
        if (usage?.inputTokensDetails) {
          usageDetails.inputTokensDetails = usage.inputTokensDetails;
        }
        if (usage?.outputTokensDetails) {
          usageDetails.outputTokensDetails = usage.outputTokensDetails;
        }

        const record = await this.recordUsage({
          userId,
          sessionId,
          messageId,
          runId,
          agentName,
          provider,
          model,
          operation,
          inputModality: "text",
          outputModality: "text",
          requestId: response.requestId ?? null,
          responseId: response.responseId ?? null,
          inputTokens,
          outputTokens,
          totalTokens,
          inputTextTokens,
          inputAudioTokens,
          outputTextTokens,
          outputAudioTokens,
          cachedInputTokens,
          usageDetails: Object.keys(usageDetails).length > 0 ? usageDetails : null,
        });

        recordedList.push(record);
      }

      return recordedList;
    } catch (error) {
      // Safe error tolerance: log clearly, do not disrupt user conversational experience
      console.error(
        `[usage] Failed to persist AI usage | userId=${params.userId} runId=${params.runId ?? "N/A"}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Retrieves summary statistics (total requests and tokens) for a user within an optional date range.
   */
  async getUserUsageSummary(
    userId: string,
    dateRange?: DateRange,
  ): Promise<UsageSummary> {
    const conditions = [eq(aiUsage.userId, userId)];

    if (dateRange?.from) {
      conditions.push(gte(aiUsage.createdAt, dateRange.from));
    }
    if (dateRange?.to) {
      conditions.push(lte(aiUsage.createdAt, dateRange.to));
    }

    const rows = await this.database
      .select({
        requestCount: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
        totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::bigint`,
      })
      .from(aiUsage)
      .where(and(...conditions));

    const result = rows[0];
    return {
      requestCount: Number(result?.requestCount ?? 0),
      inputTokens: Number(result?.inputTokens ?? 0),
      outputTokens: Number(result?.outputTokens ?? 0),
      totalTokens: Number(result?.totalTokens ?? 0),
    };
  }

  /**
   * Retrieves usage aggregated and grouped by model for a user.
   */
  async getUserUsageByModel(
    userId: string,
    dateRange?: DateRange,
  ): Promise<
    Array<{
      model: string;
      requestCount: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>
  > {
    const conditions = [eq(aiUsage.userId, userId)];

    if (dateRange?.from) {
      conditions.push(gte(aiUsage.createdAt, dateRange.from));
    }
    if (dateRange?.to) {
      conditions.push(lte(aiUsage.createdAt, dateRange.to));
    }

    const rows = await this.database
      .select({
        model: aiUsage.model,
        requestCount: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
        totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::bigint`,
      })
      .from(aiUsage)
      .where(and(...conditions))
      .groupBy(aiUsage.model)
      .orderBy(desc(sql`sum(${aiUsage.totalTokens})`));

    return rows.map((r) => ({
      model: r.model,
      requestCount: Number(r.requestCount),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      totalTokens: Number(r.totalTokens),
    }));
  }

  /**
   * Retrieves usage aggregated and grouped by operation for a user.
   */
  async getUserUsageByOperation(
    userId: string,
    dateRange?: DateRange,
  ): Promise<
    Array<{
      operation: string;
      requestCount: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>
  > {
    const conditions = [eq(aiUsage.userId, userId)];

    if (dateRange?.from) {
      conditions.push(gte(aiUsage.createdAt, dateRange.from));
    }
    if (dateRange?.to) {
      conditions.push(lte(aiUsage.createdAt, dateRange.to));
    }

    const rows = await this.database
      .select({
        operation: aiUsage.operation,
        requestCount: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
        totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::bigint`,
      })
      .from(aiUsage)
      .where(and(...conditions))
      .groupBy(aiUsage.operation)
      .orderBy(desc(sql`sum(${aiUsage.totalTokens})`));

    return rows.map((r) => ({
      operation: r.operation,
      requestCount: Number(r.requestCount),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      totalTokens: Number(r.totalTokens),
    }));
  }

  /**
   * Retrieves individual AI usage records for a user.
   */
  async getUserUsage(
    userId: string,
    options?: { limit?: number; dateRange?: DateRange },
  ): Promise<AIUsage[]> {
    const conditions = [eq(aiUsage.userId, userId)];

    if (options?.dateRange?.from) {
      conditions.push(gte(aiUsage.createdAt, options.dateRange.from));
    }
    if (options?.dateRange?.to) {
      conditions.push(lte(aiUsage.createdAt, options.dateRange.to));
    }

    return this.database
      .select()
      .from(aiUsage)
      .where(and(...conditions))
      .orderBy(desc(aiUsage.createdAt))
      .limit(options?.limit ?? 50);
  }

  /**
   * Retrieves aggregated system-wide AI usage statistics for admin reporting over a given period.
   */
  async getSystemUsageSummary(days?: number): Promise<{
    days?: number;
    totalRequests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    sttRequests: number;
    ttsRequests: number;
    activeUsers: number;
  }> {
    const conditions = [];

    if (days !== undefined && days > 0) {
      const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      conditions.push(gte(aiUsage.createdAt, fromDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totals] = await this.database
      .select({
        totalRequests: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::bigint`,
        totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::bigint`,
        cachedInputTokens: sql<number>`coalesce(sum(${aiUsage.cachedInputTokens}), 0)::bigint`,
        sttRequests: sql<number>`count(*) filter (where ${aiUsage.operation} = 'speech_to_text')::int`,
        ttsRequests: sql<number>`count(*) filter (where ${aiUsage.operation} = 'text_to_speech')::int`,
        activeUsers: sql<number>`count(distinct ${aiUsage.userId})::int`,
      })
      .from(aiUsage)
      .where(whereClause);

    return {
      days,
      totalRequests: Number(totals?.totalRequests ?? 0),
      inputTokens: Number(totals?.inputTokens ?? 0),
      outputTokens: Number(totals?.outputTokens ?? 0),
      totalTokens: Number(totals?.totalTokens ?? 0),
      cachedInputTokens: Number(totals?.cachedInputTokens ?? 0),
      sttRequests: Number(totals?.sttRequests ?? 0),
      ttsRequests: Number(totals?.ttsRequests ?? 0),
      activeUsers: Number(totals?.activeUsers ?? 0),
    };
  }
}

export const usageService = new UsageService();

