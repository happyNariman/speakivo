import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContextManager } from "./context-manager.js";
import type { ContextManagerConfig } from "./types.js";
import type { AgentInputItem } from "@openai/agents";

/**
 * Helper: create a ContextManager with custom overrides on top of defaults.
 */
function createManager(
  overrides: Partial<ContextManagerConfig> = {},
): ContextManager {
  return new ContextManager({
    enabled: true,
    maxInputTokens: 1000,
    safetyMarginTokens: 100,
    strategy: "truncate_oldest",
    model: "gpt-4o-mini",
    ...overrides,
  });
}

/**
 * Helper: create a user message AgentInputItem.
 */
function userMessage(text: string): AgentInputItem {
  return {
    role: "user" as const,
    content: text,
  };
}

/**
 * Helper: create an assistant message AgentInputItem.
 */
function assistantMessage(text: string): AgentInputItem {
  return {
    role: "assistant" as const,
    status: "completed" as const,
    content: [{ type: "output_text" as const, text }],
  };
}

/**
 * Helper: generate a long string of approximately N tokens.
 * With o200k_base, English words average ~1.3 tokens per word.
 * Using repeated simple words for predictability.
 */
function generateLongText(approximateTokens: number): string {
  // "hello " is reliably 1 token + 1 space token in most tokenizers.
  // Using "word " pattern — each "word " ≈ 1 token.
  // To be safe, generate more words than needed.
  const words: string[] = [];
  for (let i = 0; i < approximateTokens; i++) {
    words.push("hello");
  }
  return words.join(" ");
}

// --- Test 1: Context management disabled ---
describe("ContextManager - disabled", () => {
  it("should return input unchanged when AI_SHORT_CONTEXT_ENABLED=false", () => {
    const manager = createManager({ enabled: false });
    const input = "Hello, I want to learn German!";

    const result = manager.prepare(input);

    assert.equal(result.input, input);
    assert.equal(result.wasModified, false);
    assert.equal(result.removedItems, 0);
    assert.equal(result.originalTokenCount, result.finalTokenCount);
  });

  it("should return array input unchanged when disabled", () => {
    const manager = createManager({ enabled: false });
    const input: AgentInputItem[] = [
      userMessage("Hello"),
      assistantMessage("Hi there!"),
      userMessage("How do I say 'good morning' in German?"),
    ];

    const result = manager.prepare(input);

    assert.deepEqual(result.input, input);
    assert.equal(result.wasModified, false);
    assert.equal(result.removedItems, 0);
  });
});

// --- Test 2: Context is below the limit ---
describe("ContextManager - within budget", () => {
  it("should not modify input when tokens are within the limit", () => {
    const manager = createManager({
      maxInputTokens: 10000,
      safetyMarginTokens: 500,
    });
    const input = "I want to learn French.";

    const result = manager.prepare(input);

    assert.equal(result.wasModified, false);
    assert.equal(result.removedItems, 0);
    assert.equal(result.input, input);
    assert.ok(result.originalTokenCount <= result.effectiveLimit);
  });

  it("should not modify array input when within budget", () => {
    const manager = createManager({
      maxInputTokens: 10000,
      safetyMarginTokens: 500,
    });
    const input: AgentInputItem[] = [
      userMessage("Hello"),
      assistantMessage("Hi!"),
      userMessage("How are you?"),
    ];

    const result = manager.prepare(input);

    assert.equal(result.wasModified, false);
    assert.equal(result.removedItems, 0);
    assert.deepEqual(result.input, input);
  });
});

// --- Test 3: Context exceeds the limit ---
describe("ContextManager - over budget", () => {
  it("should modify input and remove oldest messages when over limit", () => {
    // Use a very small limit to trigger truncation
    const manager = createManager({
      maxInputTokens: 50,
      safetyMarginTokens: 5,
    });
    const input: AgentInputItem[] = [
      userMessage("Message one about learning vocabulary"),
      assistantMessage(
        "Here is a list of vocabulary words for you to study",
      ),
      userMessage("Message two about grammar rules"),
      assistantMessage("Grammar is important, let me explain the rules"),
      userMessage("Current message"),
    ];

    const result = manager.prepare(input);

    assert.equal(result.wasModified, true);
    assert.ok(result.removedItems > 0);
    assert.ok(result.finalTokenCount <= result.effectiveLimit);
    assert.ok(result.originalTokenCount > result.effectiveLimit);
  });
});

// --- Test 4: Current user message is preserved ---
describe("ContextManager - preserves current message", () => {
  it("should always preserve the most recent (last) message", () => {
    const manager = createManager({
      maxInputTokens: 50,
      safetyMarginTokens: 5,
    });
    const currentMessage = userMessage("This is my current question");
    const input: AgentInputItem[] = [
      userMessage("Old message one"),
      assistantMessage("Old response one"),
      userMessage("Old message two"),
      assistantMessage("Old response two"),
      currentMessage,
    ];

    const result = manager.prepare(input);

    // The result should be an array containing at least the current message
    assert.ok(Array.isArray(result.input));
    const resultItems = result.input as AgentInputItem[];
    assert.ok(resultItems.length >= 1);

    // The last item should be the current message
    const lastItem = resultItems[resultItems.length - 1];
    assert.deepEqual(lastItem, currentMessage);
  });
});

// --- Test 5: Context becomes small enough after removing old messages ---
describe("ContextManager - progressive removal", () => {
  it("should remove only enough old messages to fit within budget", () => {
    // Create a manager with a limit that requires removing some but not all old messages
    const manager = createManager({
      maxInputTokens: 100,
      safetyMarginTokens: 10,
    });
    const input: AgentInputItem[] = [
      userMessage("First old message"),
      assistantMessage("First old response"),
      userMessage("Second old message"),
      assistantMessage("Second old response"),
      userMessage("Current short msg"),
    ];

    const result = manager.prepare(input);

    if (result.wasModified) {
      // Some items removed, but current message preserved
      const resultItems = result.input as AgentInputItem[];
      assert.ok(resultItems.length < input.length);
      assert.ok(resultItems.length >= 1);
      assert.ok(result.finalTokenCount <= result.effectiveLimit);
    } else {
      // If within budget already, that's also valid
      assert.ok(result.originalTokenCount <= result.effectiveLimit);
    }
  });
});

// --- Test 6: Configuration validation ---
describe("ContextManager - configuration validation", () => {
  it("should compute effectiveLimit correctly", () => {
    const manager = createManager({
      maxInputTokens: 272000,
      safetyMarginTokens: 5000,
    });

    assert.equal(manager.effectiveLimit, 267000);
  });

  it("should work with zero safety margin", () => {
    const manager = createManager({
      maxInputTokens: 1000,
      safetyMarginTokens: 0,
    });

    assert.equal(manager.effectiveLimit, 1000);

    const result = manager.prepare("Hello");
    assert.equal(result.effectiveLimit, 1000);
    assert.equal(result.maxInputTokens, 1000);
  });
});

// --- Test 7: Safety margin ---
describe("ContextManager - safety margin", () => {
  it("should enforce effectiveLimit = maxInputTokens - safetyMarginTokens", () => {
    const maxInputTokens = 500;
    const safetyMarginTokens = 50;
    const manager = createManager({ maxInputTokens, safetyMarginTokens });

    const result = manager.prepare("Hello");

    assert.equal(result.effectiveLimit, maxInputTokens - safetyMarginTokens);
    assert.equal(result.maxInputTokens, maxInputTokens);
  });

  it("should reject input that fits maxInputTokens but exceeds effectiveLimit", () => {
    // Create input that is between effectiveLimit and maxInputTokens
    const manager = createManager({
      maxInputTokens: 30,
      safetyMarginTokens: 15,
      // effectiveLimit = 15
    });

    const input: AgentInputItem[] = [
      userMessage("First old message in the conversation"),
      userMessage("Current message"),
    ];

    const result = manager.prepare(input);

    // The original should exceed effectiveLimit (15), triggering truncation
    if (result.originalTokenCount > result.effectiveLimit) {
      assert.equal(result.wasModified, true);
    }
  });
});

// --- Test 8: Very large context ---
describe("ContextManager - very large context", () => {
  it("should terminate safely without infinite loops on very large input", () => {
    const manager = createManager({
      maxInputTokens: 100,
      safetyMarginTokens: 10,
    });

    // Generate a large array of messages
    const items: AgentInputItem[] = [];
    for (let i = 0; i < 200; i++) {
      items.push(userMessage(`Old message number ${i} with some text`));
      items.push(
        assistantMessage(`Response to message ${i} with explanation`),
      );
    }
    items.push(userMessage("Current user message"));

    const start = Date.now();
    const result = manager.prepare(items);
    const elapsed = Date.now() - start;

    // Should complete in reasonable time (under 5 seconds)
    assert.ok(elapsed < 5000, `Took too long: ${elapsed}ms`);
    assert.equal(result.wasModified, true);
    assert.ok(result.removedItems > 0);
    // Current message preserved
    const resultItems = result.input as AgentInputItem[];
    assert.ok(resultItems.length >= 1);
  });

  it("should handle very large string input without hanging", () => {
    const manager = createManager({
      maxInputTokens: 100,
      safetyMarginTokens: 10,
    });

    const longText = generateLongText(5000);

    const start = Date.now();
    const result = manager.prepare(longText);
    const elapsed = Date.now() - start;

    // Should complete quickly — string input cannot be truncated
    assert.ok(elapsed < 5000, `Took too long: ${elapsed}ms`);
    // String input is not modified (single message cannot be split)
    assert.equal(result.wasModified, false);
    assert.equal(result.input, longText);
  });
});

// --- Additional: instructions token counting ---
describe("ContextManager - instructions counted", () => {
  it("should include instructions in token count", () => {
    const manager = createManager({
      maxInputTokens: 10000,
      safetyMarginTokens: 0,
    });

    const instructions =
      "You are a language tutor. Help users learn any language.";
    const input = "Hello";

    const withInstructions = manager.prepare(input, { instructions });
    const withoutInstructions = manager.prepare(input);

    assert.ok(
      withInstructions.originalTokenCount >
        withoutInstructions.originalTokenCount,
    );
  });
});
