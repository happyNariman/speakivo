import type { EvalCase } from "../types.js";

export interface ResponseEvaluationResult {
  passed: boolean;
  failures: string[];
}

export function evaluateResponse(
  evalCase: EvalCase,
  responseText: string,
): ResponseEvaluationResult {
  const failures: string[] = [];
  const respExpectations = evalCase.expectations.response;

  if (!respExpectations) {
    return { passed: true, failures: [] };
  }

  // 1. Non-empty check
  if (respExpectations.nonEmpty && (!responseText || responseText.trim().length === 0)) {
    failures.push("Expected non-empty response, but received empty string");
  }

  const lowerResp = responseText.toLowerCase();

  // 2. Contains substrings
  if (respExpectations.containsSubstrings) {
    for (const sub of respExpectations.containsSubstrings) {
      if (!lowerResp.includes(sub.toLowerCase())) {
        failures.push(`Expected response to contain text '${sub}', but it was not found`);
      }
    }
  }

  // 3. Not contains substrings
  if (respExpectations.notContainsSubstrings) {
    for (const sub of respExpectations.notContainsSubstrings) {
      if (lowerResp.includes(sub.toLowerCase())) {
        failures.push(`Expected response NOT to contain text '${sub}', but it was found`);
      }
    }
  }

  // 4. No raw UUIDs / internal IDs leaked in user-facing message
  if (respExpectations.noRawIds) {
    const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
    if (uuidRegex.test(responseText)) {
      failures.push("Response leaked internal UUID database IDs in user-facing message");
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
