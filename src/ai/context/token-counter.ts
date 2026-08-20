import { getEncoding, type Tiktoken } from "js-tiktoken";
import type { AgentInputItem } from "@openai/agents";
import type { AgentInput } from "./types.js";

/**
 * Selects the correct BPE encoding name based on the model.
 *
 * - o200k_base: GPT-5.x, GPT-4o, o1, o3, o4 series
 * - cl100k_base: GPT-4, GPT-3.5 series
 */
function getEncodingName(model: string): "o200k_base" | "cl100k_base" {
  const lower = model.toLowerCase();
  if (
    lower.startsWith("gpt-5") ||
    lower.startsWith("gpt-4o") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4")
  ) {
    return "o200k_base";
  }
  return "cl100k_base";
}

/**
 * Counts tokens using the correct BPE tokenizer for the configured OpenAI model.
 *
 * Uses js-tiktoken for exact offline token counting rather than
 * character-based approximations.
 */
export class TokenCounter {
  private readonly encoder: Tiktoken;

  constructor(model: string) {
    const encodingName = getEncodingName(model);
    this.encoder = getEncoding(encodingName);
  }

  /**
   * Count tokens in a plain text string.
   */
  countText(text: string): number {
    if (!text) return 0;
    return this.encoder.encode(text).length;
  }

  /**
   * Extract text content from a single AgentInputItem for token counting.
   */
  private extractItemText(item: AgentInputItem): string {
    if ("content" in item) {
      const content = item.content;
      if (typeof content === "string") {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if ("text" in part && typeof part.text === "string") {
              return part.text;
            }
            if ("refusal" in part && typeof part.refusal === "string") {
              return part.refusal;
            }
            return "";
          })
          .join("");
      }
    }
    return "";
  }

  /**
   * Count tokens for a single AgentInputItem.
   * Includes a small per-message overhead for role/metadata tokens.
   */
  countItem(item: AgentInputItem): number {
    const text = this.extractItemText(item);
    // ~4 tokens overhead per message for role, separators, etc.
    const MESSAGE_OVERHEAD = 4;
    return this.countText(text) + MESSAGE_OVERHEAD;
  }

  /**
   * Count total tokens for an agent input (string or array of items),
   * optionally including system instructions.
   */
  countTokens(input: AgentInput, instructions?: string): number {
    let total = 0;

    // Count instruction tokens if present
    if (instructions) {
      // ~4 tokens overhead for the system message wrapper
      total += this.countText(instructions) + 4;
    }

    if (typeof input === "string") {
      // Simple string input: count as a single user message
      total += this.countText(input) + 4;
    } else {
      // Array of AgentInputItem: count each item
      for (const item of input) {
        total += this.countItem(item);
      }
    }

    return total;
  }
}
