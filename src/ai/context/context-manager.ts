import type {
  AgentInput,
  ContextManagerConfig,
  ContextManagementResult,
  ContextPrepareOptions,
} from "./types.js";
import { TokenCounter } from "./token-counter.js";
import {
  TruncateOldestStrategy,
  type ContextReducer,
} from "./context-strategy.js";

/**
 * Manages AI input context to prevent exceeding a configurable token budget.
 *
 * Executes before agent runs to:
 * 1. Count tokens in the full input (instructions + conversation items + current message).
 * 2. Check against the configured budget (maxInputTokens - safetyMarginTokens).
 * 3. Reduce context using the configured strategy if over budget.
 * 4. Return structured metrics for observability.
 *
 * When disabled (AI_SHORT_CONTEXT_ENABLED=false), passes input through unchanged.
 */
export class ContextManager {
  private readonly config: ContextManagerConfig;
  private readonly tokenCounter: TokenCounter;
  private readonly reducer: ContextReducer;

  constructor(config: ContextManagerConfig) {
    this.config = config;
    this.tokenCounter = new TokenCounter(config.model);
    this.reducer = this.createReducer(config.strategy);
  }

  private createReducer(strategy: string): ContextReducer {
    switch (strategy) {
      case "truncate_oldest":
        return new TruncateOldestStrategy();
      default:
        throw new Error(`Unknown context strategy: ${strategy}`);
    }
  }

  /**
   * The effective token limit after subtracting the safety margin.
   *
   * effectiveLimit = maxInputTokens - safetyMarginTokens
   *
   * The safety margin exists because BPE token counting may differ slightly
   * from the model's internal tokenization (e.g., special tokens, message
   * framing). A conservative margin prevents borderline requests from
   * exceeding the actual model limit.
   */
  get effectiveLimit(): number {
    return this.config.maxInputTokens - this.config.safetyMarginTokens;
  }

  /**
   * Prepare agent input by checking and enforcing the token budget.
   *
   * @param input - The agent input (string or AgentInputItem[])
   * @param options - Optional instructions and userId for logging
   * @returns Structured result with metrics
   */
  prepare(
    input: AgentInput,
    options: ContextPrepareOptions = {},
  ): ContextManagementResult {
    const { instructions, userId } = options;

    // When disabled, pass through unchanged
    if (!this.config.enabled) {
      console.log(
        `[context-manager] disabled | userId=${userId ?? "unknown"}`,
      );
      const tokenCount = this.tokenCounter.countTokens(input, instructions);
      return {
        input,
        originalTokenCount: tokenCount,
        finalTokenCount: tokenCount,
        maxInputTokens: this.config.maxInputTokens,
        effectiveLimit: this.effectiveLimit,
        wasModified: false,
        removedItems: 0,
      };
    }

    // Count original tokens
    const originalTokenCount = this.tokenCounter.countTokens(
      input,
      instructions,
    );

    // Within budget — no modification needed
    if (originalTokenCount <= this.effectiveLimit) {
      console.log(
        `[context-manager] within budget | userId=${userId ?? "unknown"} ` +
          `tokens=${originalTokenCount}/${this.effectiveLimit} ` +
          `model=${this.config.model}`,
      );
      return {
        input,
        originalTokenCount,
        finalTokenCount: originalTokenCount,
        maxInputTokens: this.config.maxInputTokens,
        effectiveLimit: this.effectiveLimit,
        wasModified: false,
        removedItems: 0,
      };
    }

    // Over budget — reduce context
    console.log(
      `[context-manager] over budget, reducing | userId=${userId ?? "unknown"} ` +
        `tokens=${originalTokenCount}/${this.effectiveLimit} ` +
        `model=${this.config.model} strategy=${this.config.strategy}`,
    );

    const result = this.reducer.reduce(
      input,
      this.effectiveLimit,
      this.tokenCounter,
      instructions,
    );

    console.log(
      `[context-manager] reduced | userId=${userId ?? "unknown"} ` +
        `originalTokens=${originalTokenCount} finalTokens=${result.finalTokenCount} ` +
        `removedItems=${result.removedItems}`,
    );

    return {
      input: result.input,
      originalTokenCount,
      finalTokenCount: result.finalTokenCount,
      maxInputTokens: this.config.maxInputTokens,
      effectiveLimit: this.effectiveLimit,
      wasModified: result.removedItems > 0,
      removedItems: result.removedItems,
    };
  }
}
