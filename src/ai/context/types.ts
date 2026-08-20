import type { AgentInputItem } from "@openai/agents";

/**
 * Supported context reduction strategies.
 * Currently only "truncate_oldest" is implemented.
 * Future strategies may include: "summarize_oldest", "semantic_compaction", "persistent_summary".
 */
export type ContextStrategy = "truncate_oldest";

/**
 * Configuration for the context manager.
 */
export interface ContextManagerConfig {
  enabled: boolean;
  maxInputTokens: number;
  safetyMarginTokens: number;
  strategy: ContextStrategy;
  model: string;
}

/**
 * The type of input that the context manager operates on.
 * Matches the input types accepted by the OpenAI Agents SDK `run()` function.
 */
export type AgentInput = string | AgentInputItem[];

/**
 * Result returned by the context manager after processing input.
 *
 * Contains the (possibly modified) input along with token metrics
 * for observability and future telemetry.
 */
export interface ContextManagementResult {
  /** The prepared input to pass to the agent */
  input: AgentInput;
  /** Token count of the original input (before any modification) */
  originalTokenCount: number;
  /** Token count after context management (after possible truncation) */
  finalTokenCount: number;
  /** The configured maximum input tokens */
  maxInputTokens: number;
  /** The effective limit after subtracting safety margin */
  effectiveLimit: number;
  /** Whether the input was modified by context management */
  wasModified: boolean;
  /** Number of items removed from the input (0 for string inputs or when not modified) */
  removedItems: number;
}

/**
 * Options passed to the context manager's prepare method.
 */
export interface ContextPrepareOptions {
  /** Agent system instructions (counted as part of input context) */
  instructions?: string;
  /** User ID for logging purposes */
  userId?: string;
}
