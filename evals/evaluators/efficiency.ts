import type { EvalCase } from "../types.js";

export interface EfficiencyEvaluationResult {
  passed: boolean;
  failures: string[];
}

export function evaluateEfficiency(
  evalCase: EvalCase,
  requests: number,
  totalTokens: number,
): EfficiencyEvaluationResult {
  const failures: string[] = [];
  const effExpectations = evalCase.expectations.efficiency;

  if (!effExpectations) {
    return { passed: true, failures: [] };
  }

  if (effExpectations.maxRequests !== undefined && requests > effExpectations.maxRequests) {
    failures.push(
      `Request count (${requests}) exceeded expected maximum of ${effExpectations.maxRequests}`,
    );
  }

  if (effExpectations.maxTotalTokens !== undefined && totalTokens > effExpectations.maxTotalTokens) {
    failures.push(
      `Total tokens (${totalTokens}) exceeded expected maximum of ${effExpectations.maxTotalTokens}`,
    );
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
