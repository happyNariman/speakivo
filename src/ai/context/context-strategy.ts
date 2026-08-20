import type { AgentInputItem } from "@openai/agents";
import type { AgentInput } from "./types.js";
import type { TokenCounter } from "./token-counter.js";

/**
 * Interface for context reduction strategies.
 *
 * Future strategies (summarize_oldest, semantic_compaction, persistent_summary)
 * should implement this interface.
 */
export interface ContextReducer {
  /**
   * Reduce the input to fit within the effective token limit.
   *
   * @param input - The original agent input
   * @param effectiveLimit - Maximum allowed tokens after safety margin
   * @param tokenCounter - Token counter for measuring input size
   * @param instructions - Optional system instructions (their tokens are part of the budget)
   * @returns Object with reduced input, final token count, and number of removed items
   */
  reduce(
    input: AgentInput,
    effectiveLimit: number,
    tokenCounter: TokenCounter,
    instructions?: string,
  ): { input: AgentInput; finalTokenCount: number; removedItems: number };
}

/**
 * Removes the oldest conversation items first to fit within the token budget.
 *
 * Invariants:
 * - The current (most recent) user message is always preserved.
 * - System instructions are never removed.
 * - Oldest items are removed one at a time until the budget is met.
 * - For string inputs, no truncation is performed (single message cannot be split).
 */
export class TruncateOldestStrategy implements ContextReducer {
  reduce(
    input: AgentInput,
    effectiveLimit: number,
    tokenCounter: TokenCounter,
    instructions?: string,
  ): { input: AgentInput; finalTokenCount: number; removedItems: number } {
    // String input: cannot split a single message, return as-is
    if (typeof input === "string") {
      const tokenCount = tokenCounter.countTokens(input, instructions);
      return {
        input,
        finalTokenCount: tokenCount,
        removedItems: 0,
      };
    }

    // Array input: remove oldest items first, preserving the most recent
    if (input.length === 0) {
      return {
        input,
        finalTokenCount: tokenCounter.countTokens(input, instructions),
        removedItems: 0,
      };
    }

    let items: AgentInputItem[] = [...input];
    let removedItems = 0;

    // Keep removing the oldest item (index 0) while over budget.
    // Always preserve at least the last item (current user message).
    while (items.length > 1) {
      const currentCount = tokenCounter.countTokens(items, instructions);
      if (currentCount <= effectiveLimit) {
        return {
          input: items,
          finalTokenCount: currentCount,
          removedItems,
        };
      }
      items = items.slice(1);
      removedItems++;
    }

    // Only the last message remains
    const finalCount = tokenCounter.countTokens(items, instructions);
    return {
      input: items,
      finalTokenCount: finalCount,
      removedItems,
    };
  }
}
