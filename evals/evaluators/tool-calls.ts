import type { EvalCase, CapturedToolCall } from "../types.js";

export const WRITE_TOOLS = new Set([
  "record_learning_mistake",
  "save_vocabulary",
  "update_topic_progress",
  "update_vocabulary_progress",
  "assess_language_level",
  "confirm_language_level",
]);

export interface ToolCallEvaluationResult {
  passed: boolean;
  failures: string[];
  validWrites: number;
  unnecessaryWrites: number;
}

export function evaluateToolCalls(
  evalCase: EvalCase,
  capturedCalls: CapturedToolCall[],
): ToolCallEvaluationResult {
  const failures: string[] = [];
  const toolExpectations = evalCase.expectations.toolCalls;
  const sideEffectExpectations = evalCase.expectations.sideEffects;

  const actualToolNames = capturedCalls.map((c) => c.name);
  const toolCounts: Record<string, number> = {};
  for (const name of actualToolNames) {
    toolCounts[name] = (toolCounts[name] ?? 0) + 1;
  }

  // Calculate valid and unnecessary writes
  const expectedWriteTools = new Set<string>();
  if (toolExpectations?.required) {
    for (const req of toolExpectations.required) {
      if (WRITE_TOOLS.has(req.tool)) {
        expectedWriteTools.add(req.tool);
      }
    }
  }
  if (toolExpectations?.exactCount) {
    for (const [name, count] of Object.entries(toolExpectations.exactCount)) {
      if (WRITE_TOOLS.has(name) && count > 0) {
        expectedWriteTools.add(name);
      }
    }
  }

  const expectNoWrites =
    sideEffectExpectations?.expectNoMutations === true ||
    (toolExpectations?.prohibited &&
      toolExpectations.prohibited.some((t) => WRITE_TOOLS.has(t)));

  let validWrites = 0;
  let unnecessaryWrites = 0;

  for (const call of capturedCalls) {
    if (WRITE_TOOLS.has(call.name)) {
      if (
        sideEffectExpectations?.expectNoMutations === true ||
        toolExpectations?.prohibited?.includes(call.name) ||
        (!expectedWriteTools.has(call.name) &&
          toolExpectations?.required !== undefined)
      ) {
        unnecessaryWrites++;
        failures.push(
          `Unnecessary write tool '${call.name}' was called without learning justification`,
        );
      } else {
        validWrites++;
      }
    }
  }

  if (toolExpectations) {
    // 1. Check prohibited tools (must not be called)
    if (toolExpectations.prohibited) {
      for (const prohibited of toolExpectations.prohibited) {
        if (toolCounts[prohibited] && toolCounts[prohibited] > 0) {
          failures.push(
            `Prohibited tool '${prohibited}' was called ${toolCounts[prohibited]} time(s)`,
          );
        }
      }
    }

    // 2. Check required tools
    if (toolExpectations.required) {
      for (const req of toolExpectations.required) {
        const count = toolCounts[req.tool] ?? 0;

        if (req.count !== undefined && count !== req.count) {
          failures.push(
            `Expected tool '${req.tool}' to be called exactly ${req.count} time(s), but was called ${count} time(s)`,
          );
        } else if (req.minCount !== undefined && count < req.minCount) {
          failures.push(
            `Expected tool '${req.tool}' to be called at least ${req.minCount} time(s), but was called ${count} time(s)`,
          );
        } else if (req.maxCount !== undefined && count > req.maxCount) {
          failures.push(
            `Expected tool '${req.tool}' to be called at most ${req.maxCount} time(s), but was called ${count} time(s)`,
          );
        } else if (
          req.count === undefined &&
          req.minCount === undefined &&
          count === 0
        ) {
          failures.push(
            `Expected required tool '${req.tool}' to be called, but was not called`,
          );
        }
      }
    }

    // 3. Check exact counts map
    if (toolExpectations.exactCount) {
      for (const [toolName, expectedCount] of Object.entries(
        toolExpectations.exactCount,
      )) {
        const actualCount = toolCounts[toolName] ?? 0;
        if (actualCount !== expectedCount) {
          failures.push(
            `Expected tool '${toolName}' to have exact count ${expectedCount}, but was called ${actualCount} time(s)`,
          );
        }
      }
    }
  }

  // Deduplicate failures
  const uniqueFailures = Array.from(new Set(failures));

  return {
    passed: uniqueFailures.length === 0,
    failures: uniqueFailures,
    validWrites,
    unnecessaryWrites,
  };
}
