import OpenAI from "openai";
import { env } from "../config/env.js";

export interface OpenAICostItem {
  lineItem: string;
  amount: number;
  currency: string;
}

export interface OpenAICostsReport {
  days: number;
  totalCost: number;
  currency: string;
  lineItems: Record<string, number>;
}

export class OpenAIAdminUsageService {
  private client: OpenAI | null = null;

  constructor(apiKey?: string) {
    const key = apiKey ?? env.OPENAI_ADMIN_API_KEY;
    if (key) {
      this.client = new OpenAI({
        apiKey: key,
        adminAPIKey: key,
      });
    }
  }

  /**
   * Checks whether the OpenAI Admin API is configured.
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Fetches official billed costs from OpenAI Administration API for the specified number of days.
   *
   * @param days Number of days in the past to query (e.g. 1 for today, 7 for weekly, 30 for monthly)
   */
  async getCosts(days: number): Promise<OpenAICostsReport | null> {
    if (!this.client) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const startTime = now - days * 24 * 60 * 60;

    try {
      let totalCost = 0;
      let currency = "usd";
      const lineItems: Record<string, number> = {};

      let pageCursor: string | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        const response: any = await this.client.admin.organization.usage.costs({
          start_time: startTime,
          end_time: now,
          bucket_width: "1d",
          limit: 31,
          page: pageCursor,
          project_ids: env.OPENAI_PROJECT_ID ? [env.OPENAI_PROJECT_ID] : undefined,
          group_by: ["line_item"],
        });

        for (const bucket of response.data) {
          for (const res of bucket.results) {
            if (res.object === "organization.costs.result") {
              const costVal = res.amount?.value ?? 0;
              if (res.amount?.currency) {
                currency = res.amount.currency;
              }
              totalCost += costVal;

              const itemKey = res.line_item ?? "other";
              lineItems[itemKey] = (lineItems[itemKey] ?? 0) + costVal;
            }
          }
        }

        hasMore = response.has_more && Boolean(response.next_page);
        pageCursor = response.next_page ?? undefined;
      }

      return {
        days,
        totalCost,
        currency,
        lineItems,
      };
    } catch (error) {
      console.warn(
        `[admin-usage] Failed to query OpenAI Admin Costs API (${days}d):`,
        error,
      );
      return null;
    }
  }
}

export const openAIAdminUsageService = new OpenAIAdminUsageService();
