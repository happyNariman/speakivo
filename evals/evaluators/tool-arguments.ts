import type { EvalCase, CapturedToolCall } from "../types.js";

export interface ToolArgumentsEvaluationResult {
  passed: boolean;
  failures: string[];
}

export function evaluateToolArguments(
  evalCase: EvalCase,
  capturedCalls: CapturedToolCall[],
): ToolArgumentsEvaluationResult {
  const failures: string[] = [];
  const requiredTools = evalCase.expectations.toolCalls?.required ?? [];

  for (const expected of requiredTools) {
    if (!expected.arguments && !expected.argumentSubstrings) {
      continue;
    }

    const matchingCalls = capturedCalls.filter((c) => c.name === expected.tool);
    if (matchingCalls.length === 0) {
      continue; // Tool-calls evaluator already catches missing tool
    }

    let foundMatchingCall = false;

    for (const call of matchingCalls) {
      let callMatches = true;

      // 1. Exact argument field matching
      if (expected.arguments) {
        for (const [key, expectedVal] of Object.entries(expected.arguments)) {
          const actualVal = call.arguments[key];
          if (typeof expectedVal === "object" && expectedVal !== null) {
            if (JSON.stringify(actualVal) !== JSON.stringify(expectedVal)) {
              callMatches = false;
              break;
            }
          } else if (actualVal !== expectedVal) {
            callMatches = false;
            break;
          }
        }
      }

      // 2. Substring matching for text fields (e.g. sourceText contains 'yesterday')
      if (callMatches && expected.argumentSubstrings) {
        for (const [key, expectedSubstring] of Object.entries(
          expected.argumentSubstrings,
        )) {
          const actualVal = call.arguments[key];
          if (
            typeof actualVal !== "string" ||
            !actualVal.toLowerCase().includes(expectedSubstring.toLowerCase())
          ) {
            callMatches = false;
            break;
          }
        }
      }

      if (callMatches) {
        foundMatchingCall = true;
        break;
      }
    }

    if (!foundMatchingCall) {
      failures.push(
        `Tool '${expected.tool}' was called, but arguments did not match expectations. Expected: ${JSON.stringify(
          {
            ...(expected.arguments ?? {}),
            ...(expected.argumentSubstrings
              ? { contains: expected.argumentSubstrings }
              : {}),
          },
        )}. Actual calls: ${JSON.stringify(
          matchingCalls.map((c) => c.arguments),
        )}`,
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
